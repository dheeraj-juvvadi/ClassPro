package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

type httpAuth struct {
	codec                    *stateCodec
	transport                http.RoundTripper
	portalBase, academiaBase string
}

type authInput struct {
	Provider  string               `json:"provider"`
	Account   string               `json:"account"`
	Password  string               `json:"password"`
	Answer    string               `json:"answer"`
	Remember  bool                 `json:"remember"`
	Telemetry json.RawMessage      `json:"telemetry"`
	Integrity *credentialIntegrity `json:"integrity,omitempty"`
}

func newHTTPAuth(codec *stateCodec) *httpAuth {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxConnsPerHost = 8
	transport.MaxIdleConnsPerHost = 4
	transport.ResponseHeaderTimeout = 25 * time.Second
	return &httpAuth{codec, transport, portalOrigin, "https://academia.srmist.edu.in"}
}

func (auth *httpAuth) entry(state *clientState) (*directSession, *transientJar) {
	jar := restoreJar(state.Cookies)
	base := auth.portalBase
	if state.Provider == "academia" {
		base = auth.academiaBase
	}
	entry := &directSession{base: base, client: &http.Client{Jar: jar, Transport: auth.transport, Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		fields: state.Fields, nonce: state.Nonce, domainField: state.DomainField, interactionField: state.InteractionField,
		delimiter: state.Delimiter, loaded: state.Loaded, authenticated: state.Authenticated}
	return entry, jar
}

func (server *Server) statelessRoute(writer http.ResponseWriter, request *http.Request) {
	auth := server.httpAuth
	methods := map[string]string{"/api/session": "GET, DELETE", "/api/challenge": "POST", "/api/login/client": "POST", "/api/reports": "GET"}
	allowed, exists := methods[request.URL.Path]
	if !exists {
		send(writer, failure(404, "NOT_FOUND", "Unknown action."))
		return
	}
	if !strings.Contains(", "+allowed+", ", ", "+request.Method+", ") {
		writer.Header().Set("Allow", allowed)
		send(writer, failure(405, "METHOD_NOT_ALLOWED", "Method not allowed."))
		return
	}
	state, stateErr := auth.codec.read(request)
	if request.Method == "DELETE" {
		auth.codec.clear(writer)
		server.clearCookie(writer)
		send(writer, jsonReply(200, map[string]bool{"success": true}))
		return
	}
	if request.URL.Path == "/api/session" {
		if stateErr != nil {
			auth.codec.clear(writer)
		}
		provider := "academia"
		if state != nil {
			provider = state.Provider
		}
		send(writer, jsonReply(200, map[string]any{"authenticated": stateErr == nil && state.Authenticated, "provider": provider, "authMode": "http"}))
		return
	}
	var input authInput
	if request.Method == "POST" {
		decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 8192))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
			send(writer, failure(400, "INVALID_REQUEST", "Check your sign-in details."))
			return
		}
		if input.Provider == "" {
			input.Provider = "portal"
		}
		if input.Provider != "portal" && input.Provider != "academia" {
			send(writer, failure(400, "INVALID_REQUEST", "Choose a supported login provider."))
			return
		}
		if request.URL.Path == "/api/login/client" && (strings.TrimSpace(input.Account) == "" || input.Password == "" || len(input.Account) > 256 || len(input.Password) > 256 || (input.Answer != "" && !answerPattern.MatchString(input.Answer))) {
			send(writer, failure(400, "INVALID_REQUEST", "Check your sign-in details."))
			return
		}
		if input.Integrity != nil {
			body, _ := json.Marshal(input)
			checks := checkCredentialIntegrity(body)
			if !validIntegrity(*input.Integrity) || !checks["account_match"] || !checks["password_match"] || !checks["answer_match"] {
				send(writer, failure(400, "INTEGRITY_MISMATCH", "Sign-in data changed. Reload and retry."))
				return
			}
		}
	}
	if !server.acquire() {
		send(writer, failure(503, "CAPACITY", "SRM is busy. Please retry shortly."))
		return
	}
	defer func() { <-server.slots }()
	ctx, cancel := context.WithTimeout(request.Context(), server.config.Timeout)
	defer cancel()
	if request.URL.Path == "/api/challenge" {
		state = &clientState{Provider: input.Provider, Expires: time.Now().Add(2 * time.Minute).Unix()}
		entry, jar := auth.entry(state)
		result := jsonReply(200, map[string]bool{"required": false})
		if state.Provider == "portal" {
			result = entry.challenge(ctx)
		}
		auth.finish(writer, state, entry, jar, result)
		return
	}
	if stateErr != nil || (request.Method == "POST" && state.Provider != input.Provider) {
		auth.codec.clear(writer)
		send(writer, failure(401, "SESSION_EXPIRED", "Start a new sign-in."))
		return
	}
	entry, jar := auth.entry(state)
	var result reply
	if request.URL.Path == "/api/reports" {
		if !state.Authenticated {
			send(writer, failure(401, "SESSION_EXPIRED", "Please sign in."))
			return
		}
		if state.Provider == "academia" {
			result = entry.academiaReports(ctx)
		} else {
			result = entry.reports(ctx)
		}
	} else {
		state.Remember = input.Remember
		if state.Authenticated {
			result = jsonReply(200, map[string]bool{"authenticated": true})
		} else if state.Provider == "academia" {
			result = entry.academiaLogin(ctx, input, state)
		} else {
			result = entry.protocolLogin(ctx, input)
		}
		if entry.authenticated && !state.Authenticated {
			state.Expires = time.Now().Add(8 * time.Hour).Unix()
		}
	}
	auth.finish(writer, state, entry, jar, result)
}

func (auth *httpAuth) finish(writer http.ResponseWriter, state *clientState, entry *directSession, jar *transientJar, result reply) {
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(result.Body, &body)
	if result.Status == 401 && body.Error.Code != "CAPTCHA_REQUIRED" && body.Error.Code != "CAPTCHA_INVALID" {
		auth.codec.clear(writer)
		send(writer, result)
		return
	}
	state.Authenticated = entry.authenticated
	state.Cookies = jar.snapshot()
	state.Fields, state.Nonce, state.DomainField = entry.fields, entry.nonce, entry.domainField
	state.InteractionField, state.Delimiter, state.Loaded = entry.interactionField, entry.delimiter, entry.loaded
	if state.Authenticated {
		state.Fields = nil
		state.Nonce, state.DomainField, state.InteractionField, state.Delimiter, state.Digest = "", "", "", "", ""
	}
	if err := auth.codec.write(writer, state); err != nil {
		auth.codec.clear(writer)
		send(writer, failure(502, "SESSION_UNAVAILABLE", "SRM session could not be saved. Please retry."))
		return
	}
	send(writer, result)
}
