package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeWorker struct {
	mu      sync.Mutex
	calls   map[string]int
	reports func(string) reply
	login   reply
}

func (backend *fakeWorker) Call(ctx context.Context, action, id string, body json.RawMessage) reply {
	backend.mu.Lock()
	backend.calls[action]++
	backend.mu.Unlock()
	switch action {
	case "challenge":
		return reply{200, []byte(`{"image":"data:image/png;base64,test"}`)}
	case "login":
		if backend.login.Status != 0 {
			return backend.login
		}
		return reply{200, []byte(`{"authenticated":true}`)}
	case "reports":
		if backend.reports != nil {
			return backend.reports(id)
		}
		return reply{200, []byte(`{"attendance":{"data":[]},"marks":{"data":[]}}`)}
	case "prepare":
		return reply{200, []byte(`{"prepared":true}`)}
	default:
		return reply{200, []byte(`{"success":true}`)}
	}
}

func fixture() (*Server, *fakeWorker) {
	backend := &fakeWorker{calls: make(map[string]int)}
	config := Config{Origin: "https://classpro.example", Secure: true, MaxSessions: 4, MaxConcurrent: 2, RatePerMinute: 100, SessionTTL: 30 * time.Minute, ChallengeTTL: 2 * time.Minute, CacheTTL: time.Minute, Timeout: time.Second}
	return NewServer(config, backend), backend
}

func perform(server *Server, method, path, body string, cookie *http.Cookie, origin string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.RemoteAddr = "192.0.2.1:1234"
	request.Header.Set("Origin", origin)
	request.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	return response
}

func loginSession(t *testing.T, server *Server) *http.Cookie {
	t.Helper()
	challenge := perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin)
	if challenge.Code != 200 {
		t.Fatalf("challenge: %d", challenge.Code)
	}
	cookie := challenge.Result().Cookies()[0]
	login := perform(server, "POST", "/api/login/client", `{"account":"student","password":"secret","answer":"ABCD","remember":true}`, cookie, server.config.Origin)
	if login.Code != 200 {
		t.Fatalf("login: %d", login.Code)
	}
	return login.Result().Cookies()[0]
}

func TestHealthIsCheapAndStrict(t *testing.T) {
	server, backend := fixture()
	for _, method := range []string{"GET", "HEAD", "POST"} {
		response := perform(server, method, "/health", "", nil, "")
		want := 200
		if method == "POST" {
			want = 405
		}
		if response.Code != want {
			t.Fatalf("%s: %d", method, response.Code)
		}
		if method == "HEAD" && response.Body.Len() != 0 {
			t.Fatal("HEAD body")
		}
	}
	if len(backend.calls) != 0 || len(server.rates) != 0 || len(server.sessions) != 0 {
		t.Fatal("health touched application state")
	}
}

func TestCSRFAndBodyValidation(t *testing.T) {
	server, backend := fixture()
	for _, origin := range []string{"", "null", "http://classpro.example", "https://classpro.example.evil", "https://classpro.example/"} {
		response := perform(server, "POST", "/api/challenge", `{}`, nil, origin)
		if response.Code != 403 {
			t.Fatalf("accepted origin %q", origin)
		}
	}
	for _, body := range []string{`null`, `[]`, `{`, `{} {}`, `{"unexpected":true}`} {
		if perform(server, "POST", "/api/challenge", body, nil, server.config.Origin).Code != 400 {
			t.Fatal("accepted malformed body")
		}
	}
	if perform(server, "POST", "/api/challenge", strings.Repeat(" ", 8193), nil, server.config.Origin).Code != 413 {
		t.Fatal("body limit missing")
	}
	if len(backend.calls) != 0 {
		t.Fatal("invalid request reached worker")
	}
}

func TestRotationLogoutAndSecureCookies(t *testing.T) {
	server, _ := fixture()
	challenge := perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Result().Cookies()[0]
	response := perform(server, "POST", "/api/login/client", `{"account":"student","password":"secret","answer":"ABCD"}`, challenge, server.config.Origin)
	cookie := response.Result().Cookies()[0]
	if cookie.Value == challenge.Value || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge != 0 {
		t.Fatal("cookie security or rotation failed")
	}
	if strings.Contains(perform(server, "GET", "/api/session", "", challenge, "").Body.String(), "true") {
		t.Fatal("old session token remained valid")
	}
	if perform(server, "DELETE", "/api/session", "", cookie, server.config.Origin).Code != 200 {
		t.Fatal("logout failed")
	}
	if perform(server, "GET", "/api/reports", "", cookie, "").Code != 401 {
		t.Fatal("logout retained reports")
	}
}
