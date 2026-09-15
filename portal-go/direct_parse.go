package main

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

type directRow struct {
	values []string
	node   *goquery.Selection
}

func cleanText(value string) string { return strings.Join(strings.Fields(value), " ") }
func normalizedHeader(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(cleanText(value)), " ", ""), ".", "")
}

func reportRows(source string, required []string) ([]directRow, error) {
	document, err := goquery.NewDocumentFromReader(strings.NewReader(source))
	if err != nil {
		return nil, err
	}
	if document.Find("#login_form").Length() > 0 {
		return nil, errors.New("SESSION_EXPIRED")
	}
	rows := []directRow{}
	recognized := false
	document.Find("table").Each(func(_ int, table *goquery.Selection) {
		var columns []int
		width := 0
		table.Find("tr").Each(func(_ int, row *goquery.Selection) {
			if row.Closest("table").Get(0) != table.Get(0) || err != nil {
				return
			}
			cells := row.ChildrenFiltered("th,td")
			values := []string{}
			cells.Each(func(_ int, cell *goquery.Selection) { values = append(values, cleanText(cell.Text())) })
			indices := []int{}
			for _, label := range required {
				found := -1
				for index, value := range values {
					if normalizedHeader(value) == normalizedHeader(label) {
						if found >= 0 {
							err = errors.New("duplicate report header")
							return
						}
						found = index
					}
				}
				if found >= 0 {
					indices = append(indices, found)
				}
			}
			if len(indices) == len(required) {
				columns = indices
				width = len(values)
				recognized = true
				return
			}
			if columns == nil || strings.Join(values, "") == "" {
				return
			}
			if len(values) == 1 && regexp.MustCompile(`(?i)^(no (records?|data|results?)( (found|available))?|nothing to display)\.?$`).MatchString(values[0]) {
				return
			}
			if len(values) != width {
				err = errors.New("malformed report row")
				return
			}
			cells.Each(func(_ int, cell *goquery.Selection) {
				for _, attribute := range []string{"colspan", "rowspan"} {
					if value, exists := cell.Attr(attribute); exists && value != "1" {
						err = errors.New("merged report cell")
					}
				}
			})
			selected := []string{}
			for _, index := range columns {
				selected = append(selected, values[index])
			}
			rows = append(rows, directRow{selected, row})
		})
	})
	if err != nil {
		return nil, err
	}
	if !recognized {
		return nil, errors.New("missing report headers")
	}
	return rows, nil
}

var directNumber = regexp.MustCompile(`^(\d+(\.\d+)?|\.\d+)$`)

func reportNumber(value string) (float64, error) {
	value = strings.TrimSpace(strings.TrimSuffix(value, "%"))
	if !directNumber.MatchString(value) {
		return 0, errors.New("invalid report number")
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsInf(parsed, 0) || math.IsNaN(parsed) {
		return 0, errors.New("invalid report number")
	}
	return parsed, nil
}

func directAttendance(source string) ([]map[string]any, error) {
	rows, err := reportRows(source, []string{"Code", "Description", "Max. hours", "Att. hours", "Absent hours", "Total Percentage"})
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		values := row.values
		numbers := []float64{}
		for _, value := range values[2:] {
			number, err := reportNumber(value)
			if err != nil {
				return nil, err
			}
			numbers = append(numbers, number)
		}
		if values[0] == "" || values[1] == "" || math.Abs(numbers[1]+numbers[2]-numbers[0]) > 1e-7 || numbers[3] > 100 || (numbers[0] == 0 && numbers[3] != 0) {
			return nil, errors.New("inconsistent attendance")
		}
		result = append(result, map[string]any{"code": values[0], "title": values[1], "conducted": numbers[0], "present": numbers[1], "absent": numbers[2], "percentage": numbers[3]})
	}
	return result, nil
}

var unpublishedMark = regexp.MustCompile(`(?i)^(|[-–—]|absent|ab|a|n/?a|not (published|entered|available)|unpublished|pending)$`)

func directScore(value string) (map[string]any, error) {
	result := map[string]any{"scored": nil, "total": nil}
	if strings.EqualFold(value, "n/a") {
		result["scoreLabel"] = value
		return result, nil
	}
	slash := strings.LastIndex(value, "/")
	label := value
	var total *float64
	if slash >= 0 {
		label = cleanText(value[:slash])
		maximum := cleanText(value[slash+1:])
		if !unpublishedMark.MatchString(maximum) {
			number, err := reportNumber(maximum)
			if err != nil {
				return nil, err
			}
			total = &number
			result["total"] = number
		}
	}
	if unpublishedMark.MatchString(label) {
		if label != "" {
			result["scoreLabel"] = label
		}
		return result, nil
	}
	number, err := reportNumber(label)
	if err != nil || total == nil || number > *total {
		return nil, errors.New("invalid mark")
	}
	result["scored"] = number
	return result, nil
}
