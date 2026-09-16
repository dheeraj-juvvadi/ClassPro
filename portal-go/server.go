package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

const cookieName = "classpro_go_session"

type flight struct {
	done   chan struct{}
	result reply
}

type session struct {
	id, token                       string
	authenticated, persistent, busy bool
	expires, cachedAt               time.Time
	cache                           *reply
	inflight                        *flight
}

type rate struct {
	count int
	until time.Time
}

type Server struct {
	ratio    bool
	httpAuth *httpAuth
	config   Config
	worker   worker
	mu       sync.Mutex
	sessions map[string]*session
	rates    map[string]rate
	slots    chan struct{}
	static   http.Handler
}

func NewServer(config Config, backend worker) *Server {
	server := &Server{config: config, worker: backend, sessions: make(map[string]*session), rates: make(map[string]rate), slots: make(chan struct{}, config.MaxConcurrent)}
	if config.StaticDir != "" {
		server.static = http.FileServer(http.Dir(config.StaticDir))
	}
	return server
}

func (server *Server) lookup(request *http.Request) *session {
	cookie, err := request.Cookie(cookieName)
	if err != nil || len(cookie.Value) != 64 {
		return nil
	}
	entry := server.sessions[cookie.Value]
	if entry == nil || time.Now().After(entry.expires) {
		return nil
	}
	return entry
}

func (server *Server) cookie(writer http.ResponseWriter, entry *session) {
	value := &http.Cookie{Name: cookieName, Value: entry.token, HttpOnly: true, Secure: server.config.Secure, SameSite: http.SameSiteStrictMode, Path: "/"}
	if entry.persistent || !entry.authenticated {
		value.MaxAge = max(1, int(time.Until(entry.expires).Seconds()))
	}
	http.SetCookie(writer, value)
}

func (server *Server) clearCookie(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{Name: cookieName, Value: "", MaxAge: -1, Path: "/", HttpOnly: true, Secure: server.config.Secure, SameSite: http.SameSiteStrictMode})
}

func randomID() string {
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		panic("secure randomness unavailable")
	}
	return hex.EncodeToString(token[:])
}

func (server *Server) acquire() bool {
	select {
	case server.slots <- struct{}{}:
		return true
	default:
		return false
	}
}

func (server *Server) call(action string, entry *session, payload []byte) reply {
	return server.callContext(context.Background(), action, entry, payload)
}

func (server *Server) callContext(parent context.Context, action string, entry *session, payload []byte) reply {
	timeout := server.config.Timeout
	if action == "close" {
		timeout = min(timeout, 4*time.Second)
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	return server.worker.Call(ctx, action, entry.id, payload)
}

func (server *Server) Reap(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			server.mu.Lock()
			for key, value := range server.rates {
				if now.After(value.until) {
					delete(server.rates, key)
				}
			}
			for id, entry := range server.sessions {
				if !entry.busy && now.After(entry.expires) && server.acquire() {
					entry.busy = true
					go func(token string, expired *session) {
						_ = server.call("close", expired, nil)
						server.mu.Lock()
						delete(server.sessions, token)
						server.mu.Unlock()
						<-server.slots
					}(id, entry)
				}
			}
			server.mu.Unlock()
		}
	}
}

func (server *Server) reclaimExpired() {
	server.mu.Lock()
	if len(server.sessions) < server.config.MaxSessions {
		server.mu.Unlock()
		return
	}
	for token, entry := range server.sessions {
		if !entry.busy && time.Now().After(entry.expires) && server.acquire() {
			entry.busy = true
			server.mu.Unlock()
			_ = server.call("close", entry, nil)
			server.mu.Lock()
			delete(server.sessions, token)
			server.mu.Unlock()
			<-server.slots
			return
		}
	}
	server.mu.Unlock()
}
