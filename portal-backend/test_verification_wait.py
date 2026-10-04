import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("APP_ORIGIN", "http://localhost:8089")
import server
from core.portal_client import wait_for_verification


class VerificationWaitTests(unittest.IsolatedAsyncioTestCase):
    async def test_counts_challenge_and_ocr_elapsed_time(self):
        for age, expected in [(0, 2), (.5, 1.5), (1.5, .5), (2, 0), (5, 0)]:
            with self.subTest(age=age), patch("core.portal_client.time.monotonic", return_value=100), \
                 patch("core.portal_client.asyncio.sleep", new_callable=AsyncMock) as sleep:
                await wait_for_verification(SimpleNamespace(challenge_loaded_at=100 - age))
                if expected:
                    sleep.assert_awaited_once_with(expected)
                else:
                    sleep.assert_not_awaited()

    async def test_unknown_or_future_clock_preserves_full_wait(self):
        for session in (SimpleNamespace(), SimpleNamespace(challenge_loaded_at=None),
                        SimpleNamespace(challenge_loaded_at=101)):
            with patch("core.portal_client.time.monotonic", return_value=100), \
                 patch("core.portal_client.asyncio.sleep", new_callable=AsyncMock) as sleep:
                await wait_for_verification(session)
                sleep.assert_awaited_once_with(2)

    async def test_new_challenge_resets_age_even_after_an_old_attempt(self):
        session = SimpleNamespace(challenge_loaded_at=90)
        with patch("core.portal_client.time.monotonic", return_value=100), \
             patch("core.portal_client.asyncio.sleep", new_callable=AsyncMock) as sleep:
            await wait_for_verification(session)
            sleep.assert_not_awaited()
            session.challenge_loaded_at = 100
            await wait_for_verification(session)
            sleep.assert_awaited_once_with(2)
