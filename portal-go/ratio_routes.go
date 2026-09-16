package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func validRatioPayload(path string, payload []byte) bool {
	var input authInput
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || input.Provider != "portal" {
		return false
	}
	if path == "/api/challenge" {
		return input.Account == "" && input.Password == ""
	}
	if path != "/api/login/client" {
		return false
	}
	if strings.TrimSpace(input.Account) == "" || input.Password == "" || len(input.Account) > 256 || len(input.Password) > 256 {
		return false
	}
	return (input.Answer == "" || answerPattern.MatchString(input.Answer)) && (input.Integrity == nil || validIntegrity(*input.Integrity))
}

func (server *Server) ratioDispatch(writer http.ResponseWriter, request *http.Request) bool {
	if request.Method == "POST" {
		payload, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, 8192))
		if err != nil {
			send(writer, failure(413, "INVALID_REQUEST", "Request is too large."))
			return true
		}
		request.Body = io.NopCloser(bytes.NewReader(payload))
		var input authInput
		if json.Unmarshal(payload, &input) != nil {
			return false
		}
		if input.Provider != "portal" {
			if request.URL.Path == "/api/challenge" && input.Provider == "academia" {
				server.mu.Lock()
				entry := server.lookup(request)
				if entry != nil && entry.busy {
					server.mu.Unlock()
					send(writer, failure(409, "BUSY", "Wait for your current request."))
					return true
				}
				if entry != nil {
					delete(server.sessions, entry.token)
				}
				server.mu.Unlock()
				if entry != nil {
					_ = server.call("close", entry, nil)
				}
				server.clearCookie(writer)
			}
			return false
		}
		server.httpAuth.codec.clear(writer)
		server.route(writer, request)
		return true
	}
	if request.URL.Path == "/api/session" || request.URL.Path == "/api/reports" {
		_, err := request.Cookie(cookieName)
		if err == nil {
			if request.Method == "DELETE" {
				server.httpAuth.codec.clear(writer)
			}
			server.route(writer, request)
			return true
		}
		if request.URL.Path == "/api/session" && request.Method == "GET" {
			if _, err := server.httpAuth.codec.read(request); err != nil {
				send(writer, jsonReply(200, map[string]any{"authenticated": false, "provider": "portal", "authMode": "http", "serverAuto": true}))
				return true
			}
		}
	}
	return false
}
