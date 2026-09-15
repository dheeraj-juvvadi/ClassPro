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

func TestDirectLoginPreservesSessionAndReports(t *testing.T) {
	image, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
	portal := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case portalLoginPath:
			http.SetCookie(writer, &http.Cookie{Name: "JSESSIONID", Value: "private-session", Path: "/"})
			fmt.Fprint(writer, `<script>nonce:'nonce';domainFieldName='domain';captchaFieldName='interaction';randomDelimiter='sep';</script><form id="login_form"><input name="ph_test" value=""><input name="fpToken" value=""></form><img id="secure_captcha" data-src="/captcha">`)
		case "/captcha":
			cookie, err := request.Cookie("JSESSIONID")
			if err != nil || cookie.Value != "private-session" || request.Header.Get("X-Domain-Proof") == "" {
				t.Error("challenge lost session or domain proof")
			}
			writer.Write(image)
		case portalSubmitPath:
			request.ParseForm()
			cookie, err := request.Cookie("JSESSIONID")
			if err != nil || cookie.Value != "private-session" {
				t.Error("submission lost session")
			}
			if request.Form.Get("username") != "student" || request.Form.Get("password") != "private-password" || request.Form.Get("captcha") != "Ab12" || request.Form.Get("ph_test") != "" {
				t.Error("incorrect form")
			}
			if request.Form.Get("telemetryPayload") == "" || request.Form.Get("domain") == "" {
				t.Error("missing security fields")
			}
			http.Redirect(writer, request, portalShellPath, 302)
		case portalShellPath:
			fmt.Fprint(writer, `<div id="userHomePage"><input id="hdnFormId" value="1"></div><input id="hdnFormDetails" value="details"><input id="csrfPreventionSalt" value="">`)
		case "/srmiststudentportal/students/report/studentAttendanceDetails.jsp":
			request.ParseForm()
			if request.Form.Get("iden") != "9" || !request.Form.Has("csrfPreventionSalt") {
				t.Error("incorrect report fields")
			}
			fmt.Fprint(writer, `<table><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr><tr><td>SYN1</td><td>Logic</td><td>20</td><td>15</td><td>5</td><td>75%</td></tr></table>`)
		case "/srmiststudentportal/students/report/studentInternalMarkDetails.jsp":
			fmt.Fprint(writer, `<table><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th>Details</th></tr><tr><td>SYN1</td><td>Logic</td><td>18 / 20</td><td><button onclick="funViewComponentWiseMarks('12','SYN1','Logic',0)">View</button></td></tr></table>`)
		case "/srmiststudentportal/students/report/studentInternalMarkDetailsInner.jsp":
			request.ParseForm()
			if request.Form.Get("hdnSubjectId") != "12" || request.Form.Get("status") != "0" {
				t.Error("incorrect component fields")
			}
			fmt.Fprint(writer, `<table><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr><tr><td>Today</td><td>Quiz</td><td>18 / 20</td></tr></table>`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer portal.Close()
	backend := newDirectWorker()
	backend.base = portal.URL
	ctx := context.Background()
	challenge := backend.Call(ctx, "challenge", "first", nil)
	if challenge.Status != 200 {
		t.Fatalf("challenge failed: %s", challenge.Body)
	}
	if backend.Call(ctx, "reports", "second", nil).Status != 401 {
		t.Fatal("sessions not isolated")
	}
	login := backend.Call(ctx, "login", "first", json.RawMessage(`{"account":"student@srmist.edu.in","password":"private-password","answer":"Ab12"}`))
	if login.Status != 200 {
		t.Fatalf("login failed: %s", login.Body)
	}
	reports := backend.Call(ctx, "reports", "first", nil)
	if reports.Status != 200 || !strings.Contains(string(reports.Body), `"percentage":75`) || !strings.Contains(string(reports.Body), `"name":"Quiz"`) {
		t.Fatalf("incorrect reports: %s", reports.Body)
	}
	if strings.Contains(string(reports.Body), "private-") || strings.Contains(string(reports.Body), "subjectId") {
		t.Fatal("internal fields leaked")
	}
	backend.Call(ctx, "close", "first", nil)
	if backend.Call(ctx, "reports", "first", nil).Status != 401 {
		t.Fatal("closed session retained")
	}
}

func TestDirectRejectsCrossOriginRedirect(t *testing.T) {
	called := false
	foreign := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) { called = true }))
	defer foreign.Close()
	portal := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, foreign.URL, 307)
	}))
	defer portal.Close()
	backend := newDirectWorker()
	backend.base = portal.URL
	if backend.Call(context.Background(), "challenge", "one", nil).Status != 502 || called {
		t.Fatal("external redirect followed")
	}
}
