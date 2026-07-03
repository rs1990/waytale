import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, buildDays, MODE_PROFILES } from '../src/routes/itinerary.js';

test('haversineKm returns ~0 for identical points', () => {
  assert.ok(haversineKm(37.8, -122.4, 37.8, -122.4) < 0.001);
});

test('haversineKm: San Francisco to Los Angeles is roughly 550-620km', () => {
  const km = haversineKm(37.7749, -122.4194, 34.0522, -118.2437);
  assert.ok(km > 550 && km < 620, `expected ~550-620km, got ${km}`);
});

test('buildDays never reuses the same landmark across days', () => {
  const origin = { lat: 37.8, lon: -122.4 };
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    id: `landmark-${i}`,
    latitude: 37.8 + i * 0.01,
    longitude: -122.4 + i * 0.01,
  }));

  const itinerary = buildDays(origin, candidates, 3, MODE_PROFILES.walking, 50);
  const usedIds = itinerary.flatMap((day) => day.landmarks.map((l) => l.id));
  assert.equal(usedIds.length, new Set(usedIds).size, 'expected no duplicate landmarks across days');
});

test('buildDays returns zero stops when no candidates are within range', () => {
  const origin = { lat: 0, lon: 0 };
  const farCandidates = [{ id: 'far', latitude: 89, longitude: 179 }];
  const itinerary = buildDays(origin, farCandidates, 1, MODE_PROFILES.walking, 1);
  assert.equal(itinerary[0].stop_count, 0);
});
