package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

const academiaAttendancePath = "/srm_university/academia-academic-services/page/My_Attendance"

func (entry *directSession) academiaLogin(ctx context.Context, input authInput, state *clientState) reply {
	account := strings.TrimSpace(input.Account)
	if !strings.Contains(account, "@") {
		account += "@srmist.edu.in"
	}
	fields := url.Values{"username": {account}, "password": {input.Password}, "client_portal": {"true"},
		"portal": {"10002227248"}, "servicename": {"ZohoCreator"}, "serviceurl": {entry.base + "/"},
		"is_ajax": {"true"}, "grant_type": {"password"}, "service_language": {"en"}}
	if state.Digest != "" && input.Answer != "" {
		fields.Set("cdigest", state.Digest)
		fields.Set("captcha", input.Answer)
	}
	data, response, err := entry.request(ctx, "POST", "/accounts/signin.ac", fields, http.Header{"Referer": {entry.base + "/"}})
	if err != nil {
		return unavailable()
	}
	var result struct {
		Status, Code, Cdigest string
		Data                  struct {
			AccessToken  string `json:"access_token"`
			AuthorizeURI string `json:"oauthorize_uri"`
		}
	}
	if json.Unmarshal(data, &result) != nil {
		if strings.Contains(strings.ToLower(string(data)), "concurrent") {
			return failure(401, "SESSION_LIMIT", "Academia has reached its session limit. Sign out of an existing session and retry.")
		}
		return failure(502, "PORTAL_CHANGED", "Academia returned an unexpected login response.")
	}
	if result.Code == "HIP_REQUIRED" || result.Code == "HIP_FAILED" {
		if result.Cdigest == "" || len(result.Cdigest) > 1024 {
			return unavailable()
		}
		state.Digest = result.Cdigest
		image, imageResponse, imageErr := entry.request(ctx, "GET", "/accounts/p/40-10002227248/webclient/v1/captcha/"+url.PathEscape(result.Cdigest)+"?darkmode=false", nil, http.Header{"Referer": {entry.base + "/"}})
		if imageErr != nil || imageResponse.StatusCode != 200 {
			return unavailable()
		}
		media := http.DetectContentType(image)
		if media != "image/png" && media != "image/jpeg" {
			return unavailable()
		}
		return jsonReply(401, map[string]any{"error": map[string]string{"code": "CAPTCHA_REQUIRED", "message": "Academia needs a verification code."}, "image": "data:" + media + ";base64," + base64.StdEncoding.EncodeToString(image)})
	}
	if response.StatusCode != 200 || result.Status == "fail" || result.Data.AccessToken == "" {
		return failure(401, "LOGIN_REJECTED", "Academia did not accept the sign-in. Check your Academia password.")
	}
	base, _ := url.Parse(entry.base)
	address, err := base.Parse(result.Data.AuthorizeURI)
	if err != nil || address.Host != base.Host || address.Scheme != base.Scheme || address.User != nil {
		return failure(502, "PORTAL_CHANGED", "Academia returned an unsupported authorization destination.")
	}
	query := address.Query()
	query.Set("access_token", result.Data.AccessToken)
	address.RawQuery = query.Encode()
	if _, _, err = entry.request(ctx, "GET", address.String(), nil, http.Header{"Referer": {entry.base + "/"}}); err != nil {
		return unavailable()
	}
	page, protectedResponse, err := entry.request(ctx, "GET", academiaAttendancePath, nil, http.Header{"Referer": {entry.base + "/"}})
	if err != nil {
		return unavailable()
	}
	if protectedResponse.StatusCode != 200 || academiaExpired(page, protectedResponse) {
		return failure(401, "SESSION_EXPIRED", "Academia did not establish a usable session.")
	}
	if _, _, err = parseAcademiaReports(string(page)); err != nil {
		return failure(502, "PORTAL_CHANGED", "Academia signed in, but its report format was not recognized.")
	}
	entry.authenticated = true
	return jsonReply(200, map[string]bool{"authenticated": true})
}

func academiaExpired(data []byte, response *http.Response) bool {
	if response.StatusCode == 401 || response.StatusCode == 403 {
		return true
	}
	if response.Request != nil && strings.Contains(response.Request.URL.Path, "/accounts/") {
		return true
	}
	page, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
	return err != nil || page.Find("input[type=password], #login_form").Length() > 0
}
