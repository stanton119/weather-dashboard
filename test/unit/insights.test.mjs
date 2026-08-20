import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights } from '../../weather.js';

function day(formattedDate, reports) {
  return { formattedDate, reports };
}

const demo = [
  day('Wed 20 Aug', [
    { outside_temp: 14, inside_humidity: 55, wind_speed: 20, wind_direction: 'SW', timeslot: '09:00' },
    { outside_temp: 18, inside_humidity: 62, wind_speed: 30, wind_direction: 'W', timeslot: '15:00' }
  ]),
  day('Thu 21 Aug', [
    { outside_temp: 16, inside_humidity: 68, wind_speed: 25, wind_direction: 'N', timeslot: '12:00' }
  ])
];

test('computeInsights finds warmest peak, indoor RH peak, and wind peak', () => {
  const s = computeInsights(demo);
  assert.equal(s.peakTemp, 18);
  assert.equal(s.peakTempTime, 'Wed 20 Aug @ 15:00');
  assert.equal(s.peakIndoorRH, 68);
  assert.equal(s.peakIndoorRHTime, 'Thu 21 Aug @ 12:00');
  assert.equal(s.peakWind, 30);
  assert.equal(s.peakWindTime, 'Wed 20 Aug @ 15:00 (W)');
  assert.equal(s.totalHours, 3);
  assert.equal(s.moldSustainedHours, 2);
});

test('computeInsights labels HIGH mold risk', () => {
  const s = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '06:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '12:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '18:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '23:00' }
    ])
  ]);
  assert.equal(s.moldRisk, 'HIGH');
  assert.ok(s.moldPercentage > 50);
});

test('computeInsights labels LOW mold risk below thresholds', () => {
  const s = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: 50, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' }
    ])
  ]);
  assert.equal(s.moldRisk, 'LOW');
});

test('computeInsights returns null moldRisk with no indoor RH and handles empty input', () => {
  assert.equal(computeInsights([]).moldRisk, null);
  const noRH = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: null, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' }
    ])
  ]);
  assert.equal(noRH.peakIndoorRH, -Infinity);
  assert.equal(noRH.moldRisk, null);
  assert.equal(noRH.peakWind, 10);
});