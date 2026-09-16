import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { checkIntegrity } from '../src/credential-integrity.js';

test('browser proof matches decoded values and detects changed passwords', async () => {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder });
  vm.runInContext(await readFile(new URL('../public/secure-context-shim.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../public/credential-integrity.js', import.meta.url), 'utf8'), context);
  const password = '  synthetic&+=%<>"\'\\é🙂  ';
  const proof = await context.createCredentialIntegrity(' student@SRMIST.EDU.IN ', password, 'Ab12');
  const checks = checkIntegrity(proof, 'student', password, 'Ab12');
  assert.deepEqual(checks, { provided: true, account_match: true, password_match: true, answer_match: true });
  assert.equal(checkIntegrity(proof, 'student', password.trim(), 'Ab12').password_match, false);
  assert.notEqual(proof.nonce, (await context.createCredentialIntegrity('student', password, 'Ab12')).nonce);
  assert.doesNotMatch(JSON.stringify(checks), /synthetic|student|Ab12/);
});
