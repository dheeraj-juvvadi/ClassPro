'use strict';

globalThis.createCredentialIntegrity = async function (account, password, answer) {
  const nonce = classproRandomId();
  const digest = async (field, value) => {
    const bytes = new TextEncoder().encode(nonce + '\n' + field + '\n' + value);
    return classproSha256Hex(bytes);
  };
  const normalized = account.trim().replace(/@srmist\.edu\.in$/i, '');
  const [accountHash, passwordHash, answerHash] = await Promise.all([
    digest('account', normalized), digest('password', password), digest('answer', answer),
  ]);
  return { nonce, account: accountHash, password: passwordHash, answer: answerHash };
};
