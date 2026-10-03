import unittest
from attendance_trends import observe, decorate, DAY


def reading(present, total):
    return {"attendance": {"data": [{"code": "CS", "present": present, "conducted": total}]}}


class AttendanceTrendTests(unittest.TestCase):
    def test_true_delta_and_no_comparison_without_baseline(self):
        entry = {"report": reading(8, 10), "synced_at": 1000000}
        observe(entry, 1000000)
        self.assertNotIn('change24h', decorate(entry, 1000000)['attendance']['data'][0])
        entry.update(report=reading(9, 11), synced_at=1000000 + DAY)
        observe(entry, entry['synced_at'])
        delta = decorate(entry, entry['synced_at'])['attendance']['data'][0]['change24h']
        self.assertEqual(delta['points'], 1.82)
        self.assertEqual(delta['from'], 1000000000)
        entry.update(report=reading(7, 10), synced_at=1000000 + DAY)
        self.assertEqual(decorate(entry, entry['synced_at'])['attendance']['data'][0]['change24h']['points'], -10)

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
