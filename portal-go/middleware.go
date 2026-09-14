package main

import (
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func (server *Server) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("X-Frame-Options", "DENY")
	writer.Header().Set("Referrer-Policy", "no-referrer")
	writer.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	writer.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	if server.config.Secure {
		writer.Header().Set("Strict-Transport-Security", "max-age=31536000")
	}
	if request.URL.Path == "/health" {
		if request.Method != "GET" && request.Method != "HEAD" {
			writer.Header().Set("Allow", "GET, HEAD")
			send(writer, failure(405, "METHOD_NOT_ALLOWED", "Method not allowed."))
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(200)
		if request.Method == "GET" {
			_, _ = io.WriteString(writer, "{\"ok\":true}\n")
		}
		return
	}
	if !strings.HasPrefix(request.URL.Path, "/api/") {
		server.serveStatic(writer, request)
		return
	}
	if !server.allowRate(server.clientIP(request)) {
		writer.Header().Set("Retry-After", "60")
		send(writer, failure(429, "RATE_LIMIT", "Too many requests. Wait a minute and try again."))
		return
	}
	if request.Method != "GET" && request.Method != "HEAD" {
		if request.Header.Get("Origin") != server.config.Origin || request.Header.Get("Sec-Fetch-Site") == "cross-site" {
			send(writer, failure(403, "INVALID_ORIGIN", "Reload the app and try again."))
			return
		}
		if request.Method == "POST" {
			media, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
			if err != nil || media != "application/json" {
				send(writer, failure(415, "INVALID_REQUEST", "Send JSON."))
				return
			}
		}
	}
	server.route(writer, request)
}

func (server *Server) allowRate(key string) bool {
	server.mu.Lock()
	defer server.mu.Unlock()
	now := time.Now()
	value, exists := server.rates[key]
	if !exists && len(server.rates) >= 4096 {
		for address, previous := range server.rates {
			if !now.Before(previous.until) {
				delete(server.rates, address)
			}
		}
		if len(server.rates) >= 4096 {
			return false
		}
	}
	if now.After(value.until) {
		value = rate{until: now.Add(time.Minute)}
	}
	value.count++
	server.rates[key] = value
	return value.count <= server.config.RatePerMinute
}

func (server *Server) trusted(ip net.IP) bool {
	for _, network := range server.config.TrustedProxies {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func (server *Server) clientIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	ip := net.ParseIP(host)
	if server.trusted(ip) {
		chain := strings.Split(request.Header.Get("X-Forwarded-For"), ",")
		for index := len(chain) - 1; index >= 0; index-- {
			candidate := net.ParseIP(strings.TrimSpace(chain[index]))
			if candidate == nil {
				break
			}
			ip = candidate
			if !server.trusted(ip) {
				break
			}
		}
	}
	return ip.String()
}

func (server *Server) serveStatic(writer http.ResponseWriter, request *http.Request) {
	if server.static == nil || (request.Method != "GET" && request.Method != "HEAD") {
		http.NotFound(writer, request)
		return
	}
	for _, segment := range strings.Split(request.URL.Path, "/") {
		if strings.HasPrefix(segment, ".") || strings.Contains(segment, "\\") {
			http.NotFound(writer, request)
			return
		}
	}
	if strings.HasSuffix(request.URL.Path, "/") && request.URL.Path != "/" {
		http.NotFound(writer, request)
		return
	}
	asset := strings.TrimPrefix(path.Clean("/"+request.URL.Path), "/")
	if asset == "" {
		asset = "index.html"
	}
	info, err := os.Stat(filepath.Join(server.config.StaticDir, filepath.FromSlash(asset)))
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(writer, request)
		return
	}
	if strings.HasSuffix(request.URL.Path, ".svg") {
		writer.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; sandbox")
	}
	if strings.HasPrefix(request.URL.Path, "/ocr/") {
		writer.Header().Set("Cache-Control", "public, max-age=86400")
	}
	server.static.ServeHTTP(writer, request)
}
