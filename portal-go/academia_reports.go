package main

import (
	"context"
	"errors"
	"html"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

var academiaCode = regexp.MustCompile(`^[A-Z0-9]{8,12}$`)
var academiaEmbedded = regexp.MustCompile(`(?s)pageSanitizer\.sanitize\('((?:\\.|[^'\\])*)'\)`)

func academiaHTML(source string) string {
	page, _ := goquery.NewDocumentFromReader(strings.NewReader(source))
	if value, exists := page.Find(".zc-pb-embed-placeholder-content[zmlvalue]").Attr("zmlvalue"); exists {
		return html.UnescapeString(value)
	}
	match := academiaEmbedded.FindStringSubmatch(source)
	if len(match) == 2 {
		var decoded strings.Builder
		remaining := match[1]
		for remaining != "" {
			if strings.HasPrefix(remaining, `\-`) || strings.HasPrefix(remaining, `\/`) {
				decoded.WriteByte(remaining[1])
				remaining = remaining[2:]
				continue
			}
			value, _, tail, err := strconv.UnquoteChar(remaining, '\'')
			if err != nil {
				return ""
			}
			decoded.WriteRune(value)
			remaining = tail
		}
		return decoded.String()
	}
	return source
}

func parseAcademiaReports(source string) ([]map[string]any, []map[string]any, error) {
	page, err := goquery.NewDocumentFromReader(strings.NewReader(academiaHTML(source)))
	if err != nil {
		return nil, nil, err
	}
	attendance, marks := []map[string]any{}, []map[string]any{}
	titles := map[string]string{}
	var parseErr error
	page.Find("tr").Each(func(_ int, row *goquery.Selection) {
		cells := row.ChildrenFiltered("td")
		if cells.Length() < 9 {
			return
		}
		code := strings.TrimSpace(strings.TrimSuffix(cleanText(cells.Eq(0).Text()), "Regular"))
		if !academiaCode.MatchString(code) {
			return
		}
		conducted, firstErr := reportNumber(cells.Eq(6).Text())
		absent, secondErr := reportNumber(cells.Eq(7).Text())
		percent, thirdErr := reportNumber(cells.Eq(8).Text())
		if firstErr != nil || secondErr != nil || thirdErr != nil || absent > conducted || percent > 100 {
			parseErr = errors.New("invalid Academia attendance row")
			return
		}
		title := cleanText(cells.Eq(1).Text())
		titles[code] = title
		attendance = append(attendance, map[string]any{"code": code, "title": title, "conducted": conducted, "absent": absent, "present": conducted - absent, "percentage": percent, "category": cleanText(cells.Eq(2).Text()), "slot": cleanText(cells.Eq(4).Text())})
	})
	page.Find("tr").Each(func(_ int, row *goquery.Selection) {
		cells := row.ChildrenFiltered("td")
		if cells.Length() != 3 {
			return
		}
		code := cleanText(cells.Eq(0).Text())
		if !academiaCode.MatchString(code) {
			return
		}
		components := []map[string]any{}
		var scored, total float64
		published := false
		cells.Eq(2).Find("table td").Each(func(_ int, cell *goquery.Selection) {
			copy := cell.Clone()
			copy.Find("br").ReplaceWithHtml("\n")
			parts := []string{}
			for _, part := range strings.Split(copy.Text(), "\n") {
				if cleanText(part) != "" {
					parts = append(parts, cleanText(part))
				}
			}
			if len(parts) < 2 {
				return
			}
			split := strings.LastIndex(parts[0], "/")
			if split < 0 {
				parseErr = errors.New("unknown assessment maximum")
				return
			}
			component, scoreErr := directScore(parts[1] + " / " + parts[0][split+1:])
			if scoreErr != nil {
				parseErr = scoreErr
				return
			}
			component["name"] = strings.TrimSpace(parts[0][:split])
			components = append(components, component)
			got, valid := component["scored"].(float64)
			maximum, validMax := component["total"].(float64)
			if valid && validMax {
				scored += got
				total += maximum
				published = true
			}
		})
		title := titles[code]
		if title == "" {
			title = code
		}
		mark := map[string]any{"code": code, "title": title, "components": components, "scored": nil, "total": nil}
		if published {
			mark["scored"], mark["total"] = scored, total
		}
		marks = append(marks, mark)
	})
	if parseErr != nil {
		return nil, nil, parseErr
	}
	if len(attendance) == 0 {
		return nil, nil, errors.New("Academia attendance format not recognized")
	}
	return attendance, marks, nil
}

func (entry *directSession) academiaReports(ctx context.Context) reply {
	data, response, err := entry.request(ctx, "GET", academiaAttendancePath, nil, http.Header{"Referer": {entry.base + "/"}})
	if err != nil {
		return unavailable()
	}
	if academiaExpired(data, response) {
		entry.authenticated = false
		return failure(401, "SESSION_EXPIRED", "Your Academia session expired. Please sign in.")
	}
	if response.StatusCode != 200 {
		return unavailable()
	}
	attendance, marks, err := parseAcademiaReports(string(data))
	if err != nil {
		return failure(502, "PORTAL_CHANGED", "Academia report format was not recognized.")
	}
	return jsonReply(200, map[string]any{"attendance": map[string]any{"data": attendance}, "marks": map[string]any{"data": marks}, "updatedAt": time.Now().UTC().Format(time.RFC3339), "provider": "academia"})
}
