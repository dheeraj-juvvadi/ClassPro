package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestProtocolEvidenceClassifications(t *testing.T) {
	for _, sample := range []struct{ html, want string }{
		{`<form id="login_form"></form><div class="invalid-feedback">Invalid credentials</div>`, "login_form_returned"},
		{`<div class="alert">Invalid credentials</div>`, "credentials_rejected"},
		{`<div class="alert">Invalid captcha</div>`, "captcha_rejected"},
		{`<div class="alert">Enter captcha</div>`, "unclassified"},
		{`<div id="userHomePage"><input id="hdnFormId"></div>`, "authenticated_marker"},
	} {
		page, _ := goquery.NewDocumentFromReader(strings.NewReader(sample.html))
		if got := protocolEvidence(context.Background(), "test", &http.Response{StatusCode: 200}, page, false); got != sample.want {
			t.Fatalf("got %s, want %s", got, sample.want)
		}
	}
}

func TestRequestRecognizesEncryptedSession(t *testing.T) {
	request := httptest.NewRequest("GET", "/api/session", nil)
	request.AddCookie(&http.Cookie{Name: "__Host-classpro_state_0", Value: "sealed"})
	if !requestHasSessionCookie(request) {
		t.Fatal("encrypted session cookie not recognized")
	}
}
