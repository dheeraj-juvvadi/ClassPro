package main

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Origin, WorkerURL, WorkerToken, StaticDir, Addr string
	Secure                                          bool
	MaxSessions, MaxConcurrent, RatePerMinute       int
	SessionTTL, ChallengeTTL, CacheTTL, Timeout     time.Duration
	TrustedProxies                                  []*net.IPNet
}

func configFromEnv() (Config, error) {
	config := Config{Origin: os.Getenv("APP_ORIGIN"), WorkerURL: env("WORKER_URL", "http://127.0.0.1:3101"), WorkerToken: os.Getenv("WORKER_TOKEN"), StaticDir: os.Getenv("STATIC_DIR"), Addr: ":" + env("PORT", "8080"), Secure: true, MaxSessions: 4, MaxConcurrent: 2, RatePerMinute: 30, SessionTTL: 30 * time.Minute, ChallengeTTL: 2 * time.Minute, CacheTTL: time.Minute, Timeout: 90 * time.Second}
	origin, err := url.Parse(config.Origin)
	if err != nil || origin.Host == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || origin.Path != "" {
		return config, fmt.Errorf("APP_ORIGIN must be an exact origin without trailing slash")
	}
	if origin.Scheme != "https" {
		if origin.Scheme != "http" || os.Getenv("ALLOW_INSECURE_LOCAL") != "1" || !(origin.Hostname() == "localhost" || net.ParseIP(origin.Hostname()).IsLoopback()) {
			return config, fmt.Errorf("APP_ORIGIN requires HTTPS outside explicit localhost development")
		}
		config.Secure = false
	}
	worker, err := url.Parse(config.WorkerURL)
	if err != nil || worker.Host == "" || worker.User != nil || worker.RawQuery != "" || worker.Fragment != "" || worker.Path != "" || (worker.Scheme != "http" && worker.Scheme != "https") {
		return config, fmt.Errorf("invalid WORKER_URL")
	}
	if worker.Scheme == "http" && !net.ParseIP(worker.Hostname()).IsLoopback() {
		return config, fmt.Errorf("unencrypted worker must use a literal loopback address")
	}
	if len(config.WorkerToken) < 32 || strings.ContainsAny(config.WorkerToken, "\r\n") {
		return config, fmt.Errorf("WORKER_TOKEN needs at least 32 characters")
	}
	for name, target := range map[string]*int{"MAX_SESSIONS": &config.MaxSessions, "MAX_CONCURRENT": &config.MaxConcurrent, "RATE_PER_MINUTE": &config.RatePerMinute} {
		if value := os.Getenv(name); value != "" {
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed < 1 || parsed > 1000 {
				return config, fmt.Errorf("invalid %s", name)
			}
			*target = parsed
		}
	}
	for _, value := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if strings.TrimSpace(value) == "" {
			continue
		}
		_, network, err := net.ParseCIDR(strings.TrimSpace(value))
		if err != nil {
			return config, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS")
		}
		prefix, _ := network.Mask.Size()
		if prefix == 0 { return config, fmt.Errorf("TRUSTED_PROXY_CIDRS cannot trust every address") }
		config.TrustedProxies = append(config.TrustedProxies, network)
	}
	return config, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
