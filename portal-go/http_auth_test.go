package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const academiaFixture = `<table><tr><td>21CSC201J</td><td>Data Structures</td><td>Theory</td><td>3</td><td>A</td><td>Faculty</td><td>20</td><td>4</td><td>80</td></tr></table><table><tr><td>21CSC201J</td><td>Theory</td><td><table><tr><td>FT-I / 10<br>8</td></tr></table></td></tr></table>`

func httpFixture(t *testing.T, upstream string) *Server {
	t.Helper()
	server, _ := fixture()
	server.httpAuth = newHTTPAuth(testCodec(t))
	server.httpAuth.academiaBase = upstream
	server.httpAuth.portalBase = upstream
	return server
}

func stateCall(server *Server, method, path, body string, previous *httptest.ResponseRecorder) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", server.config.Origin)
	request.RemoteAddr = "192.0.2.1:1234"
	if previous != nil {
		for _, cookie := range previous.Result().Cookies() {
			if cookie.MaxAge >= 0 {
				request.AddCookie(cookie)
			}
		}
	}
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	return result
}

func TestAcademiaHTTPLoginAndStatelessReuse(t *testing.T) {
	logins := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/accounts/signin.ac":
			logins++
			request.ParseForm()
			if request.Form.Get("username") != "student@srmist.edu.in" || request.Form.Get("password") != "password" {
				t.Error("credentials changed")
			}
			fmt.Fprint(writer, `{"data":{"access_token":"secret-token","oauthorize_uri":"/authorize?service=academia"}}`)
		case "/authorize":
			if request.URL.Query().Get("access_token") != "secret-token" {
				t.Error("token missing")
			}
			http.SetCookie(writer, &http.Cookie{Name: "JSESSIONID", Value: "upstream-private", Path: "/", HttpOnly: true})
		case academiaAttendancePath:
			cookie, err := request.Cookie("JSESSIONID")
			if err != nil || cookie.Value != "upstream-private" {
				http.Error(writer, "sign in", 401)
				return
			}
			fmt.Fprint(writer, academiaFixture)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer upstream.Close()
	server := httpFixture(t, upstream.URL)
	challenge := stateCall(server, "POST", "/api/challenge", `{"provider":"academia"}`, nil)
	login := stateCall(server, "POST", "/api/login/client", `{"provider":"academia","account":"student","password":"password","remember":true}`, challenge)
	if login.Code != 200 || !strings.Contains(login.Body.String(), `"authenticated":true`) {
		t.Fatalf("login: %d %s", login.Code, login.Body)
	}
	if len(server.sessions) != 0 {
		t.Fatal("retained server session")
	}
	if strings.Contains(login.Body.String(), "upstream-private") || strings.Contains(strings.Join(login.Header().Values("Set-Cookie"), ""), "upstream-private") {
		t.Fatal("exposed upstream cookie")
	}
	second := httpFixture(t, upstream.URL)
	reports := stateCall(second, "GET", "/api/reports", "", login)
	if reports.Code != 200 || !strings.Contains(reports.Body.String(), `"percentage":80`) || !strings.Contains(reports.Body.String(), `"scored":8`) {
		t.Fatalf("reports: %d %s", reports.Code, reports.Body)
	}
	if logins != 1 || len(second.sessions) != 0 {
		t.Fatal("reuse caused login or retained a session")
	}
	wrong := stateCall(second, "POST", "/api/login/client", `{"provider":"portal","account":"student","password":"password","answer":"Ab12"}`, login)
	if wrong.Code != 401 {
		t.Fatal("provider crossover accepted")
	}
	logout := stateCall(second, "DELETE", "/api/session", "", login)
	for _, cookie := range logout.Result().Cookies() {
		if cookie.MaxAge >= 0 {
			t.Fatal("logout retained browser state")
		}
	}
}

func TestAcademiaParserRejectsMalformedData(t *testing.T) {
	attendance, marks, err := parseAcademiaReports(academiaFixture)
	if err != nil || len(attendance) != 1 || len(marks) != 1 {
		t.Fatal("fixture failed")
	}
	for _, source := range []string{"<html>Sign in</html>", strings.Replace(academiaFixture, "<td>4</td>", "<td>40</td>", 1)} {
		if _, _, err := parseAcademiaReports(source); err == nil {
			t.Fatal("malformed data accepted")
		}
	}
	encoded, _ := json.Marshal(attendance)
	if strings.Contains(string(encoded), "password") {
		t.Fatal("unexpected private field")
	}
}
