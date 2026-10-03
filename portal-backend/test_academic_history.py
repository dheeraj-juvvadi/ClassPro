import sys
import unittest
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent / "upstream"))
from services.portal_academic_service import PortalAcademicService
from core.portal_client import PortalClient, HRD_URL, GRADES_URL
from academic_data import extras

HEADER = '<tr><th>Semester</th><th>Month / Year</th><th>Code</th><th>Description</th><th>Credit</th><th>Grade</th></tr>'


def course(sem, code, credits, grade):
    return f'<tr><td>{sem}</td><td>MAY/2025</td><td>{code}</td><td>Sample &amp; subject</td><td>{credits}</td><td>{grade}</td></tr>'


REPORT = '<table>' + HEADER + course(1, 'CS1', 4, 'A') + course(1, 'NC1', 0, 'O') + \
    '<tr><td colspan="5">SGPA</td><td>8.000</td></tr>' + course(2, 'CS2', 3, 'O') + \
    course(2, 'CS3', 2, 'F') + '<tr><td colspan="5">SGPA</td><td>6.000</td></tr>' + \
    '<tr><td colspan="5">CGPA</td><td>7.42</td></tr></table>' + \
    '<table><tr><td>Credits Registered</td><td>9</td></tr><tr><td>Credits Earned</td><td>7</td></tr>' + \
    '<tr><td>Credits Required</td><td>160</td></tr></table>'


class HistoryParserTests(unittest.TestCase):
    def test_official_totals_and_semesters_are_distinct(self):
        result = PortalAcademicService.parse(REPORT)
        self.assertEqual([s['gpa'] for s in result['semesters']], [8, 6])
        self.assertEqual([s['earnedCredits'] for s in result['semesters']], [4, 3])
        self.assertEqual(result['currentCgpa'], 7.42)  # Never replace published CGPA with an average.
        self.assertEqual((result['completedCredits'], result['registeredCredits'], result['requiredCredits']), (7, 9, 160))
        self.assertEqual(result['semesters'][0]['courses'][0]['title'], 'Sample & subject')

    def test_failed_course_sidebar_is_not_counted_twice(self):
        result = PortalAcademicService.parse(REPORT + '<table>' + HEADER + course(2, 'CS3', 2, 'F') + '</table>')
        self.assertEqual(sum(len(s['courses']) for s in result['semesters']), 4)

    def test_unpublished_invalid_and_changed_layout_are_not_zero_gpa(self):
        for html in ['', '<form id="login_form"></form>', '<table><tr><td>GPA</td><td>8</td></tr></table>']:
            self.assertIsNone(PortalAcademicService.parse(html))
        empty = PortalAcademicService.parse('<table>' + HEADER + '<tr><td colspan="6">No Record found.</td></tr></table>')
        self.assertEqual(empty['status'], 'empty')
        self.assertNotIn('currentCgpa', empty)
        result = PortalAcademicService.parse('<table>' + HEADER + course(1, 'CS1', 4, '*') + course(1, 'CS2', -2, 'O') + '</table>')
        self.assertNotIn('gpa', result['semesters'][0])
        self.assertEqual(result['semesters'][0]['earnedCredits'], 0)
        self.assertTrue(result['partial'])

    def test_retake_attempts_remain_separate_and_credits_are_not_summed_for_cgpa(self):
        html = REPORT.replace(course(2, 'CS3', 2, 'F'), course(2, 'CS3', 2, 'F') + course(2, 'CS3', 2, 'A').replace('MAY/2025', 'NOV/2025'))
        result = PortalAcademicService.parse(html)
        self.assertEqual(len(result['semesters']), 3)
        self.assertEqual(result['completedCredits'], 7)

    def test_refresh_failure_preserves_history_and_autofill(self):
        first = extras({'profile': {'name': 'Student', 'currentCgpa': 2}, 'academicHistory': PortalAcademicService.parse(REPORT)})
        self.assertEqual(first['profile']['currentCgpa'], 7.42)
        second = extras({'profile': {'name': 'Student'}, 'academicHistory': {'status': 'unavailable'}}, first)
        self.assertTrue(second['academicHistory']['stale'])
        self.assertEqual(second['profile']['completedCredits'], 7)
        empty = extras({'academicHistory': {'status': 'empty', 'semesters': []}}, first)
        self.assertEqual(empty['academicHistory']['semesters'], [])
        self.assertNotIn('currentCgpa', empty['profile'])


class HistoryFetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_report_and_current_form_fields_with_no_retries(self):
        calls = []
        def respond(request):
            calls.append(request)
            if str(request.url) == HRD_URL:
                return httpx.Response(200, text='<input name="hdnFormDetails" value="fresh"><input name="csrfPreventionSalt" value="salt">')
            self.assertEqual(str(request.url), GRADES_URL)
            self.assertEqual(request.method, 'POST')
            self.assertIn(b'iden=8', request.content)
            self.assertIn(b'hdnFormDetails=fresh', request.content)
            self.assertIn(b'csrfPreventionSalt=salt', request.content)
            self.assertEqual(request.headers['referer'], HRD_URL)
            return httpx.Response(200, text=REPORT)
        client = object.__new__(PortalClient)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client.client:
            result = await client.get_academic_history()
        self.assertEqual(result['currentCgpa'], 7.42)
        self.assertEqual(len(calls), 2)

    async def test_expired_and_oversized_reports_fail_closed(self):
        for content in ['<form id="login_form"></form>', 'x' * (512 * 1024 + 1)]:
            calls = []
            def respond(request):
                calls.append(request)
                return httpx.Response(200, text=content)
            client = object.__new__(PortalClient)
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client.client:
                self.assertEqual(await client.get_academic_history(), {'status': 'unavailable'})
            self.assertEqual(len(calls), 1)

    async def test_report_unavailability_does_not_fail_other_reports(self):
        def respond(request):
            if str(request.url) == HRD_URL:
                return httpx.Response(200, text='<input name="hdnFormDetails" value="1"><input name="csrfPreventionSalt" value="">')
            return httpx.Response(503)
        client = object.__new__(PortalClient)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client.client:
            self.assertEqual(await client.get_academic_history(), {'status': 'unavailable'})
