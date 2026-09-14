package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

type fakeFastSubmitter struct {
	calls   int
	inspect func(*fasthttp.Request)
}

func (client *fakeFastSubmitter) DoTimeout(request *fasthttp.Request, response *fasthttp.Response, timeout time.Duration) error {
	client.calls++
	if client.inspect != nil {
		client.inspect(request)
	}
	response.SetStatusCode(302)
	response.Header.Set("Location", "/srmiststudentportal/students/template/HRDSystem.jsp")
	response.Header.Add("Set-Cookie", "session=one; HttpOnly")
	response.Header.Add("Set-Cookie", "route=two; Secure")
	return nil
}

func TestFastTransportRestrictsTargetAndPreservesForm(t *testing.T) {
	client := &fakeFastSubmitter{inspect: func(request *fasthttp.Request) {
		if string(request.URI().FullURI()) != "https://sp.srmist.edu.in/srmiststudentportal/LoginServlet" {
			t.Fatal("wrong destination")
		}
		if string(request.Body()) != "password=private%26value&captcha=Ab12" {
			t.Fatal("body altered")
		}
		if string(request.Header.Peek("Cookie")) != "JSESSIONID=private" {
			t.Fatal("cookie lost")
		}
		if len(request.Header.Peek("Authorization")) != 0 {
			t.Fatal("internal authorization leaked")
		}
	}}
	handler := fastTransportHandler("private-token", client)
	body := `{"body":"password=private%26value&captcha=Ab12","headers":{"cookie":"JSESSIONID=private","authorization":"Bearer secret"}}`
	request := httptest.NewRequest("POST", "/submit", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 401 || client.calls != 0 {
		t.Fatal("unauthorized forwarding")
	}
	request = httptest.NewRequest("POST", "/submit", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer private-token")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var result struct {
		Status  int
		Headers map[string]string
	}
	if json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Status != 302 || client.calls != 1 {
		t.Fatal("submission contract failed")
	}
	if strings.Count(result.Headers["set-cookie"], "\n") != 1 {
		t.Fatal("duplicate response cookies lost")
	}
}

func TestFastTransportVerifiesCertificates(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) { writer.WriteHeader(200) }))
	defer server.Close()
	client := &fasthttp.Client{MaxIdemponentCallAttempts: 1}
	defer client.CloseIdleConnections()
	request := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(request)
	response := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseResponse(response)
	request.SetRequestURI(server.URL)
	if client.DoTimeout(request, response, time.Second) == nil {
		t.Fatal("untrusted certificate accepted")
	}
}
