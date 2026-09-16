package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testCodec(tb testing.TB) *stateCodec {
	tb.Helper()
	codec, err := newStateCodec(base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32))), "https://classpro.example", true)
	if err != nil {
		tb.Fatal(err)
	}
	return codec
}

func sealedRequest(tb testing.TB, codec *stateCodec) *http.Request {
	tb.Helper()
	state := &clientState{Provider: "portal", Authenticated: true, Expires: time.Now().Add(time.Hour).Unix(), Cookies: []storedCookie{
		{Source: portalOrigin + "/", Cookie: http.Cookie{Name: "JSESSIONID", Value: strings.Repeat("s", 64), Path: "/"}},
	}}
	writer := httptest.NewRecorder()
	if err := codec.write(writer, state); err != nil {
		tb.Fatal(err)
	}
	request := httptest.NewRequest("GET", "https://classpro.example/api/reports", nil)
	for _, cookie := range writer.Result().Cookies() {
		if cookie.MaxAge < 0 {
			continue
		}
		if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode {
			tb.Fatal("missing cookie protections")
		}
		request.AddCookie(cookie)
	}
	return request
}

func TestClientStateIntegrityAndAudience(t *testing.T) {
	codec := testCodec(t)
	request := sealedRequest(t, codec)
	state, err := codec.read(request)
	if err != nil || !state.Authenticated || len(state.Cookies) != 1 {
		t.Fatal("session did not round trip")
	}
	other := testCodec(t)
	other.audience = "https://other.example"
	if _, err = other.read(request); err == nil {
		t.Fatal("accepted foreign audience")
	}
	value := request.Header.Get("Cookie")
	position := strings.Index(value, "=") + 10
	replacement := "A"
	if value[position] == 'A' {
		replacement = "B"
	}
	request.Header.Set("Cookie", value[:position]+replacement+value[position+1:])
	if _, err = codec.read(request); err == nil {
		t.Fatal("accepted tampered state")
	}
}

func TestClientStateRejectsExpiredAndOversized(t *testing.T) {
	codec := testCodec(t)
	writer := httptest.NewRecorder()
	state := &clientState{Provider: "academia", Expires: time.Now().Add(-time.Minute).Unix()}
	if err := codec.write(writer, state); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("GET", "/api/session", nil)
	for _, cookie := range writer.Result().Cookies() {
		if cookie.MaxAge >= 0 {
			request.AddCookie(cookie)
		}
	}
	if _, err := codec.read(request); err == nil {
		t.Fatal("accepted expired state")
	}
	state.Nonce = strings.Repeat("x", 10000)
	writer = httptest.NewRecorder()
	if codec.write(writer, state) == nil || len(writer.Header().Values("Set-Cookie")) != 0 {
		t.Fatal("oversized state was partially written")
	}
}

func BenchmarkClientSessionDecrypt(b *testing.B) {
	codec := testCodec(b)
	request := sealedRequest(b, codec)
	b.ReportAllocs()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, err := codec.read(request); err != nil {
			b.Fatal(err)
		}
	}
}
