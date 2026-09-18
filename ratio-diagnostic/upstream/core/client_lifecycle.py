"""Close per-request cookie jars while retaining explicitly pending challenges."""
import asyncio
from contextvars import ContextVar
from functools import wraps

_clients = ContextVar("portal_request_clients", default=None)


def track(client):
    clients = _clients.get()
    if clients is not None:
        clients[id(client)] = client
    return client


def retain(client):
    clients = _clients.get()
    if clients is not None:
        clients.pop(id(client), None)


async def close(client):
    retain(client)
    await client.aclose()


def client_scope(function):
    @wraps(function)
    async def wrapped(*args, **kwargs):
        clients = {}
        token = _clients.set(clients)
        try:
            return await function(*args, **kwargs)
        finally:
            try:
                await asyncio.gather(*(client.aclose() for client in clients.values()), return_exceptions=True)
            finally:
                _clients.reset(token)
    return wrapped


async def gather_complete(*calls):
    """Cancel and drain siblings before their request-owned clients are closed."""
    tasks = [asyncio.ensure_future(call) for call in calls]
    try:
        return await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
