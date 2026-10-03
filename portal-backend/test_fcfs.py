import asyncio
import os
import unittest

os.environ["APP_ORIGIN"] = "http://localhost:8089"
import server


class FifoAdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server.gate = asyncio.Semaphore(server.API_CONCURRENCY)
        server.waiters = 0

    async def asyncTearDown(self):
        server.waiters = 0

    async def test_fcfs_admission_order_and_overflow(self):
        for _ in range(server.API_CONCURRENCY):
            await server.gate.acquire()
        order = []
        started = []

        async def caller(index):
            started.append(index)
            if await server.acquire_api():
                order.append(index)
                server.gate.release()

        waiters = [asyncio.create_task(caller(index)) for index in range(5)]
        await asyncio.sleep(0.05)
        self.assertEqual(server.waiters, 5)
        self.assertEqual(order, [])
        server.gate.release()
        await asyncio.wait_for(asyncio.gather(*waiters), timeout=2)
        self.assertEqual(order, [0, 1, 2, 3, 4])
        for _ in range(server.API_CONCURRENCY - 1):
            server.gate.release()
        async with asyncio.timeout(2):
            for _ in range(server.API_CONCURRENCY):
                await server.gate.acquire()
        server.waiters = server.API_QUEUE
        self.assertFalse(await server.acquire_api())
        self.assertEqual(server.waiters, server.API_QUEUE)
        for _ in range(server.API_CONCURRENCY):
            server.gate.release()


if __name__ == "__main__":
    unittest.main()
