package main

import (
	"net/http"
	"sync"
	"testing"
	"time"
)

// poolFixture builds the server with the pool limits already in place. NewServer
// sizes the slot channel from config, so these cannot be changed afterwards.
func poolFixture(maxConcurrent, maxQueued int, wait time.Duration) (*Server, *fakeWorker) {
	backend := &fakeWorker{calls: make(map[string]int)}
	config := Config{
		Origin: "https://anon.example", Secure: true,
		MaxSessions: 8, MaxConcurrent: maxConcurrent, MaxQueued: maxQueued,
		QueueWait: wait, RatePerMinute: 1000,
		SessionTTL: 30 * time.Minute, ChallengeTTL: 2 * time.Minute, CacheTTL: time.Minute,
		Timeout: time.Second,
	}
	return NewServer(config, backend), backend
}

func queuedCallers(server *Server) int {
	server.queueMu.Lock()
	defer server.queueMu.Unlock()
	return server.waiting
}

// The pool must delay a caller that arrives while every slot is busy, rather than
// failing it outright. This is the behaviour that removes capacity 503s at load.
func TestPoolQueuesInsteadOfRejecting(t *testing.T) {
	server, backend := poolFixture(1, 8, 5*time.Second)
	sessions := []*http.Cookie{loginSession(t, server), loginSession(t, server), loginSession(t, server)}

	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	backend.reports = func(string) reply {
		once.Do(func() { close(started) })
		<-release
		return reply{200, []byte(`{"attendance":{"data":[]},"marks":{"data":[]}}`)}
	}

	codes := make(chan int, len(sessions))
	for _, cookie := range sessions {
		go func(cookie *http.Cookie) {
			codes <- perform(server, "GET", "/api/reports", "", cookie, server.config.Origin).Code
		}(cookie)
	}
	<-started
	// Wait until the remaining callers are genuinely parked on the queue. Without
	// this they can race past the release and never exercise the wait path.
	deadline := time.Now().Add(3 * time.Second)
	for queuedCallers(server) != len(sessions)-1 {
		if time.Now().After(deadline) {
			t.Fatalf("expected %d queued callers, saw %d", len(sessions)-1, queuedCallers(server))
		}
		time.Sleep(time.Millisecond)
	}
	close(release)
	for index := 0; index < len(sessions); index++ {
		if code := <-codes; code != 200 {
			t.Fatalf("request %d returned %d, want 200 from the queue", index, code)
		}
	}
}
