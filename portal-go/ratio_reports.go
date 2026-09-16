package main

import (
	"encoding/json"
	"time"
)

func ratioReply(action string, status int, body json.RawMessage) reply {
	if status != 200 || (action != "login" && action != "reports") {
		return reply{status, body}
	}
	var result struct {
		AttendanceHTML string `json:"attendanceHTML"`
		Marks          []struct {
			Code        string                                       `json:"courseCode"`
			Title       string                                       `json:"title"`
			Scored      *float64                                     `json:"totalMarkGot"`
			Total       *float64                                     `json:"totalMaxMarks"`
			Assessments []struct{ Title, Marks, Total, Date string } `json:"assessments"`
		} `json:"marks"`
	}
	if json.Unmarshal(body, &result) != nil {
		return unavailable()
	}
	attendance, err := directAttendance(result.AttendanceHTML)
	if err != nil {
		return failure(502, "PORTAL_CHANGED", "SRM did not return a verifiable attendance report.")
	}
	if action == "login" {
		return jsonReply(200, map[string]bool{"authenticated": true})
	}
	marks := []map[string]any{}
	for _, subject := range result.Marks {
		components := []map[string]any{}
		for _, assessment := range subject.Assessments {
			component, err := directScore(assessment.Marks + " / " + assessment.Total)
			if err != nil {
				continue
			}
			component["name"], component["enteredOn"] = assessment.Title, assessment.Date
			components = append(components, component)
		}
		marks = append(marks, map[string]any{"code": subject.Code, "title": subject.Title,
			"scored": subject.Scored, "total": subject.Total, "components": components})
	}
	return jsonReply(200, map[string]any{"updatedAt": time.Now().UTC().Format(time.RFC3339),
		"attendance": map[string]any{"data": attendance}, "marks": map[string]any{"data": marks}})
}
