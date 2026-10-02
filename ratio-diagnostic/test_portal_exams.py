import asyncio
import copy
import json
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx

sys.path.insert(0, str(Path(__file__).parent / "upstream"))
from services.portal_exam_service import candidates, sessions, table_records
from portal_exams import (
    CHECK_SECONDS, RETRY_SECONDS, OFFICIAL, SCRIBE, SUBJECTS,
    collect, read, refresh_exams, stamp,
)


def setUpModule():
    # A missing mock must never reach a live portal, even if production catches it.
    guard = patch('httpx.AsyncHTTPTransport.handle_async_request',
                  new_callable=AsyncMock, side_effect=AssertionError('Live HTTP forbidden'))
    blocked = guard.start()
    unittest.addModuleCleanup(guard.stop)
    unittest.addModuleCleanup(blocked.assert_not_called)


def selector(values):
    return '<select id="txtExamMonthYear">' + ''.join(
        f'<option value="{value}">Untrusted visible label</option>'
        for value in values) + '</select>'


def scribe(exam_date="", code="CS1", session="FN"):
    return f'''<table><tr><th colspan="7">Subjects List</th></tr><tr><th></th>
      <th>Subject Code</th><th>Subject Description</th><th>Date</th><th>Session</th>
      <th>Type</th><th>Scribe Amount</th></tr><tr><td><input value="private-id"></td>
      <td>{code}</td><td>Networks</td><td>{exam_date}</td><td>{session}</td><td>T-EXT</td><td>300</td></tr></table>'''


def official(exam_date=None, code="CS1"):
    row = '<tr><td colspan="8">No subjects found</td></tr>' if exam_date is None else (
        f'<tr><td>5</td><td>{code}</td><td>Networks</td><td>{exam_date} FN</td><td>private-hall</td><td>private-seat</td></tr>')
    return '<table><tr><th>Sem/Year/Trim</th><th>Subject Code</th><th>Subject Description</th><th>Date &amp; Session</th><th>Hall No.</th><th>Seat No.</th></tr>'+row+'</table>'


NOW = datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp()


def timestamp(year, month, day=2):
    return datetime(year, month, day, tzinfo=timezone.utc).timestamp()


class Sources:
    """Strict fixtures: missing period responses are test errors, not outages."""

    def __init__(self, options=(), responses=None, official_html=None, selector_html=None):
        self.calls = []
        self.unexpected = []
        self.options = options
        self.responses = responses or {}
        self.official_html = official() if official_html is None else official_html
        self.selector_html = selector(options) if selector_html is None else selector_html

    def handle(self, request):
        self.calls.append(request)
        url = str(request.url.copy_with(query=None))
        if url == OFFICIAL:
            body = self.official_html
        elif url == SCRIBE:
            body = self.selector_html
        elif url == SUBJECTS:
            params = request.url.params
            value = params.get('hdnExamMonth', '') + '_' + params.get('hdnExamYear', '')
            if value not in self.responses:
                self.unexpected.append(value)
                return httpx.Response(500)
            body = self.responses[value]
        else:
            self.unexpected.append(url)
            return httpx.Response(500)
        if isinstance(body, Exception):
            raise body
        return body if isinstance(body, httpx.Response) else httpx.Response(200, text=body)

    def assert_safe(self, case):
        case.assertEqual(self.unexpected, [], 'Missing fixtures or unexpected endpoint')
        for call in self.calls:
            case.assertEqual(call.method, 'GET')
            case.assertEqual(call.content, b'')
            url = str(call.url.copy_with(query=None))
            expected = ({'iden': '126', 'hdnFormDetails': '126', 'filter': ''}
                        if url == OFFICIAL else
                        {'iden': '49', 'hdnFormDetails': '49', 'filter': ''})
            if url == SUBJECTS:
                case.assertEqual(set(call.url.params), {'iden', 'hdnExamMonth', 'hdnExamYear'})
                case.assertEqual(call.url.params['iden'], '1')
            else:
                case.assertEqual(dict(call.url.params), expected)


