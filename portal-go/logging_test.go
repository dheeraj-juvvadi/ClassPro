package main

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestLogsExcludeSensitiveInput(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	handler := observeRequests(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Context().Value(requestIDKey{}) == nil {
			t.Fatal("missing request context")
		}
		writer.WriteHeader(401)
		_, _ = writer.Write([]byte(`{"error":"private-response"}`))
	}), logger)
	request := httptest.NewRequest("POST", "/api/login/client?password=private-query", strings.NewReader("private-password"))
	request.Header.Set("Cookie", "private-cookie")
	request.Header.Set("Authorization", "Bearer private-token")
	request.Header.Set("X-Request-ID", "private-client-id")
	request.Header.Set("X-Client-Trace", "private-trace")
	request.Header.Set("X-Login-Mode", "private-mode")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 401 || len(response.Header().Get("X-Request-ID")) != 64 {
		t.Fatal("invalid response metadata")
	}
	if strings.Contains(output.String(), "private-") {
		t.Fatal("sensitive input logged")
	}
	if !strings.Contains(output.String(), `"status":401`) || !strings.Contains(output.String(), "http_request") {
		t.Fatal("missing request log")
	}
}

func TestDiagnosticTraceValidation(t *testing.T) {
	if safeDiagnosticID("12345678-1234-1234-1234-123456789abc") == "" {
		t.Fatal("valid trace rejected")
	}
	for _, value := range []string{"password-secret", strings.Repeat("a", 100), "\nforged"} {
		if safeDiagnosticID(value) != "" {
			t.Fatal("unsafe trace accepted")
		}
	}
}

func TestHealthLogsAreQuietAndUnknownPathsAreRedacted(t *testing.T) {
	var output bytes.Buffer
	handler := observeRequests(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(200)
	}), slog.New(slog.NewJSONHandler(&output, nil)))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/health", nil))
	if output.Len() != 0 {
		t.Fatal("health probe logged")
	}
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/private-netid", nil))
	if strings.Contains(output.String(), "private-netid") || !strings.Contains(output.String(), "unknown_api") {
		t.Fatal("unsafe route logging")
	}
}
