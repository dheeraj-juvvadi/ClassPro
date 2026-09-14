import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { trackPortalNetwork } from '../src/portal-network.js';

test('network evidence records destination and script hash but no request secrets', async () => {
  const page = new EventEmitter();
  page.evaluate = async () => ({ login_form_present: true });
  const monitor = trackPortalNetwork(page);
  const script = 'public script content';
  page.emit('response', {
    url: () => 'https://sp.srmist.edu.in/srmiststudentportal/resources/js/secure2.js?token=private',
    status: () => 200, ok: () => true,
    headers: () => ({ date: new Date().toUTCString(), 'set-cookie': 'private-cookie' }),
    serverAddr: async () => ({ ipAddress: '192.0.2.1', port: 443 }),
    securityDetails: async () => ({ protocol: 'TLS 1.3', issuer: 'Example CA', subjectName: 'sp.srmist.edu.in' }),
    body: async () => Buffer.from(script),
  });
  const records = [];
  await monitor.report(record => records.push(record));
  assert.equal(records[0].responses[0].destination.ipAddress, '192.0.2.1');
  assert.equal(records[0].responses[0].script_sha256, createHash('sha256').update(script).digest('hex'));
  assert.doesNotMatch(JSON.stringify(records), /private|public script content/);
  monitor.close();
  assert.equal(page.listenerCount('response'), 0);
});