class ParserTests(unittest.TestCase):
    def test_session_values_not_visible_label_drive_discovery(self):
        options = sessions(selector(['0','11_2025','5_2026','11_2026','12_2026','1_2027']), date(2026,10,2))
        self.assertEqual([item['value'] for item in candidates(options,date(2026,10,2))], ['11_2026','12_2026','1_2027'])
        self.assertEqual(options[-1]['label'], 'Jan 2027')
        old = sessions(selector(['0','11_2025','5_2026']),date(2026,10,2))
        self.assertEqual(candidates(old,date(2026,10,2))[0]['value'],'11_2026')
        self.assertTrue(candidates(old,date(2026,10,2))[0]['provisional'])

    def test_blank_is_unpublished_and_private_application_fields_are_dropped(self):
        row = table_records(scribe(), 'scribe')[0]
        self.assertIsNone(row['date'])
        self.assertNotIn('private', str(row))
        self.assertEqual(row['code'],'CS1')
        self.assertEqual(table_records(official(),'official'),[])

    def test_official_combined_date_session_and_revisions(self):
        row = table_records(official('<s>10-11-2026</s> 12-11-2026'),'official')[0]
        self.assertEqual(row['date'],'2026-11-12')
        self.assertEqual(row['session'],'FN')
        self.assertNotIn('private',str(row))
        self.assertEqual(table_records(scribe('05/12/2026'),'scribe')[0]['date'],'2026-12-05')

    def test_unknown_layout_and_invalid_date_are_not_empty_success(self):
        for html in ['<html>new format</html>','<form id="login_form"></form>',scribe('31-11-2026')]:
            with self.assertRaises(ValueError):table_records(html,'scribe')
        with self.assertRaises(ValueError):sessions('<select id="renamed"></select>')

    def test_discovery_includes_april_may_and_bounds_requests_to_six(self):
        today = date(2026, 10, 2)
        values = ['12_2027', '10_2027', '5_2027', '4_2027', '1_2027',
                  '12_2026', '11_2026', '01_2027', '0', '13_2026', '8_2026']
        chosen = candidates(sessions(selector(values), today), today)
        self.assertEqual([row['value'] for row in chosen],
                         ['11_2026', '12_2026', '1_2027', '4_2027', '5_2027', '10_2027'])
        self.assertTrue(all(not row['provisional'] for row in chosen))

    def test_window_and_2027_2028_rollover_do_not_invent_sessions(self):
        for today, values, expected in [
            (date(2027, 1, 1), ['11_2026', '12_2026', '4_2027', '5_2027', '1_2028', '2_2028'],
             ['12_2026', '4_2027', '5_2027', '1_2028']),
            (date(2027, 12, 31), ['10_2027', '11_2027', '12_2027', '1_2028', '4_2028'],
             ['11_2027', '12_2027', '1_2028', '4_2028']),
            (date(2028, 1, 1), ['11_2027', '12_2027', '1_2028', '5_2028'],
             ['12_2027', '1_2028', '5_2028']),
        ]:
            with self.subTest(today=today):
                chosen = candidates(sessions(selector(values), today), today)
                self.assertEqual([row['value'] for row in chosen], expected)
        self.assertEqual(candidates([], date(2027, 1, 1)), [])

    def test_november_fallback_has_a_fixed_expiry(self):
        for today, expected in [(date(2026, 6, 30), []), (date(2026, 7, 1), ['11_2026']),
                                (date(2026, 12, 31), ['11_2026']), (date(2027, 1, 1), [])]:
            with self.subTest(today=today):
                self.assertEqual([row['value'] for row in candidates([], today)], expected)

    def test_parser_returns_only_public_exam_fields(self):
        private = '<input name="applicationId" value="private-application"><input value="private-student">'
        html = '<form action="ScribePayment.jsp" method="post">' + private + scribe() + '</form>'
        for source, body in [('scribe', html), ('official', official('14-11-2026'))]:
            with self.subTest(source=source):
                records = table_records(body, source)
                self.assertEqual(set(records[0]), {'code', 'title', 'date', 'session', 'type'})
                self.assertNotIn('private', json.dumps(records))
                self.assertNotIn('300', json.dumps(records))

    def test_blank_markers_and_recognized_empty_tables(self):
        for value in ['', '-', '--', 'N/A', 'Not published', 'pending']:
            with self.subTest(value=value):
                self.assertIsNone(table_records(scribe(value), 'scribe')[0]['date'])
        self.assertEqual(table_records(official(), 'official'), [])

    def test_login_pages_never_count_as_success_even_with_table_markup(self):
        for prefix in ['theGR8LoginLoader', '<form id="login_form">', '<input name="password">']:
            with self.subTest(prefix=prefix):
                with self.assertRaises(ValueError):
                    table_records(prefix + scribe(), 'scribe')
                with self.assertRaises(ValueError):
                    sessions(prefix + selector(['11_2026']))


