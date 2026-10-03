#!/usr/bin/env python3
"""Consistent session snapshot, encrypted before uploading using VM identity."""
import base64
import datetime
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import urllib.request

ACCOUNT = 'classprotestrg928'
CONTAINER = 'anon-private-backups'
ROOT = Path('/root/anon-backup')
STORE = Path('/home/azureuser/classpro/session-data')


def token():
    req = urllib.request.Request('http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fstorage.azure.com%2F', headers={'Metadata': 'true'})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)['access_token']


def main():
    config = json.loads((ROOT / 'config.json').read_text())
    key = os.urandom(32)
    nonce = os.urandom(12)
    with tempfile.TemporaryDirectory(prefix='anon-backup-', dir=ROOT) as tmp:
        snapshot = Path(tmp) / 'sessions.sqlite3'
        with sqlite3.connect(f'file:{STORE}/sessions.sqlite3?mode=ro', uri=True) as source, sqlite3.connect(snapshot) as target:
            source.backup(target)
        with sqlite3.connect(snapshot) as db:
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        archive = Path(tmp) / 'snapshot.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(snapshot, arcname='sessions.sqlite3')
            tar.add(STORE / 'session.key', arcname='session.key')
        # Use the application's installed cryptography package without exposing data in argv.
        public = config['public_key']
        code = '''import sys,json,base64,os
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
p=json.loads(sys.stdin.buffer.readline()); data=sys.stdin.buffer.read(); key=os.urandom(32); nonce=os.urandom(12)
pub=load_pem_public_key(p['public_key'].encode())
wrapped=pub.encrypt(key,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
out={'version':1,'key':base64.b64encode(wrapped).decode(),'nonce':base64.b64encode(nonce).decode(),'data':base64.b64encode(AESGCM(key).encrypt(nonce,data,b'anon-backup-v1')).decode()}
sys.stdout.write(json.dumps(out))'''
        payload = subprocess.run(['docker', 'exec', '-i', 'anon-api', 'python', '-c', code],
            input=json.dumps({'public_key': public}).encode()+b'\n'+archive.read_bytes(), capture_output=True, check=True).stdout
        name = datetime.datetime.now(datetime.timezone.utc).strftime('sessions-%Y-%m-%d.enc.json')
        req = urllib.request.Request(f'https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/{name}', data=payload, method='PUT', headers={
            'Authorization': 'Bearer '+token(), 'x-ms-version': '2023-11-03', 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/octet-stream'})
        with urllib.request.urlopen(req, timeout=45) as response:
            assert response.status == 201
        print(json.dumps({'backup': name, 'bytes': len(payload), 'status': 'uploaded'}))


if __name__ == '__main__':
    main()
