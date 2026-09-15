package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/publicsuffix"
)

const portalOrigin = "https://sp.srmist.edu.in"
const portalLoginPath = "/srmiststudentportal/students/loginManager/youLogin.jsp"
const portalSubmitPath = "/srmiststudentportal/LoginServlet"
const portalShellPath = "/srmiststudentportal/students/template/HRDSystem.jsp"

type directSession struct {
	mu                                              sync.Mutex
	client                                          *http.Client
	base                                            string
	fields                                          url.Values
	nonce, domainField, interactionField, delimiter string
	loaded                                          time.Time
	authenticated                                   bool
}

type directWorker struct {
	mu        sync.Mutex
	sessions  map[string]*directSession
	base      string
	transport http.RoundTripper
}

func newDirectWorker() *directWorker {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxConnsPerHost = 4
	transport.MaxIdleConnsPerHost = 4
	transport.ResponseHeaderTimeout = 25 * time.Second
	return &directWorker{sessions: make(map[string]*directSession), base: portalOrigin, transport: transport}
}

func (backend *directWorker) Call(ctx context.Context, action, id string, payload json.RawMessage) (result reply) {
	started := time.Now()
	defer func() {
		requestID, _ := ctx.Value(requestIDKey{}).(string)
		slog.InfoContext(ctx, "direct_request", "request_id", requestID, "action", action, "status", result.Status, "duration_ms", time.Since(started).Milliseconds())
	}()
	backend.mu.Lock()
	entry := backend.sessions[id]
	if action == "close" {
		delete(backend.sessions, id)
		backend.mu.Unlock()
		return jsonReply(200, map[string]bool{"success": true})
	}
	if entry == nil && action == "challenge" {
		jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
		entry = &directSession{base: backend.base, client: &http.Client{Jar: jar, Transport: backend.transport, Timeout: 30 * time.Second,
			CheckRedirect: func(request *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}}
		backend.sessions[id] = entry
	}
	backend.mu.Unlock()
	if entry == nil {
		return failure(401, "SESSION_EXPIRED", "Load a fresh verification code.")
	}
	entry.mu.Lock()
	defer entry.mu.Unlock()
	if action == "challenge" {
		return entry.challenge(ctx)
	}
	if action == "prepare" {
		return jsonReply(200, map[string]bool{"prepared": !entry.authenticated})
	}
	if action == "login" {
		return entry.login(ctx, payload)
	}
	if action == "reports" {
		return entry.reports(ctx)
	}
	return failure(404, "NOT_FOUND", "Unknown action.")
}

func jsonReply(status int, value any) reply {
	body, err := json.Marshal(value)
	if err != nil {
		return unavailable()
	}
	return reply{status, body}
}

func (entry *directSession) request(ctx context.Context, method, target string, fields url.Values, headers http.Header) ([]byte, *http.Response, error) {
	base, _ := url.Parse(entry.base)
	address, err := base.Parse(target)
	if err != nil || address.Scheme != base.Scheme || address.Host != base.Host || address.User != nil {
		return nil, nil, errors.New("foreign portal URL")
	}
	for redirect := 0; redirect < 6; redirect++ {
		body := ""
		if fields != nil {
			body = fields.Encode()
		}
		request, err := http.NewRequestWithContext(ctx, method, address.String(), strings.NewReader(body))
		if err != nil {
			return nil, nil, err
		}
		request.Header.Set("User-Agent", "ClassPro/1.0 (Student Portal HTTP client)")
		request.Header.Set("Accept", "text/html,application/xhtml+xml")
		request.Header.Set("Referer", entry.base+portalLoginPath)
		if method == "POST" {
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			request.Header.Set("Origin", entry.base)
		}
		for key, values := range headers {
			request.Header[key] = values
		}
		response, err := entry.client.Do(request)
		if err != nil {
			return nil, nil, err
		}
		data, readErr := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
		response.Body.Close()
		if readErr != nil || len(data) > 2*1024*1024 {
			return nil, response, errors.New("portal response too large or interrupted")
		}
		if response.StatusCode < 300 || response.StatusCode > 399 {
			return data, response, nil
		}
		next, err := address.Parse(response.Header.Get("Location"))
		if err != nil || next.Scheme != base.Scheme || next.Host != base.Host || next.User != nil {
			return nil, response, errors.New("foreign portal redirect")
		}
		address = next
		if response.StatusCode == 301 || response.StatusCode == 302 || response.StatusCode == 303 {
			method, fields = "GET", nil
		}
	}
	return nil, nil, errors.New("portal redirect limit")
}
