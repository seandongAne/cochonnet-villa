import test from 'node:test';
import assert from 'node:assert/strict';
import { isNotesSessionActive, matchesNotesPassword } from '../src/notes-access.js';

test('visitor unlock lasts only until its stored expiry', () => {
  const now = 100000;
  assert.equal(isNotesSessionActive(String(now + 1000), now), true);
  assert.equal(isNotesSessionActive(String(now), now), false);
  assert.equal(isNotesSessionActive(String(now - 1), now), false);
});
test('malformed and excessive session expiries stay locked', () => {
  for (const value of [null, undefined, '', 'NaN', 'Infinity', '-1', String(100000 + 9 * 60 * 60 * 1000)]) {
    assert.equal(isNotesSessionActive(value, 100000), false);
  }
});
test('empty and wrong passwords fail the browser gate', async () => {
  assert.equal(await matchesNotesPassword(''), false);
  assert.equal(await matchesNotesPassword('wrong-password'), false);
});

