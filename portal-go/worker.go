package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"
)

type reply struct {
	Status int
	Body   json.RawMessage
}

type worker interface {
	Call(context.Context, string, string, json.RawMessage) reply
}

type bridge struct {
	url, token string
	client     *http.Client
}

func newBridge(config Config) *bridge {
	return &bridge{url: config.WorkerURL + "/rpc", token: config.WorkerToken, client: &http.Client{
		Timeout:       config.Timeout,
		Transport:     &http.Transport{MaxConnsPerHost: config.MaxConcurrent + 2, MaxIdleConnsPerHost: config.MaxConcurrent + 2, IdleConnTimeout: 60 * time.Second, ResponseHeaderTimeout: config.Timeout},
		CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect denied") },
	}}
}

func (backend *bridge) Call(ctx context.Context, action, session string, payload json.RawMessage) (result reply) {
	started := time.Now()
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	defer func() {
		level := slog.LevelInfo
		if result.Status >= 500 {
			level = slog.LevelError
		} else if result.Status >= 400 {
			level = slog.LevelWarn
		}
		event := "worker_request"
		if action == "login" {
			event = "authentication"
		}
		var body struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(result.Body, &body)
		code := ""
		switch body.Error.Code {
		case "LOGIN_REJECTED", "LOGIN_FAILED", "CAPTCHA_INVALID", "PORTAL_FORM_REJECTED", "SESSION_LIMIT", "SESSION_EXPIRED", "PORTAL_UNAVAILABLE", "PORTAL_CHANGED", "INVALID_REQUEST", "CAPACITY", "BUSY":
			code = body.Error.Code
		default:
			if result.Status >= 400 {
				code = "UNKNOWN_ERROR"
			}
		}
		slog.Log(ctx, level, event, "request_id", requestID, "action", action, "status", result.Status, "error_code", code, "duration_ms", time.Since(started).Milliseconds())
	}()
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	body, err := json.Marshal(struct {
		Action  string          `json:"action"`
		Session string          `json:"session"`
		Payload json.RawMessage `json:"payload"`
	}{action, session, payload})
	if err != nil {
		return failure(400, "INVALID_REQUEST", "Invalid request.")
	}
	request, err := http.NewRequestWithContext(ctx, "POST", backend.url, bytes.NewReader(body))
	if err != nil {
		return unavailable()
	}
	request.Header.Set("Authorization", "Bearer "+backend.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-ID", requestID)
	response, err := backend.client.Do(request)
	if err != nil {
		return unavailable()
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(data) > 2*1024*1024 || !json.Valid(data) {
		return unavailable()
	}
	if response.StatusCode < 200 || response.StatusCode >= 500 {
		return unavailable()
	}
	return reply{response.StatusCode, data}
}

func failure(status int, code, message string) reply {
	body, _ := json.Marshal(map[string]any{"error": map[string]string{"code": code, "message": message}})
	return reply{status, body}
}

func unavailable() reply {
	return failure(502, "PORTAL_UNAVAILABLE", "Unable to reach Student Portal. Please try signing in again.")
}

func send(writer http.ResponseWriter, response reply) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(response.Status)
	_, _ = writer.Write(response.Body)
}
