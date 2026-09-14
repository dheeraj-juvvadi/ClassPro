'use strict';

globalThis.createCredentialIntegrity = async function (account, password, answer) {
  const nonce = crypto.randomUUID();
  const digest = async (field, value) => {
    const bytes = new TextEncoder().encode(nonce + '\n' + field + '\n' + value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const normalized = account.trim().replace(/@srmist\.edu\.in$/i, '');
  const [accountHash, passwordHash, answerHash] = await Promise.all([
    digest('account', normalized), digest('password', password), digest('answer', answer),
  ]);
  return { nonce, account: accountHash, password: passwordHash, answer: answerHash };
};