class CollectionTests(unittest.IsolatedAsyncioTestCase):
    async def run_source(self, options, responses, previous=None, official_html=None,
                         selector_html=None, now=NOW):
        sources = Sources(options, responses, official_html, selector_html)
        async with httpx.AsyncClient(transport=httpx.MockTransport(sources.handle)) as client:
            result = await collect(client, previous, now)
        sources.assert_safe(self)
        self.assertNotIn('private', json.dumps(result))
        return result, sources.calls

    async def test_november_workaround_is_pending_until_dates_exist(self):
        body = scribe()
        row = body[body.index('<tr><td>'):body.index('</table>')]
        body = body.replace('</table>', ''.join(row.replace('CS1', f'CS{i}') for i in range(2, 5)) + '</table>')
        result,_=await self.run_source(['11_2025','5_2026'],{'11_2026':body})
        self.assertEqual(result['status'],'pending')
        self.assertEqual(result['sessionId'],'11_2026')
        self.assertTrue(result['provisional'])
        self.assertEqual(len(result['entries']), 4)
        self.assertTrue(all(row['date'] is None and row['period'] == '11_2026'
                            and row['provisional'] and row['sourceKind'] == 'scribe'
                            and not row['stale'] for row in result['entries']))

    async def test_added_december_option_is_collected_alongside_november(self):
        result,calls=await self.run_source(['11_2026','12_2026'],
                                         {'11_2026':scribe(), '12_2026':scribe('04-12-2026')})
        self.assertEqual(result['sessionId'],'12_2026')
        self.assertEqual(result['entries'][0]['date'],'2026-12-04')
        self.assertEqual({row['period'] for row in result['entries']}, {'11_2026', '12_2026'})
        self.assertEqual(len(calls), 4)
        self.assertFalse(result['stale'])

    async def test_dedicated_timetable_takes_priority(self):
        result,calls=await self.run_source(['11_2026'],{'11_2026':scribe('12-11-2026')},
                                         official_html=official('14-11-2026'))
        self.assertEqual(result['sourceKind'],'official')
        self.assertFalse(result['provisional'])
        self.assertEqual(len(result['entries']), 1)
        self.assertEqual(result['entries'][0]['date'], '2026-11-14')
        self.assertEqual(result['entries'][0]['period'], '11_2026')
        self.assertEqual(len(calls),3)

    async def test_failure_preserves_last_success_but_successful_blank_clears_date(self):
        old,_=await self.run_source(['11_2026'],{'11_2026':scribe('14-11-2026')})
        cached=copy.deepcopy(old)
        failed,_=await self.run_source(['11_2026'],{'11_2026':'layout changed'},previous=old)
        self.assertTrue(failed['stale'])
        self.assertEqual(failed['entries'][0]['date'], old['entries'][0]['date'])
        self.assertEqual(failed['checkedAt'], old['checkedAt'])
        self.assertEqual(failed['nextCheckAt'], (NOW + RETRY_SECONDS) * 1000)
        fresh,_=await self.run_source(['11_2026'],{'11_2026':scribe()},previous=old)
        self.assertIsNone(fresh['entries'][0]['date']);self.assertEqual(fresh['status'],'pending')
        self.assertEqual(old,cached)

    async def test_bounded_cached_refresh_skips_network(self):
        old={'nextCheckAt':(NOW+CHECK_SECONDS)*1000,'entries':[]}
        with patch('portal_exams.PortalClient') as client:
            self.assertEqual(await refresh_exams({},old,NOW),old)
            client.assert_not_called()

    async def test_multiple_periods_include_april_and_may_2027(self):
        periods = ['11_2026', '12_2026', '4_2027', '5_2027']
        bodies = dict(zip(periods, [scribe(), scribe('04-12-2026'),
                                    scribe('08-04-2027'), scribe('12-05-2027')]))
        result, calls = await self.run_source(periods, bodies)
        self.assertEqual({row['period'] for row in result['entries']}, set(periods))
        self.assertEqual({row['value'] for row in result['sessions']}, set(periods))
        self.assertEqual(len(calls), 6)
        self.assertEqual(result['nextCheckAt'], (NOW + CHECK_SECONDS) * 1000)

    async def test_december_session_dates_may_cross_year_boundary(self):
        result, _ = await self.run_source(
            ['12_2027', '1_2028', '4_2028', '5_2028'],
            {'12_2027': scribe('03-01-2028'), '1_2028': scribe('15-01-2028'),
             '4_2028': scribe('08-04-2028'), '5_2028': scribe()},
            now=timestamp(2027, 12))
        self.assertEqual(result['entries'][0]['period'], '12_2027')
        self.assertEqual(result['entries'][0]['date'], '2028-01-03')
        self.assertFalse(result['stale'])

    async def test_january_expiry_does_not_request_provisional_november(self):
        result, calls = await self.run_source(
            ['11_2026', '4_2027', '5_2027'], {'4_2027': scribe(), '5_2027': scribe()},
            now=timestamp(2027, 1))
        self.assertEqual({row['period'] for row in result['entries']}, {'4_2027', '5_2027'})
        self.assertEqual(len(calls), 4)

    async def test_partial_failure_preserves_only_failed_period(self):
        periods = ['11_2026', '12_2026']
        old, _ = await self.run_source(periods, {'11_2026': scribe('14-11-2026'),
                                               '12_2026': scribe('04-12-2026')})
        saved = copy.deepcopy(old)
        result, _ = await self.run_source(periods, {'11_2026': 'layout changed',
                                                  '12_2026': scribe()}, previous=old)
        by_period = {row['period']: row for row in result['entries']}
        self.assertEqual(by_period['11_2026']['date'], '2026-11-14')
        self.assertTrue(by_period['11_2026']['stale'])
        self.assertIsNone(by_period['12_2026']['date'])
        self.assertFalse(by_period['12_2026']['stale'])
        self.assertTrue(result['stale'])
        self.assertEqual(old, saved)

    async def test_successful_no_subjects_clears_previous_period(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe('14-11-2026')})
        body = scribe()
        body = body[:body.index('<tr><td>')] + '<tr><td colspan="7">No subjects found</td></tr></table>'
        result, _ = await self.run_source(['11_2026'], {'11_2026': body}, previous=old)
        self.assertEqual(result['entries'], [])
        self.assertEqual(result['status'], 'pending')
        self.assertFalse(result['stale'])

    async def test_successful_empty_official_clears_previous_official_dates(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe()},
                                       official_html=official('14-11-2026'))
        result, _ = await self.run_source(['11_2026'], {'11_2026': scribe()}, previous=old)
        self.assertEqual(result['status'], 'pending')
        self.assertEqual(len(result['entries']), 1)
        self.assertIsNone(result['entries'][0]['date'])

    async def test_official_failure_retains_cached_official_rows(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe(code='CS2')},
                                       official_html=official('14-11-2026'))
        result, _ = await self.run_source(['11_2026'], {'11_2026': scribe(code='CS2')},
                                          previous=old, official_html='layout changed')
        row = next(row for row in result['entries'] if row['code'] == 'CS1')
        self.assertEqual(row['sourceKind'], 'official')
        self.assertEqual(row['date'], '2026-11-14')
        self.assertTrue(row['stale'])

    async def test_wrong_session_dates_are_failures_not_empty_success(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe('14-11-2026')})
        result, _ = await self.run_source(['11_2026'], {'11_2026': scribe('14-11-2025')}, previous=old)
        self.assertEqual(result['entries'][0]['date'], '2026-11-14')
        self.assertTrue(result['stale'])

    async def test_unrecognized_or_login_sources_return_unavailable(self):
        for body in ['<html>changed</html>', '<form id="login_form"></form>']:
            with self.subTest(body=body):
                result, calls = await self.run_source([], {}, official_html=body, selector_html=body)
                self.assertEqual(result['status'], 'unavailable')
                self.assertEqual(result['entries'], [])
                self.assertTrue(result['stale'])
                self.assertEqual(result['nextCheckAt'], (NOW + RETRY_SECONDS) * 1000)
                self.assertEqual(len(calls), 2)

    async def test_official_overrides_only_matching_period_blank_rows(self):
        periods = ['11_2026', '12_2026', '4_2027', '5_2027']
        result, _ = await self.run_source(periods, {value: scribe() for value in periods},
                                          official_html=official('14-11-2026'))
        by_period = {row['period']: row for row in result['entries']}
        self.assertEqual(set(by_period), set(periods))
        self.assertEqual(by_period['11_2026']['sourceKind'], 'official')
        self.assertTrue(all(by_period[value]['sourceKind'] == 'scribe' for value in periods[1:]))
        self.assertEqual(result['sourceKind'], 'mixed')

    async def test_official_overrides_only_matching_period_dated_rows(self):
        result, _ = await self.run_source(['11_2026', '12_2026'],
                                          {'11_2026': scribe('12-11-2026'), '12_2026': scribe('04-12-2026')},
                                          official_html=official('14-11-2026'))
        self.assertEqual({(row['period'], row['date']) for row in result['entries']},
                         {('11_2026', '2026-11-14'), ('12_2026', '2026-12-04')})

    async def test_partial_period_failure_retries_in_fifteen_minutes(self):
        result, _ = await self.run_source(['11_2026', '12_2026'],
                                          {'11_2026': httpx.ReadTimeout('synthetic timeout'),
                                           '12_2026': scribe()})
        self.assertTrue(result['stale'])
        self.assertEqual(result['nextCheckAt'], (NOW + RETRY_SECONDS) * 1000)

    async def test_official_failure_without_old_rows_is_stale_and_retries(self):
        result, _ = await self.run_source(['11_2026'], {'11_2026': scribe()},
                                          official_html=httpx.ReadTimeout('synthetic timeout'))
        self.assertEqual((result['stale'], result['nextCheckAt']),
                         (True, (NOW + RETRY_SECONDS) * 1000))

    async def test_selector_failure_keeps_cached_periods_alongside_new_official(self):
        old, _ = await self.run_source(['11_2026', '12_2026'],
                                       {'11_2026': scribe('12-11-2026'), '12_2026': scribe('04-12-2026')})
        result, calls = await self.run_source([], {}, previous=old,
                                              official_html=official('14-11-2026'),
                                              selector_html='<form id="login_form"></form>')
        by_period = {row['period']: row for row in result['entries']}
        self.assertEqual(set(by_period), {'11_2026', '12_2026'})
        self.assertTrue(by_period['12_2026']['stale'])
        self.assertFalse(by_period['11_2026']['stale'])
        self.assertTrue(result['stale'])
        self.assertEqual(result['nextCheckAt'], (NOW + RETRY_SECONDS) * 1000)
        self.assertEqual(len(calls), 2)

    async def test_selector_failure_without_cached_rows_marks_partial_success(self):
        result, _ = await self.run_source([], {}, official_html=official('14-11-2026'),
                                          selector_html='layout changed')
        self.assertEqual(result['status'], 'published')
        self.assertEqual((result['stale'], result['nextCheckAt']),
                         (True, (NOW + RETRY_SECONDS) * 1000))

    async def test_source_kind_matches_cached_official_and_fresh_scribe(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe(code='CS2')},
                                       official_html=official('14-11-2026'))
        result, _ = await self.run_source(['11_2026'], {'11_2026': scribe(code='CS2')},
                                          previous=old, official_html='layout changed')
        self.assertEqual({row['sourceKind'] for row in result['entries']}, {'official', 'scribe'})
        self.assertEqual(result['sourceKind'], 'mixed')

    async def test_successful_official_empty_is_pending_when_no_sessions_are_offered(self):
        now = timestamp(2027, 1)
        result, _ = await self.run_source([], {}, now=now)
        self.assertEqual(result['status'], 'pending')
        self.assertFalse(result['stale'])
        self.assertEqual(result['nextCheckAt'], (now + CHECK_SECONDS) * 1000)

    async def test_all_sources_failed_marks_each_retained_period_stale(self):
        old, _ = await self.run_source(['11_2026'], {'11_2026': scribe('14-11-2026')})
        result, _ = await self.run_source(['11_2026'], {'11_2026': 'layout changed'},
                                          previous=old, official_html='layout changed')
        self.assertEqual(result['entries'][0]['date'], '2026-11-14')
        self.assertTrue(result['entries'][0]['stale'])


