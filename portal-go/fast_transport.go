package main

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/valyala/fasthttp"
)

type fastSubmitter interface {
	DoTimeout(*fasthttp.Request, *fasthttp.Response, time.Duration) error
}

func fastTransportHandler(token string, client fastSubmitter) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		if subtle.ConstantTimeCompare([]byte(request.Header.Get("Authorization")), []byte("Bearer "+token)) != 1 {
			send(writer, failure(401, "UNAUTHORIZED", "Unauthorized."))
			return
		}
		if request.URL.Path != "/submit" || request.Method != "POST" {
			send(writer, failure(404, "NOT_FOUND", "Unknown action."))
			return
		}
		var input struct {
			Body    string            `json:"body"`
			Headers map[string]string `json:"headers"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 65536))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || len(input.Body) > 32768 {
			send(writer, failure(400, "INVALID_REQUEST", "Invalid submission."))
			return
		}
		outgoing := fasthttp.AcquireRequest()
		response := fasthttp.AcquireResponse()
		defer fasthttp.ReleaseRequest(outgoing)
		defer fasthttp.ReleaseResponse(response)
		outgoing.SetRequestURI("https://sp.srmist.edu.in/srmiststudentportal/LoginServlet")
		outgoing.Header.SetMethod("POST")
		allowed := map[string]bool{"user-agent": true, "accept": true, "accept-language": true, "content-type": true, "cookie": true, "origin": true, "referer": true, "sec-fetch-dest": true, "sec-fetch-mode": true, "sec-fetch-site": true, "sec-fetch-user": true, "sec-ch-ua": true, "sec-ch-ua-mobile": true, "sec-ch-ua-platform": true, "upgrade-insecure-requests": true}
		for name, value := range input.Headers {
			if strings.ContainsAny(value, "\r\n") {
				send(writer, failure(400, "INVALID_REQUEST", "Invalid header."))
				return
			}
			if allowed[strings.ToLower(name)] {
				outgoing.Header.Set(name, value)
			}
		}
		outgoing.Header.Set("Accept-Encoding", "identity")
		outgoing.SetBodyString(input.Body)
		started := time.Now()
		err := client.DoTimeout(outgoing, response, 30*time.Second)
		if err != nil {
			slog.Warn("fasthttp_submission", "failed", true, "duration_ms", time.Since(started).Milliseconds())
			send(writer, unavailable())
			return
		}
		slog.Info("fasthttp_submission", "upstream_status", response.StatusCode(), "duration_ms", time.Since(started).Milliseconds())
		headers := map[string]string{}
		response.Header.VisitAll(func(name, value []byte) {
			key := strings.ToLower(string(name))
			if key == "content-type" || key == "location" || key == "set-cookie" || key == "content-encoding" {
				if headers[key] != "" {
					headers[key] += "\n"
				}
				headers[key] += string(value)
			}
		})
		body, err := json.Marshal(map[string]any{"status": response.StatusCode(), "headers": headers, "body": base64.StdEncoding.EncodeToString(response.Body())})
		if err != nil {
			send(writer, unavailable())
			return
		}
		send(writer, reply{200, body})
	})
}

func startFastTransport(address, token string) (*http.Server, error) {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, err
	}
	client := &fasthttp.Client{MaxConnsPerHost: 2, MaxResponseBodySize: 2 * 1024 * 1024, ReadTimeout: 30 * time.Second, WriteTimeout: 10 * time.Second, MaxIdemponentCallAttempts: 1}
	server := &http.Server{Handler: fastTransportHandler(token, client), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 35 * time.Second}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			slog.Error("fasthttp_listener_failed")
		}
	}()
	slog.Info("fasthttp_transport_started", "tls_verification", true)
	return server, nil
}
