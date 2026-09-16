package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

func (server *Server) mutate(writer http.ResponseWriter, request *http.Request, entry *session, payload []byte) {
	defer func() { <-server.slots }()
	action := map[string]string{"/api/challenge": "challenge", "/api/challenge/prepare": "prepare", "/api/login/client": "login", "/api/session": "close"}[request.URL.Path]
	response := server.callContext(request.Context(), action, entry, payload)
	var result struct {
		Authenticated bool `json:"authenticated"`
	}
	_ = json.Unmarshal(response.Body, &result)
	if action == "login" && response.Status == 200 && !result.Authenticated {
		response = unavailable()
	}
	server.mu.Lock()
	entry.busy = false
	remove := action == "close" || (action == "challenge" && response.Status != 200) || (action == "login" && response.Status != 200) || response.Status == 401
	if remove {
		delete(server.sessions, entry.token)
		server.clearCookie(writer)
	} else if response.Status == 200 {
		switch action {
		case "challenge":
			entry.expires = time.Now().Add(server.config.ChallengeTTL)
		case "login":
			var input struct {
				Remember bool `json:"remember"`
			}
			_ = json.Unmarshal(payload, &input)
			delete(server.sessions, entry.token)
			entry.token = randomID()
			entry.authenticated, entry.persistent = true, input.Remember
			entry.expires = time.Now().Add(server.config.SessionTTL)
			server.sessions[entry.token] = entry
		}
		server.cookie(writer, entry)
	}
	server.mu.Unlock()
	if remove && action != "close" {
		_ = server.call("close", entry, nil)
	}
	send(writer, response)
}

func (server *Server) reports(writer http.ResponseWriter, request *http.Request, entry *session) {
	if entry == nil || !entry.authenticated {
		server.mu.Unlock()
		send(writer, failure(401, "SESSION_EXPIRED", "Sign in with your NetID and password."))
		return
	}
	if entry.cache != nil && time.Since(entry.cachedAt) < server.config.CacheTTL {
		response := *entry.cache
		server.cookie(writer, entry)
		server.mu.Unlock()
		send(writer, response)
		return
	}
	if pending := entry.inflight; pending != nil {
		server.mu.Unlock()
		select {
		case <-request.Context().Done():
			return
		case <-pending.done:
		}
		server.mu.Lock()
		if server.sessions[entry.token] == entry {
			server.cookie(writer, entry)
		}
		server.mu.Unlock()
		send(writer, pending.result)
		return
	}
	if entry.busy {
		server.mu.Unlock()
		send(writer, failure(409, "BUSY", "A request is already in progress."))
		return
	}
	if !server.acquire() {
		server.mu.Unlock()
		send(writer, failure(503, "CAPACITY", "Student Portal is busy. Try again shortly."))
		return
	}
	pending := &flight{done: make(chan struct{})}
	entry.busy, entry.inflight = true, pending
	server.mu.Unlock()
	response := server.callContext(context.WithoutCancel(request.Context()), "reports", entry, nil)
	server.mu.Lock()
	entry.busy, entry.inflight = false, nil
	if response.Status == 200 {
		entry.expires = time.Now().Add(server.config.SessionTTL)
		if cacheable(response.Body) {
			entry.cache, entry.cachedAt = &response, time.Now()
		}
		server.cookie(writer, entry)
	} else if response.Status == 401 {
		delete(server.sessions, entry.token)
		server.clearCookie(writer)
	}
	pending.result = response
	close(pending.done)
	server.mu.Unlock()
	<-server.slots
	if server.ratio && response.Status == 401 {
		_ = server.call("close", entry, nil)
	}
	send(writer, response)
}

func cacheable(body []byte) bool {
	var result struct {
		Attendance *struct {
			Error json.RawMessage `json:"error"`
			Data  json.RawMessage `json:"data"`
		} `json:"attendance"`
		Marks *struct {
			Error json.RawMessage `json:"error"`
			Data  []struct {
				DetailsError string `json:"detailsError"`
			} `json:"data"`
		} `json:"marks"`
	}
	if json.Unmarshal(body, &result) != nil || result.Attendance == nil || result.Marks == nil {
		return false
	}
	if len(result.Attendance.Error) > 0 || len(result.Marks.Error) > 0 || len(result.Attendance.Data) == 0 {
		return false
	}
	for _, mark := range result.Marks.Data {
		if mark.DetailsError != "" {
			return false
		}
	}
	return true
}
