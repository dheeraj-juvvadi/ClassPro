package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

func (entry *directSession) protocolLogin(ctx context.Context, input authInput) reply {
	if entry.fields == nil || time.Since(entry.loaded) >= 2*time.Minute {
		return failure(401, "SESSION_EXPIRED", "Load a fresh verification code.")
	}
	if !answerPattern.MatchString(input.Answer) {
		return failure(401, "CAPTCHA_REQUIRED", "Enter the verification code.")
	}
	var telemetry map[string]any
	if json.Unmarshal(input.Telemetry, &telemetry) != nil || len(telemetry) == 0 || len(input.Telemetry) > 4096 {
		return failure(400, "INVALID_REQUEST", "Reload the login page and try again.")
	}
	base, _ := url.Parse(entry.base)
	telemetry["currentDomain"] = base.Hostname()
	encodedTelemetry, _ := json.Marshal(telemetry)
	fields := url.Values{}
	for key, values := range entry.fields {
		fields[key] = append([]string(nil), values...)
	}
	account := strings.TrimSpace(input.Account)
	if strings.HasSuffix(strings.ToLower(account), "@srmist.edu.in") {
		account = account[:len(account)-len("@srmist.edu.in")]
	}
	fields.Set("username", account)
	fields.Set("password", input.Password)
	fields.Set("captcha", input.Answer)
	host := []rune(base.Hostname())
	for left, right := 0, len(host)-1; left < right; left, right = left+1, right-1 {
		host[left], host[right] = host[right], host[left]
	}
	fields.Set(entry.domainField, base64.StdEncoding.EncodeToString([]byte(string(host))))
	clicks, _ := telemetry["mouseClicks"].(float64)
	fields.Set(entry.interactionField, base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d%s%d", int(time.Since(entry.loaded).Seconds()), entry.delimiter, int(clicks)))))
	fingerprint, _ := json.Marshal(map[string]any{"fp": "", "nonce": entry.nonce, "ts": time.Now().UnixMilli()})
	fields.Set("fpPayload", base64.StdEncoding.EncodeToString(fingerprint))
	fields.Set("telemetryPayload", base64.StdEncoding.EncodeToString(encodedTelemetry))
	data, response, err := entry.request(ctx, "POST", portalSubmitPath, fields, nil)
	if err != nil {
		return unavailable()
	}
	document, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
	if err != nil {
		return unavailable()
	}
	if response.StatusCode == 200 && document.Find("#login_form").Length() == 0 && document.Find("#userHomePage #hdnFormId").Length() > 0 {
		entry.authenticated = true
		return jsonReply(200, map[string]bool{"authenticated": true})
	}
	alert := strings.ToLower(document.Find(".alert, [role=alert], #errorMessage").Text())
	if strings.Contains(alert, "captcha") {
		return failure(401, "CAPTCHA_INVALID", "SRM rejected the verification code. Load a new code.")
	}
	protected, protectedResponse, protectedErr := entry.request(ctx, "GET", portalShellPath, nil, nil)
	if protectedErr == nil && protectedResponse.StatusCode == 200 {
		page, parseErr := goquery.NewDocumentFromReader(strings.NewReader(string(protected)))
		if parseErr == nil && page.Find("#userHomePage #hdnFormId").Length() > 0 && page.Find("#login_form").Length() == 0 {
			entry.authenticated = true
			return jsonReply(200, map[string]bool{"authenticated": true})
		}
	}
	return failure(401, "LOGIN_REJECTED", "SRM did not accept the sign-in. Check your Student Portal credentials.")
}
