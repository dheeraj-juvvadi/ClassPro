"""Fetch the student's timetable without waiting for the other batch."""
import asyncio

from core.client_lifecycle import gather_complete
from services.profile_service import ProfileService


def normalized_batch(value):
    value = str(value or "").rsplit("/", 1)[-1].strip()
    return value if value in {"1", "2"} else None


def available(html):
    return isinstance(html, str) and bool(html) and html != "CONCURRENT_ERROR"


async def fetch_academia_reports(client, batch_hint=None, *, require_profile=False):
    # The hint is server-owned and only starts a speculative fetch. The current
    # authenticated profile decides which batch is actually used.
    profile_task = asyncio.create_task(client.get_profile_html())
    attendance_task = asyncio.create_task(client.get_attendance_html())
    tasks = [profile_task, attendance_task]
    grids = {}

    def start_grid(batch):
        if batch not in grids:
            suffix = "Batch_1" if batch == "1" else "batch_2"
            task = asyncio.create_task(client.get_grid_html(suffix))
            grids[batch] = task
            tasks.append(task)

    hint = normalized_batch(batch_hint)
    for batch in ([hint] if hint else ["1", "2"]):
        start_grid(batch)
    try:
        # Attendance is required; surface its failure even while profile is slow.
        done, _ = await asyncio.wait((profile_task, attendance_task), return_when=asyncio.FIRST_COMPLETED)
        if attendance_task in done:
            attendance_task.result()
        profile = await profile_task
        if require_profile and not available(profile):
            return profile, None, None, None
        selected = normalized_batch(ProfileService.parse_student_profile(profile).get("batch")) if available(profile) else None
        if selected:
            start_grid(selected)
            for batch, task in grids.items():
                if batch != selected and not task.done():
                    task.cancel()
        if not available(profile):
            attendance = await attendance_task
            if not available(attendance):
                return profile, None, None, attendance
        if selected:
            attendance, grid = await gather_complete(attendance_task, grids[selected])
            return profile, grid if selected == "1" else None, grid if selected == "2" else None, attendance
        # A missing/changed batch label cannot validate a saved hint. Preserve
        # the existing fallback by fetching both, never silently trusting it.
        start_grid("1")
        start_grid("2")
        attendance, first, second = await gather_complete(attendance_task, grids["1"], grids["2"])
        return profile, first, second, attendance
    finally:
        # A cancelled response or rejected session must not leave requests using
        # its cookie jar after request-owned cleanup closes that client.
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
