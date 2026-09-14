package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBridgePreservesCredentialCharacters(t *testing.T) {
	password := "  synthetic&+=%<>\"'\\é🙂  "
	account := "student@srmist.edu.in"
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var message struct {
			Payload struct{ Account, Password, Answer string }
		}
		if json.NewDecoder(request.Body).Decode(&message) != nil {
			t.Error("invalid bridge JSON")
		}
		if message.Payload.Account != account || message.Payload.Password != password || message.Payload.Answer != "Ab12" {
			t.Error("bridge changed credentials")
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"authenticated":true}`))
	}))
	defer upstream.Close()
	backend := newBridge(Config{WorkerURL: upstream.URL, WorkerToken: "private-token", MaxConcurrent: 1, Timeout: time.Second})
	payload, _ := json.Marshal(map[string]string{"account": account, "password": password, "answer": "Ab12"})
	if !validPayload("/api/login/client", payload) {
		t.Fatal("valid credentials rejected")
	}
	if backend.Call(context.Background(), "login", randomID(), payload).Status != 200 {
		t.Fatal("bridge failed")
	}
}

func TestBridgeNeverFollowsRedirectOrLeaksWorkerErrors(t *testing.T) {
	for _, kind := range []string{"redirect", "error", "invalid", "oversized"} {
		t.Run(kind, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.URL.Path != "/rpc" || request.Method != "POST" || request.Header.Get("Authorization") != "Bearer private-token" {
					t.Error("incorrect bridge contract")
				}
				switch kind {
				case "redirect":
					writer.Header().Set("Location", "/leak")
					writer.WriteHeader(302)
				case "error":
					writer.WriteHeader(500)
					_, _ = writer.Write([]byte(`{"password":"secret"}`))
				case "invalid":
					_, _ = writer.Write([]byte("upstream secret HTML"))
				case "oversized":
					_, _ = writer.Write([]byte(`"` + strings.Repeat("x", 2*1024*1024) + `"`))
				}
			}))
			defer upstream.Close()
			backend := newBridge(Config{WorkerURL: upstream.URL, WorkerToken: "private-token", MaxConcurrent: 1, Timeout: time.Second})
			response := backend.Call(context.Background(), "challenge", randomID(), nil)
			if response.Status != 502 || strings.Contains(string(response.Body), "secret") {
				t.Fatal("unsafe worker failure response")
			}
		})
	}
}

func TestConfigFailsClosed(t *testing.T) {
	t.Setenv("APP_ORIGIN", "https://classpro.example")
	t.Setenv("WORKER_TOKEN", strings.Repeat("x", 32))
	t.Setenv("WORKER_URL", "http://127.0.0.1:3101")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")
	t.Setenv("MAX_SESSIONS", "4")
	t.Setenv("MAX_CONCURRENT", "2")
	t.Setenv("RATE_PER_MINUTE", "30")
	if _, err := configFromEnv(); err != nil {
		t.Fatal(err)
	}
	for _, origin := range []string{"http://classpro.example", "https://classpro.example/", "https://user@classpro.example", "https://classpro.example?x=1"} {
		t.Setenv("APP_ORIGIN", origin)
		if _, err := configFromEnv(); err == nil {
			t.Fatalf("accepted origin %s", origin)
		}
	}
	t.Setenv("APP_ORIGIN", "https://classpro.example")
	t.Setenv("WORKER_URL", "http://worker.example")
	if _, err := configFromEnv(); err == nil {
		t.Fatal("accepted plaintext remote worker")
	}
}

func TestMissingMediaAndCrossSiteAreRejected(t *testing.T) {
	server, backend := fixture()
	for _, crossSite := range []bool{false, true} {
		request := httptest.NewRequest("POST", "/api/challenge", strings.NewReader(`{}`))
		request.Header.Set("Origin", server.config.Origin)
		want := 415
		if crossSite {
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Sec-Fetch-Site", "cross-site")
			want = 403
		}
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != want {
			t.Fatalf("wanted %d, got %d", want, response.Code)
		}
	}
	if len(backend.calls) != 0 {
		t.Fatal("invalid request reached bridge")
	}
}

func TestStaticServingRejectsDirectoryListingsAndDotFiles(t *testing.T) {
	server, _ := fixture()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "assets"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("public app"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("secret"), 0600); err != nil {
		t.Fatal(err)
	}
	server.config.StaticDir = root
	server.static = http.FileServer(http.Dir(root))
	for _, route := range []string{"/assets", "/assets/", "/.env", "/../.env"} {
		if perform(server, "GET", route, "", nil, "").Code != 404 {
			t.Fatalf("unsafe static route %s", route)
		}
	}
	if response := perform(server, "GET", "/", "", nil, ""); response.Code != 200 || response.Body.String() != "public app" {
		t.Fatal("public root broken")
	}
}
