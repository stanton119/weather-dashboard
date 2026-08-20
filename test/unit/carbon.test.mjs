import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCarbonSeries, buildCarbonData, formatDateLabel } from '../../weather.js';

test('normalizeCarbonSeries prefers forecast intensity over actual', () => {
  const payload = {
    data: [
      { intensity: { forecast: 120, actual: 90 }, from: '2026-08-20T00:00:00Z' },
      { intensity: { actual: 75 }, from: '2026-08-20T00:30:00Z' },
      { intensity: {}, from: '2026-08-20T01:00:00Z' }
    ]
  };
  const points = normalizeCarbonSeries(payload);
  assert.equal(points.length, 3);
  assert.equal(points[0].value, 120);
  assert.equal(points[1].value, 75);
  assert.equal(points[2].value, null);
  assert.equal(typeof points[0].timestamp, 'number');
});

test('buildCarbonData merges four series into timestamp-keyed reports with valid localDate', () => {
  const t0 = new Date('2026-08-20T10:00:00+01:00').getTime();
  const seriesResults = [
    { key: 'regional_forecast', points: [{ timestamp: t0, value: 100 }] },
    { key: 'national_forecast', points: [{ timestamp: t0, value: 90 }] },
    { key: 'regional_historic', points: [{ timestamp: t0, value: 80 }] },
    { key: 'national_historic', points: [{ timestamp: t0, value: 70 }] },
    { key: 'regional_forecast', points: [{ timestamp: t0, value: null }] }
  ];
  const days = buildCarbonData(seriesResults);
  assert.equal(days.length, 1);
  const report = days[0].reports[0];
  assert.equal(report.regional_forecast, 100);
  assert.equal(report.national_forecast, 90);
  assert.equal(report.regional_historic, 80);
  assert.equal(report.national_historic, 70);
  assert.equal(typeof days[0].formattedDate, 'string');
  assert.ok(days[0].formattedDate.length > 0);
  assert.equal(days[0].formattedDate, formatDateLabel(report.localDate));
});
