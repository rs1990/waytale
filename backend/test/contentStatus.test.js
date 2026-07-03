import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_STATUSES, isPubliclyVisible } from '../src/db/contentStatus.js';

test('pending content is never publicly visible', () => {
  assert.equal(isPubliclyVisible('pending'), false);
});

test('rejected and archived content are never publicly visible', () => {
  assert.equal(isPubliclyVisible('rejected'), false);
  assert.equal(isPubliclyVisible('archived'), false);
});

test('reviewed and published content are publicly visible', () => {
  assert.equal(isPubliclyVisible('reviewed'), true);
  assert.equal(isPubliclyVisible('published'), true);
});

test('PUBLIC_STATUSES only contains reviewed/published', () => {
  assert.deepEqual([...PUBLIC_STATUSES].sort(), ['published', 'reviewed']);
});
