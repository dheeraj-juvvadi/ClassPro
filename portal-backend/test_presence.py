import json,tempfile,unittest
from pathlib import Path
from presence import Presence
class PresenceTests(unittest.TestCase):
 def test_deduplicates_sessions_and_expires(self):
  with tempfile.TemporaryDirectory() as directory:
   store=Presence(directory)
   self.assertTrue(store.touch('private-session','marks','mobile',1000))
   self.assertFalse(store.touch('private-session','marks','mobile',1010))
   store.touch('second-private-session','home','desktop',1040)
   self.assertEqual(len(store.entries),2)
   store.touch('third','home','mobile',1161)
   self.assertEqual(len(store.entries),1)
   saved=json.loads((Path(directory)/'presence.json').read_text())
   self.assertEqual(sum(b['count'] for b in saved['buckets']),1)
   self.assertNotIn('private-session',json.dumps(saved))
   self.assertEqual(saved['buckets'][0]['expiresAt'],1281)
 def test_bounds_identity_count_and_sanitizes_fields(self):
  store=Presence(None)
  for i in range(2000):store.touch(str(i),'secret-page','secret-device',1000)
  self.assertFalse(store.touch('extra','marks','mobile',1001))
  self.assertEqual(len(store.entries),2000)
  self.assertEqual(store.entries['0'][1:],('unknown','unknown'))
 def test_file_is_private(self):
  with tempfile.TemporaryDirectory() as directory:
   store=Presence(directory);store.touch('session','home','desktop',1000)
   self.assertEqual((Path(directory)/'presence.json').stat().st_mode&0o777,0o600)

class PresenceEndpointTests(unittest.IsolatedAsyncioTestCase):
 async def test_only_authenticated_consented_sessions_count(self):
  import os,time,httpx
  from unittest.mock import patch
  os.environ.setdefault('APP_ORIGIN','http://localhost:8089')
  import server
  token='synthetic-presence-test'
  store=Presence(None)
  server.app.state.presence=store
  entry={'created':time.monotonic(),'last_seen':time.time(),'remember':True,'providers':{'portal':{'report':{}}}}
  headers={'Origin':server.origin,'Content-Type':'application/json'}
  try:
   with patch.object(server,'required_token',''):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),base_url='http://test') as api:
     response=await api.post('/api/presence',headers=headers,json={'consent':True,'page':'home'})
     self.assertFalse(response.json()['accepted'])
     server.sessions[token]=entry
     headers['Cookie']=server.cookie_name+'='+token
     response=await api.post('/api/presence',headers=headers,json={'consent':False,'page':'home'})
     self.assertFalse(response.json()['accepted'])
     response=await api.post('/api/presence',headers=headers,json={'consent':True,'page':'marks','viewport':'mobile'})
     self.assertTrue(response.json()['accepted']);self.assertEqual(len(store.entries),1)
     response=await api.post('/api/presence',headers={**headers,'Origin':'https://foreign.invalid'},json={'consent':True})
     self.assertEqual(response.status_code,403)
  finally:server.sessions.pop(token,None)
