import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saturatePressure, calculateIndoorHumidity } from '../../weather.js';

test('saturatePressure is monotonic and positive', () => {
  const low = saturatePressure(0);
  const mid = saturatePressure(20);
  const high = saturatePressure(40);
  assert.ok(low > 0 && mid > low && high > mid);
});

test('calculateIndoorHumidity with identical indoor/outdoor temp preserves outside RH', () => {
  // At equal temps the ratio of saturation pressures is 1, so RH_in ≈ RH_out.
  const result = calculateIndoorHumidity(20, 50, 20);
  assert.ok(Math.abs(result - 50) < 0.5);
});

test('calculateIndoorHumidity clamps to 0..100', () => {
  assert.ok(calculateIndoorHumidity(0, 99, 40) <= 100);
  assert.ok(calculateIndoorHumidity(-5, 5, 20) >= 0);
});

test('calculateIndoorHumidity returns null for null inputs', () => {
  assert.equal(calculateIndoorHumidity(null, 50, 20), null);
  assert.equal(calculateIndoorHumidity(20, null, 20), null);
  assert.equal(calculateIndoorHumidity(20, 50, null), null);
});

test('calculateIndoorHumidity round-trips a typical UK winter night', () => {
  // 5°C outside at 90% RH, 21°C inside → inside RH lower because warm air holds more moisture.
  const result = calculateIndoorHumidity(5, 90, 21);
  assert.ok(result > 0 && result < 90);
});