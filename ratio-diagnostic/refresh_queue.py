"""Bounded refresh jobs; duplicate requests share work without holding API slots."""
import asyncio


class RefreshQueue:
    def __init__(self, workers, capacity, run):
        self.queue = asyncio.Queue(maxsize=capacity)
        self.jobs = {}
        self.run = run
        self.workers = [asyncio.create_task(self.worker()) for _ in range(workers)]

    def submit(self, token, entry, request):
        if token in self.jobs:
            return self.jobs[token]
        if self.queue.full():
            return None
        future = asyncio.get_running_loop().create_future()
        self.jobs[token] = future
        self.queue.put_nowait((token, entry, request, future))
        return future

    async def worker(self):
        while True:
            token, entry, request, future = await self.queue.get()
            try:
                result = await self.run(token, entry, request)
                if not future.done():
                    future.set_result(result)
            except asyncio.CancelledError:
                if not future.done():
                    future.cancel()
                raise
            except Exception:
                # Do not retain provider exceptions or secrets in task objects.
                if not future.done():
                    future.set_result(False)
            finally:
                self.jobs.pop(token, None)
                self.queue.task_done()

    async def close(self):
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        for future in self.jobs.values():
            future.cancel()
        self.jobs.clear()
        while not self.queue.empty():
            self.queue.get_nowait()
            self.queue.task_done()
