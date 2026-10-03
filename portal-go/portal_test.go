package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestPortalOpaqueSessionLifecycle(t *testing.T) {
	server, backend := fixture()
	server.httpAuth = newHTTPAuth(testCodec(t))
	server.portalAdapter = true
	challenge := stateCall(server, "POST", "/api/challenge", `{"provider":"portal"}`, nil)
	if challenge.Code != 200 {
		t.Fatalf("challenge: %d", challenge.Code)
	}
	var opaque string
	for _, cookie := range challenge.Result().Cookies() {
		if cookie.MaxAge >= 0 && cookie.Name != cookieName {
			t.Fatal("issued state-bearing cookie")
		}
		if cookie.Name == cookieName {
			opaque = cookie.Value
		}
	}
	login := stateCall(server, "POST", "/api/login/client", `{"provider":"portal","account":"user","password":"pass","answer":""}`, challenge)
	if login.Code != 200 {
		t.Fatalf("login: %d %s", login.Code, login.Body)
	}
	for _, cookie := range login.Result().Cookies() {
		if cookie.Name == cookieName && cookie.Value == opaque {
			t.Fatal("token not rotated")
		}
	}
	status := stateCall(server, "GET", "/api/session", "", login)
	if !strings.Contains(status.Body.String(), `"authenticated":true`) {
		t.Fatal("session missing")
	}
	logout := stateCall(server, "DELETE", "/api/session", "", login)
	if logout.Code != http.StatusOK || len(server.sessions) != 0 || backend.calls["close"] != 1 {
		t.Fatal("session not closed")
	}
}

func TestPortalRejectsUnverifiedSuccess(t *testing.T) {
	result := portalReply("login", 200, json.RawMessage(`{"authenticated":true,"attendanceHTML":"login page"}`))
	if result.Status == 200 {
		t.Fatal("accepted unverifiable upstream success")
	}
}

func TestPortalInputValidation(t *testing.T) {
	for _, payload := range []string{
		`{"provider":"portal","account":"user","password":"pass","answer":"!"}`,
		`{"provider":"portal","account":"user","password":"pass","extra":"bad"}`,
		`{"provider":"academia","account":"user","password":"pass"}`,
	} {
		if validPortalPayload("/api/login/client", []byte(payload)) {
			t.Fatal("invalid request accepted")
		}
	}
}

func TestPortalCapacityIsOurServerNotSRM(t *testing.T) {
	server, backend := fixture()
	server.httpAuth = newHTTPAuth(testCodec(t))
	server.portalAdapter = true
	for server.acquire() {
	}
	response := stateCall(server, "POST", "/api/challenge", `{"provider":"portal"}`, nil)
	if response.Code != 503 || !strings.Contains(response.Body.String(), `"SERVER_BUSY"`) || response.Header().Get("Retry-After") != "2" {
		t.Fatalf("unexpected capacity response: %d %s", response.Code, response.Body)
	}
	if backend.calls["challenge"] != 0 {
		t.Fatal("busy request reached upstream")
	}
}
