package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var answerPattern = regexp.MustCompile(`^[A-Za-z0-9]{4,8}$`)

func (server *Server) route(writer http.ResponseWriter, request *http.Request) {
	allowed := map[string]string{"/api/session": "GET, DELETE", "/api/challenge": "POST", "/api/challenge/prepare": "POST", "/api/login/client": "POST", "/api/reports": "GET"}
	methods, exists := allowed[request.URL.Path]
	if !exists {
		send(writer, failure(404, "NOT_FOUND", "Unknown action."))
		return
	}
	validMethod := false
	for _, method := range strings.Split(methods, ", ") {
		if method == request.Method {
			validMethod = true
		}
	}
	if !validMethod {
		writer.Header().Set("Allow", methods)
		send(writer, failure(405, "METHOD_NOT_ALLOWED", "Method not allowed."))
		return
	}
	var payload []byte
	if request.Method == "POST" {
		var err error
		payload, err = io.ReadAll(http.MaxBytesReader(writer, request.Body, 8192))
		if err != nil {
			send(writer, failure(413, "INVALID_REQUEST", "Request is too large."))
			return
		}
		if !validPayload(request.URL.Path, payload) {
			send(writer, failure(400, "INVALID_REQUEST", "Check your sign-in details and try again."))
			return
		}
		if request.URL.Path == "/api/login/client" {
			integrity := checkCredentialIntegrity(payload)
			requestID, _ := request.Context().Value(requestIDKey{}).(string)
			slog.Info("credential_integrity", "stage", "render_ingress", "request_id", requestID, "checks", integrity)
			if integrity["provided"] && (!integrity["account_match"] || !integrity["password_match"] || !integrity["answer_match"]) {
				send(writer, failure(400, "INTEGRITY_MISMATCH", "Sign-in data changed in transit. Please reload and retry."))
				return
			}
		}
	}
	if request.URL.Path == "/api/challenge" {
		server.reclaimExpired()
	}
	server.mu.Lock()
	entry := server.lookup(request)
	if request.URL.Path == "/api/session" && request.Method == "GET" {
		authenticated := entry != nil && entry.authenticated
		server.mu.Unlock()
		body, _ := json.Marshal(map[string]bool{"authenticated": authenticated})
		send(writer, reply{200, body})
		return
	}
	if request.URL.Path == "/api/reports" {
		server.reports(writer, request, entry)
		return
	}
	if request.Method == "DELETE" && entry == nil {
		server.mu.Unlock()
		server.clearCookie(writer)
		send(writer, reply{200, []byte(`{"success":true}`)})
		return
	}
	if request.URL.Path == "/api/challenge" && entry != nil && entry.authenticated {
		server.mu.Unlock()
		send(writer, reply{200, []byte(`{"authenticated":true}`)})
		return
	}
	if entry != nil && entry.busy {
		server.mu.Unlock()
		send(writer, failure(409, "BUSY", "A request is already in progress."))
		return
	}
	if entry == nil && request.URL.Path != "/api/challenge" {
		server.mu.Unlock()
		send(writer, failure(401, "SESSION_EXPIRED", "Sign in with your NetID and password."))
		return
	}
	if entry == nil && len(server.sessions) >= server.config.MaxSessions {
		server.mu.Unlock()
		send(writer, failure(503, "CAPACITY", "Login capacity is full. Try again shortly."))
		return
	}
	if !server.acquire() {
		server.mu.Unlock()
		send(writer, failure(503, "CAPACITY", "Student Portal is busy. Try again shortly."))
		return
	}
	if entry == nil {
		entry = &session{id: randomID(), token: randomID(), expires: time.Now().Add(server.config.ChallengeTTL)}
		server.sessions[entry.token] = entry
	}
	entry.busy = true
	server.mu.Unlock()
	server.mutate(writer, request, entry, payload)
}

func validPayload(path string, payload []byte) bool {
	var fields map[string]json.RawMessage
	if json.Unmarshal(payload, &fields) != nil || fields == nil {
		return false
	}
	var account, password, answer string
	if path == "/api/challenge" {
		return len(fields) == 0
	}
	if json.Unmarshal(fields["answer"], &answer) != nil || !answerPattern.MatchString(answer) {
		return false
	}
	if path == "/api/challenge/prepare" {
		return len(fields) == 1
	}
	if json.Unmarshal(fields["account"], &account) != nil || json.Unmarshal(fields["password"], &password) != nil {
		return false
	}
	if strings.TrimSpace(account) == "" || strings.TrimSpace(password) == "" || len(account) > 256 || len(password) > 256 {
		return false
	}
	for key := range fields {
		if key != "account" && key != "password" && key != "answer" && key != "remember" && key != "integrity" {
			return false
		}
	}
	if value, exists := fields["integrity"]; exists {
		var proof credentialIntegrity
		if json.Unmarshal(value, &proof) != nil || !validIntegrity(proof) {
			return false
		}
	}
	if value, exists := fields["remember"]; exists {
		var remember bool
		if string(value) == "null" || json.Unmarshal(value, &remember) != nil {
			return false
		}
	}
	return true
}
