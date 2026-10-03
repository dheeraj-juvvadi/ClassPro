"""Short-lived activity counts. Session keys stay in memory, never in the output."""
import collections, json, os, threading, time
from pathlib import Path
from client_logs import PAGES
class Presence:
    def __init__(self, directory):
        self.path = Path(directory) / 'presence.json' if directory else None
        self.entries = {}; self.lock = threading.Lock(); self.saved = 0
    def touch(self, token, page, viewport, now=None):
        now = time.time() if now is None else now
        with self.lock:
            self.entries = {k:v for k,v in self.entries.items() if v[0] > now-120}
            if token in self.entries and self.entries[token][0] > now-30: return False
            if token not in self.entries and len(self.entries) >= 2000: return False
            page = page if isinstance(page,str) and page in PAGES else 'unknown'
            viewport = viewport if viewport in ('mobile','tablet','desktop') else 'unknown'
            self.entries[token] = (now,page,viewport)
            if self.path and now-self.saved >= 5:
                # Aggregate expiry buckets contain counts, never session IDs or accounts.
                groups = collections.Counter((int(at)+120,p,v) for at,p,v in self.entries.values())
                data = {'updatedAt':int(now),'buckets':[
                    {'expiresAt':expiry,'page':p,'device':v,'count':count}
                    for (expiry,p,v),count in groups.items()]}
                temporary=self.path.with_suffix('.tmp')
                fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
                with os.fdopen(fd,'w') as stream:json.dump(data,stream,separators=(',',':'))
                os.replace(temporary,self.path);self.saved=now
            return True
