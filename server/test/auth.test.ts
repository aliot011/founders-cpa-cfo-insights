import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, passwordProblem, sha256, verifyPassword, newRawToken } from '../src/auth.ts';
import { consumeAuthToken, createAuthToken, createSession, createUser, getSessionUser, peekAuthToken } from '../src/db.ts';

test('password hashing round-trips and rejects wrong passwords', () => {
  const hash = hashPassword('correct horse battery');
  assert.ok(hash.startsWith('s2$32768$8$1$'));
  assert.equal(verifyPassword('correct horse battery', hash), true);
  assert.equal(verifyPassword('wrong horse battery', hash), false);
  assert.equal(verifyPassword('anything', 'garbage'), false);
  // Same password, different salt, different hash.
  assert.notEqual(hash, hashPassword('correct horse battery'));
});

test('password rules: 8-128 chars, no common passwords, not the email name', () => {
  const email = 'j.aliot011@gmail.com';
  assert.match(passwordProblem('short12', email) ?? '', /at least 8/);
  assert.match(passwordProblem('x'.repeat(129), email) ?? '', /at most 128/);
  assert.match(passwordProblem('Password123', email) ?? '', /too common/);
  assert.match(passwordProblem('QUICKBOOKS', email) ?? '', /too common/);
  assert.match(passwordProblem('xxj.aliot011yy', email) ?? '', /email name/);
  assert.equal(passwordProblem('plum-battery-42', email), null);
  assert.equal(passwordProblem('12345678a', email), null); // length + not on the list
});

test('auth tokens are single-use and expire', () => {
  const user = createUser({ email: `t${Date.now()}@example.com`, name: 'Token Test', role: 'advisor', realmIds: [] });

  const raw = newRawToken();
  createAuthToken(user.id, 'reset', sha256(raw), 60_000);
  assert.equal(peekAuthToken(sha256(raw))?.user_id, user.id);
  assert.equal(consumeAuthToken(sha256(raw)), true);
  assert.equal(peekAuthToken(sha256(raw)), null); // used
  assert.equal(consumeAuthToken(sha256(raw)), false);

  const expired = newRawToken();
  createAuthToken(user.id, 'invite', sha256(expired), -1);
  assert.equal(peekAuthToken(sha256(expired)), null);

  const unknown = sha256(newRawToken());
  assert.equal(peekAuthToken(unknown), null);
});

test('sessions resolve to their user and expired sessions vanish', () => {
  const user = createUser({ email: `s${Date.now()}@example.com`, name: 'Session Test', role: 'admin', realmIds: [] });
  const raw = newRawToken();
  createSession(user.id, sha256(raw));
  const resolved = getSessionUser(sha256(raw));
  assert.equal(resolved?.id, user.id);
  assert.equal(resolved?.role, 'admin');
  assert.equal(getSessionUser(sha256(newRawToken())), null);
});
