import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeInviteCodePaste, sanitizeInviteCodeInput } from '../src/index.ts';

const SHARE_MESSAGE = [
  '함께봄 돌봄 그룹에 초대했어요.',
  '초대 코드: ABC234',
  '',
  '앱을 설치한 뒤 "초대 코드가 있어요"에서 이 코드를 입력하면 함께 기록할 수 있어요.',
  'Android: https://play.google.com/store/apps/details?id=com.seorilabs.babycare',
  'iPhone: https://apps.apple.com/app/id0000000000',
].join('\n');

describe('sanitizeInviteCodeInput', () => {
  it('extracts the code out of the full shared invite message', () => {
    assert.equal(sanitizeInviteCodeInput(SHARE_MESSAGE), 'ABC234');
  });

  it('extracts the code out of a single line of the message', () => {
    assert.equal(sanitizeInviteCodeInput('초대 코드: ABC234'), 'ABC234');
  });

  it('uppercases and strips separators mixed into a typed or pasted code', () => {
    assert.equal(sanitizeInviteCodeInput('abc-234'), 'ABC234');
  });

  it('drops characters outside the unambiguous alphabet, like keystroke filtering already did', () => {
    assert.equal(sanitizeInviteCodeInput('abc2i34'), 'ABC234');
  });

  it('returns an empty string when no code characters are present', () => {
    assert.equal(sanitizeInviteCodeInput('함께봄 돌봄 그룹에 초대했어요.'), '');
  });

  it('keeps in-progress manual typing untouched up to the six-character cap', () => {
    assert.equal(sanitizeInviteCodeInput('ABC'), 'ABC');
    assert.equal(sanitizeInviteCodeInput('ABC234'), 'ABC234');
  });
});

describe('looksLikeInviteCodePaste', () => {
  it('treats a single keystroke worth of growth as normal typing', () => {
    assert.equal(looksLikeInviteCodePaste(''), false);
    assert.equal(looksLikeInviteCodePaste('A'), false);
    assert.equal(looksLikeInviteCodePaste('ABC234'), false);
    // The field can hold up to six sanitized characters; one more raw
    // keystroke on top of that is still ordinary typing, not a paste.
    assert.equal(looksLikeInviteCodePaste('ABC234X'), false);
  });

  it('treats longer jumps as a paste or autofill', () => {
    assert.equal(looksLikeInviteCodePaste(SHARE_MESSAGE), true);
    assert.equal(looksLikeInviteCodePaste('초대 코드: ABC234'), true);
  });
});
