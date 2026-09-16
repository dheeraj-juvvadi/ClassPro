package main

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

func protocolEvidence(ctx context.Context, stage string, response *http.Response, document *goquery.Document, failed bool) string {
	category := "unclassified"
	status := 0
	loginForm, dashboard := false, false
	if response != nil {
		status = response.StatusCode
	}
	if document != nil {
		loginForm = document.Find("#login_form").Length() > 0
		dashboard = document.Find("#userHomePage #hdnFormId").Length() > 0
		alerts := document.Find(".alert, [role=alert], #errorMessage").Clone()
		alerts.Find("script, style, .invalid-feedback, [hidden], [aria-hidden=true]").Remove()
		message := strings.ToLower(cleanText(alerts.Text()))
		switch {
		case strings.Contains(message, "invalid captcha"), strings.Contains(message, "incorrect captcha"), strings.Contains(message, "captcha mismatch"):
			category = "captcha_rejected"
		case strings.Contains(message, "invalid credentials"), strings.Contains(message, "invalid username or password"), strings.Contains(message, "invalid user name or password"):
			category = "credentials_rejected"
		case strings.Contains(message, "session limit"), strings.Contains(message, "concurrent"):
			category = "session_limit"
		case dashboard && !loginForm:
			category = "authenticated_marker"
		case loginForm:
			category = "login_form_returned"
		}
	}
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	slog.InfoContext(ctx, "portal_http_evidence", "request_id", requestID, "stage", stage,
		"upstream_status", status, "transport_failed", failed, "login_form_present", loginForm,
		"dashboard_present", dashboard, "classification", category)
	return category
}
