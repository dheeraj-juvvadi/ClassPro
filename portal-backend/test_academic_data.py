import unittest
from academic_data import CALENDAR, extras, schedule_report


class AcademicDataTests(unittest.TestCase):
    def test_timetable_times_and_counted_periods(self):
        result = schedule_report({"Day 2": {"01:40 - 03:20": {
            "courseCode": "CS1", "courseTitle": "Algorithms", "room": "TP 101",
            "faculty": "Faculty", "type": "Practical"}}})
        entry = result["entries"][0]
        self.assertEqual((entry["start"], entry["end"], entry["hours"]), ("13:40", "15:20", 2))
        self.assertEqual(entry["dayOrder"], "2")
        self.assertEqual(entry["faculty"], "Faculty")

    def test_refresh_preserves_login_enrichment_and_removes_private_fields(self):
        login = extras({"schedule": {"Day 1": {"08:00 - 08:50": {"code": "CS1"}}},
                        "courses": {"CS1": {"faculty": "Faculty", "credits": "3"}},
                        "profile": {"name": "Student", "mobile": "private"},
                        "attendance": [{"code": "CS1", "present": 10, "conducted": 12}],
                        "cookies": {"session": "private"}})
        refreshed = extras({"attendance": [{"code": "CS1", "present": 11, "conducted": 13}],
                            "monthly": [{"month": "Sep-2026", "present": 11, "absent": 2}]}, login)
        self.assertEqual(refreshed["schedule"], login["schedule"])
        self.assertEqual(refreshed["attendance"]["data"][0]["faculty"], "Faculty")
        self.assertEqual(refreshed["profile"], {"name": "Student"})
        self.assertNotIn("cookies", refreshed)
        self.assertEqual(refreshed["monthly"][0]["present"], 11)

    def test_calendar_uses_exact_dates_without_inventing_missing_days(self):
        by_date = {day["date"]: day for day in CALENDAR}
        self.assertEqual(len(by_date), len(CALENDAR))
        self.assertEqual(by_date["2026-09-01"]["dayOrder"], "4")
        self.assertEqual(by_date["2026-09-04"]["kind"], "holiday")
        self.assertNotIn("2027-09-01", by_date)

    def test_invalid_periods_are_skipped(self):
        self.assertEqual(schedule_report({"Day 1": {"25:00 - 26:00": {"code": "CS1"}}})["entries"], [])
