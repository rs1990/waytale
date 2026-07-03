import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCrowdPenalty } from '../src/routes/routes.js';

test('weekday off-peak, few landmarks: no penalty', () => {
  const tuesday2am = new Date('2026-07-07T02:00:00'); // Tuesday
  assert.equal(computeCrowdPenalty(tuesday2am, 2), 0);
});

test('weekend peak hour with many landmarks: capped at 20', () => {
  const saturdayNoon = new Date('2026-07-04T12:00:00'); // Saturday
  assert.equal(computeCrowdPenalty(saturdayNoon, 10), 20);
});

test('weekday peak hour only: 7', () => {
  const tuesdayNoon = new Date('2026-07-07T12:00:00');
  assert.equal(computeCrowdPenalty(tuesdayNoon, 2), 7);
});

test('penalty never exceeds 20', () => {
  const saturdayNoon = new Date('2026-07-04T12:00:00');
  assert.ok(computeCrowdPenalty(saturdayNoon, 100) <= 20);
});
