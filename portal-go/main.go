package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	config, err := configFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if os.Getenv("PORTAL_SUBMISSION_TRANSPORT") == "fasthttp" {
		transport, err := startFastTransport("127.0.0.1:"+env("FAST_TRANSPORT_PORT", "3105"), config.WorkerToken)
		if err != nil {
			log.Fatal("Cannot start private fasthttp transport")
		}
		defer transport.Close()
	}
	app := NewServer(config, newBridge(config))
	go app.Reap(ctx)
	server := &http.Server{Addr: config.Addr, Handler: observeRequests(http.TimeoutHandler(app, 100*time.Second, `{"error":{"code":"TIMEOUT","message":"Request timed out."}}`), logger),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 105 * time.Second,
		IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 * 1024}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	logger.Info("api_started", "static_enabled", config.StaticDir != "", "max_sessions", config.MaxSessions, "max_concurrent", config.MaxConcurrent)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("HTTP listener failed")
	}
}
