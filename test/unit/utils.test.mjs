import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDayColor, isTodayDateStr, formatDateLabel, getWeatherIcon, getDayMetricRange } from '../../weather.js';

test('getDayColor interpolates start hue (now) to end hue (future)', () => {
  assert.match(getDayColor(0, 7), /^hsla\(205,/);
  assert.match(getDayColor(6, 7), /^hsla\(280,/);
});

test('getDayColor handles a single day without dividing by zero', () => {
  assert.doesNotThrow(() => getDayColor(0, 1));
});

test('isTodayDateStr matches the current local date string', () => {
  const d = new Date();
  const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  assert.equal(isTodayDateStr(today), true);
  assert.equal(isTodayDateStr('2099-01-01'), false);
});

test('formatDateLabel formats an ISO date and falls back for garbage', () => {
  assert.equal(formatDateLabel('not-a-date'), 'not-a-date');
  assert.ok(formatDateLabel('2026-08-20').length > 0);
});

test('getWeatherIcon maps weather text', () => {
  assert.equal(getWeatherIcon('Sunny intervals'), '☀️');
  assert.equal(getWeatherIcon('Light rain'), '🌧️');
  assert.equal(getWeatherIcon('Cloudy'), '☁️');
  assert.equal(getWeatherIcon('Heavy snow'), '❄️');
  assert.equal(getWeatherIcon('Thunder possible'), '⛈️');
  assert.equal(getWeatherIcon('Unknown vogon weather'), '⛅');
});

test('getDayMetricRange computes min/max for a metric', () => {
  const day = {
    reports: [
      { outside_temp: 18, inside_humidity: 55, wind_speed: 12, precip_prob: 20 },
      { outside_temp: 22, inside_humidity: 61, wind_speed: 8, precip_prob: 0 }
    ]
  };
  assert.match(getDayMetricRange(day, 'outside_temp'), /22.*18/m);
  assert.match(getDayMetricRange(day, 'outside_temp'), /°<\/span/);
  assert.equal(getDayMetricRange(day, 'inside_humidity').includes('%'), true);
});

test('getDayMetricRange returns -- for empty reports', () => {
  assert.equal(getDayMetricRange({ reports: [] }, 'outside_temp'), '--');
});