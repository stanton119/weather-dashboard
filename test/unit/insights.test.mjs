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

test('computeInsights labels MEDIUM mold risk', () => {
  const reports = [
    { outside_temp: 15, inside_humidity: 65, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' }
  ];
  for (let hour = 1; hour <= 9; hour++) {
    reports.push({
      outside_temp: 15,
      inside_humidity: 55,
      wind_speed: 10,
      wind_direction: 'SW',
      timeslot: `${String(hour).padStart(2, '0')}:00`
    });
  }
  const s = computeInsights([day('Wed 20 Aug', reports)]);
  assert.equal(s.peakIndoorRH, 65);
  assert.ok(s.moldPercentage > 5 && s.moldPercentage <= 15, 'moldPercentage sits in (5, 15]');
  assert.equal(s.moldRisk, 'MEDIUM');
});

test('computeInsights applies exact mold-risk thresholds', () => {
  const sustained = (rh) => [
    { outside_temp: 15, inside_humidity: rh, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' },
    { outside_temp: 15, inside_humidity: rh, wind_speed: 10, wind_direction: 'SW', timeslot: '12:00' }
  ];
  const quiet = (n) => Array.from({ length: n }, (_, i) => ({
    outside_temp: 15,
    inside_humidity: 50,
    wind_speed: 10,
    wind_direction: 'SW',
    timeslot: `${String(i).padStart(2, '0')}:00`
  }));

  const high = computeInsights([day('Wed 20 Aug', [...sustained(70.5), ...quiet(4)])]);
  assert.equal(high.peakIndoorRH, 70.5);
  assert.ok(high.moldPercentage > 15, 'high sustained hours');
  assert.equal(high.moldRisk, 'HIGH');

  const boundary = computeInsights([day('Wed 20 Aug', [...sustained(70), ...quiet(4)])]);
  assert.equal(boundary.peakIndoorRH, 70);
  assert.equal(boundary.moldRisk, 'MEDIUM');

  const med = computeInsights([day('Wed 20 Aug', [
    { outside_temp: 15, inside_humidity: 61, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' },
    ...quiet(13)
  ])]);
  assert.equal(med.peakIndoorRH, 61);
  assert.ok(med.moldPercentage > 5 && med.moldPercentage <= 15, 'about 7% sustained hours');
  assert.equal(med.moldRisk, 'MEDIUM');
});

test('computeInsights returns -Infinity peakWind when all wind_speed are null', () => {
  const s = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: 55, wind_speed: null, wind_direction: null, timeslot: '09:00' },
      { outside_temp: 18, inside_humidity: 62, wind_speed: null, wind_direction: null, timeslot: '15:00' }
    ])
  ]);
  assert.equal(s.peakWind, -Infinity);
  assert.equal(s.peakWindTime, '');
});
