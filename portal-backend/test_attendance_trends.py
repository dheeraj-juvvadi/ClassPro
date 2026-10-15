import unittest
from attendance_trends import observe, decorate, DAY


def reading(present, total):
    return {"attendance": {"data": [{"code": "CS", "present": present, "conducted": total}]}}


class AttendanceTrendTests(unittest.TestCase):
    def test_recent_sync_fallback_keeps_real_signed_change(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, entry['synced_at'])
        entry.update(report=reading(9, 11), synced_at=1000030)
        observe(entry, entry['synced_at'])
        row = decorate(entry, entry['synced_at'])['attendance']['data'][0]
        self.assertNotIn('change24h', row)
        self.assertEqual(row['changeSinceSync']['points'], 1.82)
        self.assertEqual(row['changeSinceSync']['from'], 1000000000)
        entry.update(report=reading(9, 12), synced_at=1004000)
        observe(entry, entry['synced_at'])
        self.assertEqual(decorate(entry, entry['synced_at'])['attendance']['data'][0]['changeSinceSync']['points'], -6.82)

    def test_expired_and_failed_readings_do_not_gain_fallback(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, entry['synced_at'])
        entry.update(report=reading(9, 11), synced_at=1000000 + 4 * DAY)
        row = decorate(entry, entry['synced_at'])['attendance']['data'][0]
        self.assertNotIn('changeSinceSync', row)
        entry['synced_at'] = 1001000
        entry['report']['warnings'] = ['Portal unavailable']
        row = decorate(entry, entry['synced_at'])['attendance']['data'][0]
        self.assertNotIn('changeSinceSync', row)

    def test_latest_delta_and_no_comparison_without_baseline(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, 1000000)
        self.assertNotIn('change24h', decorate(entry, 1000000)['attendance']['data'][0])
        entry.update(report=reading(9, 11), synced_at=1000000 + DAY)
        observe(entry, entry['synced_at'])
        delta = decorate(entry, entry['synced_at'])['attendance']['data'][0]['changeSinceSync']
        self.assertEqual(delta['points'], 1.82)
        self.assertEqual(delta['from'], 1000000000)
        self.assertNotIn('change24h', decorate(entry, entry['synced_at'])['attendance']['data'][0])
        entry.update(report=reading(7, 10), synced_at=1000001 + DAY)
        observe(entry, entry['synced_at'])
        self.assertEqual(decorate(entry, entry['synced_at'])['attendance']['data'][0]['changeSinceSync']['points'], -11.82)

    def test_stale_baseline_and_errors_are_not_used(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, 1000000)
        entry.update(report=reading(9, 11), synced_at=1000000 + DAY + 7201)
        self.assertNotIn('change24h', decorate(entry, entry['synced_at'])['attendance']['data'][0])
        entry['report']['attendance']['error'] = {"message": "unavailable"}
        observe(entry, entry['synced_at'])
        self.assertEqual(len(entry['attendance_samples']), 1)

    def test_samples_are_bounded_and_preserve_raw_report(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        for i in range(210):
            observe(entry, 1000000 + i * 120)
        self.assertEqual(len(entry['attendance_samples']), 200)
        decorate(entry, 1000000)
        self.assertNotIn('change24h', entry['report']['attendance']['data'][0])

    def test_unchanged_syncs_keep_change_until_exact_expiry(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, entry['synced_at'])
        changed_at = 1000030
        entry.update(report=reading(9, 11), synced_at=changed_at)
        observe(entry, changed_at)
        original = dict(entry['attendance_changes']['CS'])
        for offset in [1, 20, 300, 3600, DAY - 1]:
            entry['synced_at'] = changed_at + offset
            observe(entry, entry['synced_at'])
            row = decorate(entry, entry['synced_at'])['attendance']['data'][0]
            self.assertEqual(row['changeSinceSync'], original)
        self.assertEqual(original['expiresAt'], (changed_at + DAY) * 1000)
        # Cached responses also expire without requiring a successful sync.
        self.assertNotIn('changeSinceSync', decorate(entry, changed_at + DAY)['attendance']['data'][0])
        entry['synced_at'] = changed_at + DAY
        observe(entry, entry['synced_at'])
        self.assertEqual(entry['attendance_changes'], {})

    def test_new_update_replaces_change_and_restarts_its_own_expiry(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, entry['synced_at'])
        entry.update(report=reading(9, 11), synced_at=1000030)
        observe(entry, entry['synced_at'])
        entry.update(report=reading(9, 12), synced_at=1004000)
        observe(entry, entry['synced_at'])
        change = decorate(entry, 1004000)['attendance']['data'][0]['changeSinceSync']
        self.assertEqual(change['points'], -6.82)
        self.assertEqual(change['to'], 1004000000)
        self.assertEqual(change['expiresAt'], (1004000 + DAY) * 1000)

    def test_unchanged_ratio_with_new_hours_is_a_new_attendance_update(self):
        entry = {"report": reading(2, 4), "synced_at": 1000000}
        observe(entry, entry['synced_at'])
        entry.update(report=reading(3, 4), synced_at=1000100)
        observe(entry, entry['synced_at'])
        entry.update(report=reading(6, 8), synced_at=1000200)
        observe(entry, entry['synced_at'])
        self.assertEqual(entry['attendance_changes']['CS']['points'], 0)
        self.assertEqual(entry['attendance_changes']['CS']['to'], 1000200000)

    def test_changes_are_per_course_and_survive_history_eviction(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        entry['report']['attendance']['data'].append({'code': 'MA', 'present': 3, 'conducted': 4})
        observe(entry, entry['synced_at'])
        entry['report']['attendance']['data'][0].update(present=9, conducted=11)
        observe(entry, 1000100)
        original = dict(entry['attendance_changes']['CS'])
        for i in range(210):
            observe(entry, 1000200 + i * 120)
        self.assertEqual(len(entry['attendance_samples']), 200)
        self.assertEqual(entry['attendance_changes']['CS'], original)
        self.assertNotIn('MA', entry['attendance_changes'])
        entry['report']['attendance']['data'][1].update(present=3, conducted=5)
        observe(entry, 1030000)
        self.assertEqual(entry['attendance_changes']['CS'], original)
        self.assertEqual(entry['attendance_changes']['MA']['points'], -15)

    def test_legacy_history_recovers_actual_change_before_unchanged_syncs(self):
        entry = {"report": reading(9, 11), "synced_at": 1000400,
                 "attendance_samples": [
                     {"at": 1000000, "values": {"CS": 80}},
                     {"at": 1000100, "values": {"CS": 100 * 9 / 11}},
                     {"at": 1000300, "values": {"CS": 100 * 9 / 11}}]}
        change = decorate(entry, 1000400)['attendance']['data'][0]['changeSinceSync']
        self.assertEqual(change['points'], 1.82)
        self.assertEqual(change['to'], 1000100000)
        self.assertNotIn('attendance_changes', entry)
        observe(entry, 1000400)
        self.assertEqual(entry['attendance_changes']['CS'], change)

    def test_failed_reads_and_invalid_values_do_not_overwrite_change(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, 1000000)
        entry.update(report=reading(9, 11), synced_at=1000100)
        observe(entry, 1000100)
        change = dict(entry['attendance_changes']['CS'])
        entry['report']['warnings'] = ['Portal unavailable']
        observe(entry, 1000200)
        self.assertEqual(entry['attendance_changes']['CS'], change)
        self.assertNotIn('changeSinceSync', decorate(entry, 1000200)['attendance']['data'][0])
        for value in [True, float('nan'), float('inf')]:
            entry['report'] = reading(value, 11)
            observe(entry, 1000300)
            self.assertEqual(entry['attendance_changes']['CS'], change)
            self.assertNotIn('changeSinceSync', decorate(entry, 1000300)['attendance']['data'][0])
