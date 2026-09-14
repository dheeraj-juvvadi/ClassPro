package main

import (
	"net"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReportCoalescingAndUserIsolation(t *testing.T) {
	server, backend := fixture()
	first, second := loginSession(t, server), loginSession(t, server)
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	backend.reports = func(id string) reply {
		once.Do(func() { close(started) })
		<-release
		return reply{200, []byte(`{"attendance":{"data":[{"owner":"` + id + `"}]},"marks":{"data":[]}}`)}
	}
	results := make(chan string, 8)
	for index := 0; index < 8; index++ {
		go func() { results <- perform(server, "GET", "/api/reports", "", first, "").Body.String() }()
	}
	<-started
	close(release)
	var firstBody string
	for index := 0; index < 8; index++ {
		body := <-results
		if firstBody != "" && body != firstBody {
			t.Fatal("inconsistent coalesced response")
		}
		firstBody = body
	}
	backend.mu.Lock()
	calls := backend.calls["reports"]
	backend.mu.Unlock()
	if calls != 1 {
		t.Fatalf("expected 1 report fetch, got %d", calls)
	}
	secondBody := perform(server, "GET", "/api/reports", "", second, "").Body.String()
	if firstBody == secondBody {
		t.Fatal("reports crossed users")
	}
	server.mu.Lock()
	server.sessions[first.Value].cachedAt = time.Now().Add(-2 * time.Minute)
	server.mu.Unlock()
	perform(server, "GET", "/api/reports", "", first, "")
	backend.mu.Lock()
	calls = backend.calls["reports"]
	backend.mu.Unlock()
	if calls != 3 {
		t.Fatal("expired cache reused")
	}
}

func TestPartialFailuresAreNotCached(t *testing.T) {
	server, backend := fixture()
	cookie := loginSession(t, server)
	backend.reports = func(string) reply {
		return reply{200, []byte(`{"attendance":{"data":[],"error":{"code":"FAIL"}},"marks":{"data":[]}}`)}
	}
	perform(server, "GET", "/api/reports", "", cookie, "")
	perform(server, "GET", "/api/reports", "", cookie, "")
	if backend.calls["reports"] != 2 {
		t.Fatal("partial failure cached")
	}
}

func TestRateLimitDoesNotTrustSpoofedForwarding(t *testing.T) {
	server, _ := fixture()
	server.config.RatePerMinute = 1
	for index, forwarded := range []string{"1.1.1.1", "8.8.8.8"} {
		request := httptest.NewRequest("GET", "/api/session", nil)
		request.RemoteAddr = "192.0.2.5:1234"
		request.Header.Set("X-Forwarded-For", forwarded)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if index == 1 && response.Code != 429 {
			t.Fatal("spoofed XFF bypassed limit")
		}
	}
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	server.config.TrustedProxies = []*net.IPNet{network}
	request := httptest.NewRequest("GET", "/api/session", nil)
	request.RemoteAddr = "10.0.0.1:1234"
	request.Header.Set("X-Forwarded-For", "1.1.1.1, 192.0.2.9, 10.0.0.2")
	if server.clientIP(request) != "192.0.2.9" {
		t.Fatal("did not select nearest untrusted peer")
	}
}

func TestLimitsAndAllowlist(t *testing.T) {
	server, backend := fixture()
	server.config.MaxSessions = 1
	perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin)
	if perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Code != 503 {
		t.Fatal("session cap missing")
	}
	if perform(server, "GET", "/api/login", "", nil, "").Code != 404 {
		t.Fatal("unapproved route exposed")
	}
	if perform(server, "POST", "/api/reports", `{}`, nil, server.config.Origin).Code != 405 {
		t.Fatal("unexpected method accepted")
	}
	if backend.calls["challenge"] != 1 {
		t.Fatal("capacity request reached worker")
	}
	server, _ = fixture()
	server.slots <- struct{}{}
	server.slots <- struct{}{}
	if perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Code != 503 {
		t.Fatal("concurrency cap missing")
	}
}

func TestFailedLoginNeverAuthenticates(t *testing.T) {
	server, backend := fixture()
	backend.login = unavailable()
	cookie := perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Result().Cookies()[0]
	response := perform(server, "POST", "/api/login/client", `{"account":"student","password":"secret","answer":"ABCD"}`, cookie, server.config.Origin)
	if response.Code != 502 || strings.Contains(response.Body.String(), "secret") {
		t.Fatal("unsafe failed login response")
	}
	if len(server.sessions) != 0 {
		t.Fatal("failed login retained session")
	}
}

func TestExpiredCapacityReclaimedAndRatesPruned(t *testing.T) {
	server, backend := fixture()
	server.config.MaxSessions = 1
	cookie := perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Result().Cookies()[0]
	server.sessions[cookie.Value].expires = time.Now().Add(-time.Second)
	if perform(server, "POST", "/api/challenge", `{}`, nil, server.config.Origin).Code != 200 { t.Fatal("expired capacity not reclaimed") }
	if backend.calls["close"] != 1 || len(server.sessions) != 1 { t.Fatal("expired worker not closed") }
	for index := 0; index < 4096; index++ { server.rates[string(rune(index))] = rate{until: time.Now().Add(-time.Second)} }
	if !server.allowRate("new-client") { t.Fatal("expired rate entries blocked new client") }
	if len(server.rates) > 2 { t.Fatal("rate map not pruned") }
}
