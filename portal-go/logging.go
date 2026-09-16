package main

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type requestIDKey struct{}

var diagnosticID = regexp.MustCompile(`^[a-f0-9-]{36}$`)

func safeDiagnosticID(value string) string {
	if diagnosticID.MatchString(value) {
		return value
	}
	return ""
}

type responseLog struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (response *responseLog) WriteHeader(status int) {
	if response.status != 0 {
		return
	}
	response.status = status
	response.ResponseWriter.WriteHeader(status)
}

func (response *responseLog) Write(data []byte) (int, error) {
	if response.status == 0 {
		response.WriteHeader(http.StatusOK)
	}
	written, err := response.ResponseWriter.Write(data)
	response.bytes += written
	return written, err
}

func (response *responseLog) Unwrap() http.ResponseWriter { return response.ResponseWriter }

func logRoute(path string) string {
	switch path {
	case "/health", "/api/session", "/api/challenge", "/api/challenge/prepare", "/api/login/client", "/api/reports":
		return path
	}
	if strings.HasPrefix(path, "/api/") {
		return "unknown_api"
	}
	return "static"
}

func observeRequests(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		clientTrace := safeDiagnosticID(request.Header.Get("X-Client-Trace"))
		loginMode := request.Header.Get("X-Login-Mode")
		if loginMode != "manual" && loginMode != "automatic" {
			loginMode = "unknown"
		}
		requestID := randomID()
		writer.Header().Set("X-Request-ID", requestID)
		response := &responseLog{ResponseWriter: writer}
		ctx := context.WithValue(request.Context(), requestIDKey{}, requestID)
		defer func() {
			if recover() != nil {
				logger.Error("request_panic", "request_id", requestID)
				if response.status == 0 {
					http.Error(response, "Internal server error", http.StatusInternalServerError)
				}
			}
			if response.status == 0 {
				response.status = http.StatusOK
			}
			if request.URL.Path == "/health" && response.status == http.StatusOK {
				return
			}
			level := slog.LevelInfo
			if response.status >= 500 {
				level = slog.LevelError
			} else if response.status >= 400 {
				level = slog.LevelWarn
			}
			method := request.Method
			switch method {
			case "GET", "POST", "DELETE", "HEAD", "OPTIONS":
			default:
				method = "OTHER"
			}
			logger.Log(ctx, level, "http_request", "request_id", requestID, "method", method,
				"client_trace", clientTrace, "login_mode", loginMode,
				"session_cookie_present", requestHasSessionCookie(request),
				"origin_present", request.Header.Get("Origin") != "",
				"fetch_site_same_origin", request.Header.Get("Sec-Fetch-Site") == "same-origin",
				"route", logRoute(request.URL.Path), "status", response.status,
				"duration_ms", time.Since(started).Milliseconds(), "bytes", response.bytes)
		}()
		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

func requestHasSessionCookie(request *http.Request) bool {
	for _, name := range []string{cookieName, "__Host-classpro_state_0", "classpro_state_0"} {
		if cookie, err := request.Cookie(name); err == nil && cookie.Value != "" {
			return true
		}
	}
	return false
}
