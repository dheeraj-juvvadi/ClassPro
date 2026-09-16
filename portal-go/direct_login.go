package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

func portalVariable(source, name string) string {
	pattern := regexp.MustCompile(`\b` + regexp.QuoteMeta(name) + `\s*[:=]\s*['"]([^'"\r\n]+)['"]`)
	match := pattern.FindStringSubmatch(source)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}

func (entry *directSession) challenge(ctx context.Context) reply {
	if entry.authenticated {
		return jsonReply(200, map[string]bool{"authenticated": true})
	}
	entry.loaded = time.Now()
	data, response, err := entry.request(ctx, "GET", portalLoginPath, nil, nil)
	if err != nil || response.StatusCode != 200 {
		return unavailable()
	}
	source := string(data)
	document, err := goquery.NewDocumentFromReader(strings.NewReader(source))
	if err != nil || document.Find("#login_form").Length() != 1 {
		return failure(502, "PORTAL_CHANGED", "Student Portal login form changed.")
	}
	entry.fields = url.Values{}
	document.Find("#login_form input[name]").Each(func(_ int, input *goquery.Selection) {
		name, _ := input.Attr("name")
		if name == "username" || name == "password" || name == "captcha" {
			return
		}
		value, _ := input.Attr("value")
		entry.fields.Add(name, value)
	})
	entry.nonce = portalVariable(source, "nonce")
	entry.domainField = portalVariable(source, "domainFieldName")
	entry.interactionField = portalVariable(source, "captchaFieldName")
	entry.delimiter = portalVariable(source, "randomDelimiter")
	if entry.nonce == "" {
		entry.nonce, _ = document.Find("#fpNonce").Attr("value")
	}
	if entry.compatibility {
		entry.fields = url.Values{}
		document.Find("input[name]").Each(func(_ int, input *goquery.Selection) {
			name, _ := input.Attr("name")
			entry.fields.Set(name, "")
		})
	}
	imagePath, exists := document.Find("#secure_captcha").Attr("data-src")
	if !exists || entry.nonce == "" || entry.domainField == "" || entry.interactionField == "" || entry.delimiter == "" {
		return failure(502, "PORTAL_CHANGED", "Student Portal verification fields changed.")
	}
	base, _ := url.Parse(entry.base)
	headers := http.Header{"X-Domain-Proof": {base64.StdEncoding.EncodeToString([]byte(entry.nonce + ":" + base.Hostname()))}, "Accept": {"image/png,image/jpeg"}}
	if entry.compatibility {
		headers.Set("Referer", entry.base+portalLoginPath)
		headers.Set("Accept", "image/png, image/jpeg, image/svg+xml, image/*")
	}
	image, response, err := entry.request(ctx, "GET", imagePath, nil, headers)
	if err != nil || response.StatusCode != 200 {
		return unavailable()
	}
	media := http.DetectContentType(image)
	if media != "image/png" && media != "image/jpeg" {
		return failure(502, "PORTAL_CHANGED", "Student Portal did not return a verification image.")
	}
	if entry.compatibility {
		entry.loaded = time.Now()
	}
	return jsonReply(200, map[string]string{"image": "data:" + media + ";base64," + base64.StdEncoding.EncodeToString(image)})
}

func (entry *directSession) login(ctx context.Context, payload json.RawMessage) reply {
	if entry.authenticated {
		return jsonReply(200, map[string]bool{"authenticated": true})
	}
	if entry.fields == nil || time.Since(entry.loaded) >= 2*time.Minute {
		return failure(401, "SESSION_EXPIRED", "Load a fresh verification code.")
	}
	var input struct{ Account, Password, Answer string }
	if json.Unmarshal(payload, &input) != nil || strings.TrimSpace(input.Account) == "" || input.Password == "" || !answerPattern.MatchString(input.Answer) {
		return failure(400, "INVALID_REQUEST", "Check your sign-in details.")
	}
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
	base, _ := url.Parse(entry.base)
	host := []rune(base.Hostname())
	for left, right := 0, len(host)-1; left < right; left, right = left+1, right-1 {
		host[left], host[right] = host[right], host[left]
	}
	fields.Set(entry.domainField, base64.StdEncoding.EncodeToString([]byte(string(host))))
	fields.Set(entry.interactionField, base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d%s0", int(time.Since(entry.loaded).Seconds()), entry.delimiter))))
	telemetry, _ := json.Marshal(map[string]any{"startTime": entry.loaded.UnixMilli(), "submitTime": time.Now().UnixMilli(), "timeOnPageMs": time.Since(entry.loaded).Milliseconds(), "currentDomain": base.Hostname(), "platform": runtime.GOOS, "userAgent": "ClassPro/1.0 (Student Portal HTTP client)", "webdriver": true, "keystrokeCount": 0, "mouseClicks": 0, "mouseMovements": 0, "typingSpeedMs": 0, "canvasHash": "no-canvas"})
	fields.Set("telemetryPayload", base64.StdEncoding.EncodeToString(telemetry))
	data, response, err := entry.request(ctx, "POST", portalSubmitPath, fields, nil)
	if err != nil {
		return unavailable()
	}
	document, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
	if err != nil {
		return unavailable()
	}
	success := response.StatusCode == 200 && document.Find("#login_form").Length() == 0 && document.Find("#userHomePage #hdnFormId").Length() > 0
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	slog.InfoContext(ctx, "direct_authentication", "request_id", requestID, "authenticated", success, "upstream_status", response.StatusCode, "login_form_present", document.Find("#login_form").Length() > 0)
	if success {
		entry.authenticated = true
		entry.fields = nil
		return jsonReply(200, map[string]bool{"authenticated": true})
	}
	code, message := "LOGIN_REJECTED", "Student Portal rejected the direct HTTP sign-in. Browser sign-in may still work."
	text := strings.ToLower(document.Text())
	if regexp.MustCompile(`invalid captcha|captcha[^\n]*(?:incorrect|mismatch|invalid)`).MatchString(text) {
		code, message = "CAPTCHA_INVALID", "The verification code was not accepted."
	}
	return failure(401, code, message)
}
