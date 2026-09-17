"""Synthetic ASGI burst with simulated upstream latency; never contacts SRM."""
import asyncio
import json
import os
import resource
import time
from unittest.mock import patch
import httpx

os.environ['APP_ORIGIN'] = 'http://localhost:8089'
os.environ.pop('SESSION_STORE_DIR', None)
import server


async def main():
    active = peak = completed = 0

    async def refresh(request, entry, invoke, report):
        nonlocal active, peak, completed
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(.02)
        active -= 1
        completed += 1
        return entry['report'], True

    async with server.lifespan(server.app):
        for i in range(1000):
            server.sessions[str(i)] = {
                'created': time.monotonic(), 'last_seen': time.time(),
                'providers': {'portal': {'report': {}}},
                'report': {'attendance': {'data': []}},
            }
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),
                                    base_url='http://localhost:8089') as client:
            async def user(i):
                headers = {'cookie': f'{server.cookie_name}={i}'}
                started = time.perf_counter()
                status = await client.get('/api/session', headers=headers)
                result = await client.get('/api/reports?force=1', headers=headers)
                assert status.status_code == result.status_code == 200
                assert status.json()['authenticated']
                assert result.json()['sync']['pending']
                return (time.perf_counter() - started) * 1000

            with patch.object(server, 'refresh_providers', refresh):
                started = time.perf_counter()
                latencies = sorted(await asyncio.gather(*(user(i) for i in range(1000))))
                accepted = time.perf_counter() - started
                await server.app.state.refresh_queue.queue.join()
                elapsed = time.perf_counter() - started
                assert completed == 1000 and peak <= server.REFRESH_CONCURRENCY
                print(json.dumps({'users': 1000, 'requests': 2000,
                    'accepted_seconds': round(accepted, 3), 'drained_seconds': round(elapsed, 3),
                    'user_p95_ms': round(latencies[949], 2), 'user_max_ms': round(latencies[-1], 2),
                    'upstream_peak': peak, 'completed_refreshes': completed,
                    'peak_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                    'scope': 'ASGI in-process; 20ms simulated refresh; not SRM login or public-network throughput'}))


if __name__ == '__main__':
    asyncio.run(main())