class TestStream(httpx.AsyncByteStream):
    def __init__(self, chunks, gate=None):
        self.chunks = chunks
        self.gate = gate
        self.started = asyncio.Event()
        self.closed = False
        self.emitted = 0

    async def __aiter__(self):
        self.started.set()
        if self.gate is not None:
            await self.gate.wait()
        for chunk in self.chunks:
            self.emitted += 1
            yield chunk

    async def aclose(self):
        self.closed = True


class RefreshTests(unittest.IsolatedAsyncioTestCase):
    async def refresh_fixture(self, sources, previous=None, now=NOW):
        client = httpx.AsyncClient(transport=httpx.MockTransport(sources.handle))
        close = AsyncMock(wraps=client.aclose)
        factory = patch('portal_exams.PortalClient', return_value=SimpleNamespace(client=client))
        with factory as constructor, patch.object(client, 'aclose', close):
            result = await refresh_exams({}, previous, now)
        constructor.assert_called_once_with({})
        close.assert_awaited_once()
        self.assertTrue(client.is_closed)
        sources.assert_safe(self)
        return result

    async def test_refresh_closes_client_on_success_and_source_failures(self):
        for body, status in [(scribe(), 'pending'), ('changed layout', 'unavailable'),
                             (httpx.ReadTimeout('synthetic timeout'), 'unavailable')]:
            with self.subTest(status=status, body_type=type(body).__name__):
                result = await self.refresh_fixture(Sources(['11_2026'], {'11_2026': body}))
                self.assertEqual(result['status'], status)

    async def test_cache_ttl_bounds_and_copy_isolation(self):
        for offset in [1, CHECK_SECONDS * 1000]:
            with self.subTest(offset=offset):
                old = {'nextCheckAt': NOW * 1000 + offset, 'entries': [{'date': None}]}
                with patch('portal_exams.PortalClient') as constructor:
                    result = await refresh_exams({}, old, NOW)
                constructor.assert_not_called()
                result['entries'][0]['date'] = 'changed in caller'
                self.assertIsNone(old['entries'][0]['date'])
        for expiry in [NOW * 1000, NOW * 1000 - 1, (NOW + CHECK_SECONDS) * 1000 + 1,
                       'tomorrow', None, float('nan'), float('inf')]:
            with self.subTest(expiry=expiry):
                result = await self.refresh_fixture(Sources(['11_2026'], {'11_2026': scribe()}),
                                                     {'nextCheckAt': expiry, 'entries': []})
                self.assertEqual(result['status'], 'pending')
                self.assertEqual(result['checkedAt'], stamp(NOW))

    async def test_failure_retry_cache_expires_at_fifteen_minutes(self):
        failed = await self.refresh_fixture(Sources(['11_2026'], {'11_2026': 'changed layout'}))
        with patch('portal_exams.PortalClient') as constructor:
            cached = await refresh_exams({}, failed, NOW + RETRY_SECONDS - 1)
        constructor.assert_not_called()
        self.assertEqual(cached, failed)
        fresh = await self.refresh_fixture(Sources(['11_2026'], {'11_2026': scribe()}),
                                            failed, NOW + RETRY_SECONDS)
        self.assertEqual(fresh['status'], 'pending')
        self.assertFalse(fresh['stale'])

    async def test_deadline_cancels_children_and_closes_client(self):
        started = asyncio.Event()
        finished = []

        async def handler(request):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                finished.append(request.url.path)

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        contexts = []
        real_timeout = asyncio.timeout

        def deadline(seconds):
            self.assertEqual(seconds, 25)
            context = real_timeout(None)
            contexts.append(context)
            return context

        with patch('portal_exams.PortalClient', return_value=SimpleNamespace(client=client)), \
                patch('portal_exams.asyncio.timeout', side_effect=deadline):
            task = asyncio.create_task(refresh_exams({}, now=NOW))
            try:
                await asyncio.wait_for(started.wait(), 1)
                contexts[0].reschedule(asyncio.get_running_loop().time())
                result = await asyncio.wait_for(task, 1)
                self.assertTrue(client.is_closed)
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                await client.aclose()
        self.assertEqual(result['status'], 'unavailable')
        self.assertEqual(len(finished), 2)

    async def test_external_cancellation_propagates_and_closes_initial_requests(self):
        streams = []

        def handler(request):
            stream = TestStream([b'not read'], gate=asyncio.Event())
            streams.append(stream)
            return httpx.Response(200, stream=stream)

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        with patch('portal_exams.PortalClient', return_value=SimpleNamespace(client=client)):
            task = asyncio.create_task(refresh_exams({}, now=NOW))
            try:
                async with asyncio.timeout(1):
                    while len(streams) < 2:
                        await asyncio.sleep(0)
                    await asyncio.gather(*(stream.started.wait() for stream in streams))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(client.is_closed)
                self.assertTrue(all(stream.closed for stream in streams))
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                await client.aclose()

    async def test_subject_loading_limits_concurrency_and_cancellation_drains_children(self):
        periods = ['11_2026', '12_2026', '1_2027', '2_2027', '4_2027', '5_2027']
        streams, calls = [], []
        ready = asyncio.Event()

        def handler(request):
            calls.append(request)
            url = str(request.url.copy_with(query=None))
            if url == OFFICIAL:
                return httpx.Response(200, text=official())
            if url == SCRIBE:
                return httpx.Response(200, text=selector(periods))
            stream = TestStream([b'not read'], gate=asyncio.Event())
            streams.append(stream)
            if len(streams) == 2:
                ready.set()
            return httpx.Response(200, stream=stream)

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        with patch('portal_exams.PortalClient', return_value=SimpleNamespace(client=client)):
            task = asyncio.create_task(refresh_exams({}, now=NOW))
            try:
                await asyncio.wait_for(ready.wait(), 1)
                self.assertEqual(len(streams), 2)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(client.is_closed)
                self.assertTrue(all(stream.closed for stream in streams))
                self.assertEqual(len(calls), 4)
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                await client.aclose()


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_closes_response_stream(self):
        stream = TestStream([b'<html>', b'ok</html>'])
        transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))
        async with httpx.AsyncClient(transport=transport) as client:
            self.assertEqual(await read(client, OFFICIAL), '<html>ok</html>')
        self.assertTrue(stream.closed)

    async def test_redirect_and_errors_close_stream_without_following_or_reading(self):
        for status in [302, 401, 429, 500]:
            with self.subTest(status=status):
                calls = []
                stream = TestStream([b'private-error'])

                def handler(request):
                    calls.append(request)
                    return httpx.Response(status, headers={'Location': 'https://example.invalid/login'},
                                          stream=stream)

                async with httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                             follow_redirects=True) as client:
                    with self.assertRaisesRegex(ValueError, 'Exam source unavailable'):
                        await read(client, OFFICIAL)
                self.assertEqual(len(calls), 1)
                self.assertTrue(stream.closed)
                self.assertEqual(stream.emitted, 0)

    async def test_oversized_response_stops_reading_and_closes_stream(self):
        stream = TestStream([b'x' * 400_000, b'y' * 400_000, b'not read'])
        transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaisesRegex(ValueError, 'Exam response too large'):
                await read(client, OFFICIAL)
        self.assertTrue(stream.closed)
        self.assertEqual(stream.emitted, 2)

    async def test_cancelling_read_closes_response_stream(self):
        stream = TestStream([b'not read'], gate=asyncio.Event())
        transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))
        async with httpx.AsyncClient(transport=transport) as client:
            task = asyncio.create_task(read(client, OFFICIAL))
            try:
                await asyncio.wait_for(stream.started.wait(), 1)
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
        self.assertTrue(stream.closed)
