import asyncio
import unittest
from refresh_queue import RefreshQueue


class RefreshQueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_thousand_users_are_bounded_and_duplicates_share_jobs(self):
        release = asyncio.Event()
        active = peak = completed = 0

        async def run(token, entry, request):
            nonlocal active, peak, completed
            active += 1
            peak = max(peak, active)
            await release.wait()
            active -= 1
            completed += 1
            return True

        queue = RefreshQueue(4, 1000, run)
        try:
            jobs = [queue.submit(str(i), {}, None) for i in range(1000)]
            self.assertIs(queue.submit('0', {}, None), jobs[0])
            self.assertIsNone(queue.submit('overflow', {}, None))
            await asyncio.sleep(0)
            self.assertEqual(peak, 4)
            self.assertEqual(len(queue.jobs), 1000)
            release.set()
            await asyncio.wait_for(queue.queue.join(), 3)
            self.assertEqual(completed, 1000)
            self.assertTrue(all(job.result() for job in jobs))
            self.assertEqual(queue.jobs, {})
        finally:
            await queue.close()

    async def test_failure_and_shutdown_release_jobs(self):
        async def fail(*args):
            raise ValueError('synthetic')
        queue = RefreshQueue(1, 2, fail)
        first = queue.submit('one', {}, None)
        await queue.queue.join()
        self.assertFalse(first.result())
        pending = queue.submit('two', {}, None)
        await queue.close()
        self.assertTrue(pending.cancelled())
        self.assertEqual(queue.jobs, {})
