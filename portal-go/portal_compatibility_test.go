package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCompatibilitySubmissionAndAttendanceVerification(t *testing.T) {
	image, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.UserAgent() != portalCompatibilityAgent {
			t.Error("user agent mismatch")
		}
		switch request.URL.Path {
		case portalLoginPath:
			http.SetCookie(writer, &http.Cookie{Name: "JSESSIONID", Value: "fixture-session", Path: "/"})
			fmt.Fprint(writer, `<script>nonce:'nonce';domainFieldName='domain';captchaFieldName='interaction';randomDelimiter='sep';</script><form id="login_form"><input name="fpToken" value="ignored"></form><img id="secure_captcha" data-src="/captcha">`)
		case "/captcha":
			writer.Write(image)
		case portalSubmitPath:
			request.ParseForm()
			if request.Header.Get("Origin") != "" || request.Form.Get("fpToken") != "" || !request.Form.Has("recaptchaToken") {
				t.Error("form or headers differ")
			}
			interaction, _ := base64.StdEncoding.DecodeString(request.Form.Get("interaction"))
			if !strings.HasSuffix(string(interaction), "sep3") {
				t.Error("interaction mismatch")
			}
			encoded, _ := base64.StdEncoding.DecodeString(request.Form.Get("telemetryPayload"))
			var telemetry map[string]any
			json.Unmarshal(encoded, &telemetry)
			if telemetry["userAgent"] != portalCompatibilityAgent || telemetry["canvasHash"] == nil {
				t.Error("telemetry missing")
			}
			if cookie, err := request.Cookie("JSESSIONID"); err != nil || cookie.Value != "fixture-session" {
				t.Error("session lost")
			}
			fmt.Fprint(writer, `<html>Continue</html>`)
		case "/srmiststudentportal/students/report/studentAttendanceDetails.jsp":
			fmt.Fprint(writer, `<table><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr><tr><td>TEST</td><td>Logic</td><td>20</td><td>15</td><td>5</td><td>75</td></tr></table>`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer upstream.Close()
	auth := newHTTPAuth(testCodec(t))
	auth.portalBase = upstream.URL
	entry, _ := auth.entry(&clientState{Provider: "portal"})
	if result := entry.challenge(context.Background()); result.Status != 200 {
		t.Fatal("challenge failed")
	}
	if result := entry.protocolLogin(context.Background(), authInput{Account: "student", Password: "secret", Answer: "Ab12"}); result.Status != 200 || !entry.authenticated {
		t.Fatal("login failed")
	}
}
