import { createHash, timingSafeEqual } from 'node:crypto';

export function checkIntegrity(proof, account, password, answer) {
  if (!proof) return { provided: false };
  const match = (field, value, expected) => {
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false;
    const hash = createHash('sha256').update(proof.nonce + '\n' + field + '\n' + value).digest();
    return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
  };
  return { provided: true,
    account_match: match('account', account.trim().replace(/@srmist\.edu\.in$/i, ''), proof.account),
    password_match: match('password', password, proof.password),
    answer_match: match('answer', answer, proof.answer),
  };
}
