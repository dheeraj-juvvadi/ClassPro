package main

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

var directComponentCall = regexp.MustCompile(`^\s*(?:return\s+)?funViewComponentWiseMarks\(\s*'([0-9]+)'\s*,\s*'([^'\r\n]*)'\s*,\s*'([^'\r\n]*)'\s*,\s*([0-9]+)\s*\)\s*;?\s*$`)

func directMarks(source string) ([]map[string]any, error) {
	rows, err := reportRows(source, []string{"Code", "Description", "Mark / Max. Mark"})
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		mark, err := directScore(row.values[2])
		if err != nil {
			return nil, err
		}
		if row.values[0] == "" || row.values[1] == "" {
			return nil, errors.New("missing course")
		}
		mark["code"], mark["title"] = row.values[0], row.values[1]
		mark["components"] = []map[string]any{}
		handlers := []string{}
		row.node.Find("[onclick]").Each(func(_ int, node *goquery.Selection) {
			handler, _ := node.Attr("onclick")
			if strings.Contains(handler, "funViewComponentWiseMarks") {
				handlers = append(handlers, handler)
			}
		})
		if len(handlers) == 1 {
			match := directComponentCall.FindStringSubmatch(handlers[0])
			if len(match) == 5 && cleanText(match[2]) == row.values[0] && cleanText(match[3]) == row.values[1] {
				mark["subjectId"], mark["detailStatus"] = match[1], match[4]
			}
		}
		result = append(result, mark)
	}
	return result, nil
}

func directComponents(source string) ([]map[string]any, error) {
	rows, err := reportRows(source, []string{"Entered on", "Component", "Mark / Max. Mark"})
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		mark, err := directScore(row.values[2])
		if err != nil {
			return nil, err
		}
		if row.values[1] == "" {
			return nil, errors.New("missing component")
		}
		mark["enteredOn"], mark["name"] = row.values[0], row.values[1]
		result = append(result, mark)
	}
	return result, nil
}

func (entry *directSession) report(ctx context.Context, path string, fields url.Values) (string, error) {
	data, response, err := entry.request(ctx, "POST", "/srmiststudentportal/students/report/"+path, fields, nil)
	if err != nil {
		return "", err
	}
	document, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
	if err != nil {
		return "", err
	}
	if document.Find("#login_form").Length() > 0 || strings.Contains(response.Request.URL.Path, "loginManager/youLogin.jsp") {
		entry.authenticated = false
		return "", errors.New("SESSION_EXPIRED")
	}
	if response.StatusCode != 200 {
		return "", errors.New("PORTAL_UNAVAILABLE")
	}
	return string(data), nil
}

func (entry *directSession) reports(ctx context.Context) reply {
	if !entry.authenticated {
		return failure(401, "SESSION_EXPIRED", "Sign in to Student Portal.")
	}
	data, response, err := entry.request(ctx, "GET", portalShellPath, nil, nil)
	if err != nil || response.StatusCode != 200 {
		return unavailable()
	}
	document, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
	if err != nil {
		return unavailable()
	}
	if document.Find("#login_form").Length() > 0 || document.Find("#userHomePage").Length() == 0 {
		entry.authenticated = false
		return failure(401, "SESSION_EXPIRED", "Your portal session expired.")
	}
	details, _ := document.Find("#hdnFormDetails").Attr("value")
	salt, exists := document.Find("#csrfPreventionSalt").Attr("value")
	if details == "" || !exists {
		return failure(502, "PORTAL_CHANGED", "Student Portal report fields changed.")
	}
	result := map[string]any{"updatedAt": time.Now().UTC().Format(time.RFC3339)}
	for _, kind := range []struct {
		name, iden, file string
		parse            func(string) ([]map[string]any, error)
	}{
		{"attendance", "9", "studentAttendanceDetails.jsp", directAttendance},
		{"marks", "13", "studentInternalMarkDetails.jsp", directMarks},
	} {
		section := map[string]any{"data": []map[string]any{}}
		result[kind.name] = section
		html, err := entry.report(ctx, kind.file, url.Values{"filter": {""}, "hdnFormDetails": {details}, "csrfPreventionSalt": {salt}, "iden": {kind.iden}})
		var rows []map[string]any
		if err == nil {
			rows, err = kind.parse(html)
		}
		if err != nil {
			if err.Error() == "SESSION_EXPIRED" {
				return failure(401, "SESSION_EXPIRED", "Your portal session expired.")
			}
			section["error"] = map[string]string{"code": "PORTAL_UNAVAILABLE", "message": "This report could not be loaded. Try Retry."}
			continue
		}
		section["data"] = rows
		if kind.name != "marks" {
			continue
		}
		for _, mark := range rows {
			subject, hasSubject := mark["subjectId"].(string)
			status, hasStatus := mark["detailStatus"].(string)
			delete(mark, "subjectId")
			delete(mark, "detailStatus")
			if !hasSubject || !hasStatus {
				mark["detailsError"] = "No assessment breakdown is published for this course."
				continue
			}
			html, err := entry.report(ctx, "studentInternalMarkDetailsInner.jsp", url.Values{"iden": {"1"}, "hdnSubjectId": {subject}, "status": {status}})
			var components []map[string]any
			if err == nil {
				components, err = directComponents(html)
			}
			if err != nil {
				if err.Error() == "SESSION_EXPIRED" {
					return failure(401, "SESSION_EXPIRED", "Your portal session expired.")
				}
				mark["detailsError"] = "Assessment details are temporarily unavailable."
				continue
			}
			mark["components"] = components
		}
	}
	return jsonReply(200, result)
}
