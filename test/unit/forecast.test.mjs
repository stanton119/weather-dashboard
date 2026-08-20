import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processForecastData } from '../../weather.js';

const payload = {
  forecasts: [
    {
      summary: { report: { localDate: '2026-08-20', maxTempC: 24, minTempC: 14, weatherTypeText: 'Sunny' } },
      detailed: {
        reports: [
          { localDate: '2026-08-20', timeslot: '09:00', temperatureC: 16, humidity: 80, feelsLikeTemperatureC: 15, windSpeedKph: 12, windDirectionAbbreviation: 'WSW', precipitationProbabilityInPercent: 10, weatherTypeText: 'Sunny' },
          { localDate: '2026-08-20', timeslot: '15:00', temperatureC: 22, humidity: 50, feelsLikeTemperatureC: 21, windSpeedKph: 18, windDirectionAbbreviation: 'SW', precipitationProbabilityInPercent: 5, weatherTypeText: 'Sunny' }
        ]
      }
    },
    {
      summary: { report: { localDate: '2026-08-21' } },
      detailed: {
        reports: [
          { localDate: '2026-08-21', timeslot: '12:00', temperatureC: 19, humidity: 65, feelsLikeTemperatureC: 18, windSpeedKph: 10, windDirectionAbbreviation: 'W', precipitationProbabilityInPercent: 20, weatherTypeText: 'Cloudy' }
        ]
      }
    }
  ]
};

test('processForecastData groups by localDate and sorts reports by hour', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days.length, 2);
  assert.deepEqual(days.map(d => d.dateStr), ['2026-08-20', '2026-08-21']);
  assert.deepEqual(days[0].reports.map(r => r.hour), [9, 15]);
});

test('processForecastData computes inside_humidity from the indoorTemp argument', () => {
  const days = processForecastData(payload, 21);
  const first = days[0].reports[0];
  assert.equal(typeof first.inside_humidity, 'number');
  assert.ok(first.inside_humidity > 0 && first.inside_humidity < 100);
});

test('processForecastData uses summary max/min when present', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days[0].maxTemp, 24);
  assert.equal(days[0].minTemp, 14);
});

test('processForecastData falls back to computed temps and -- when none exist', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days[1].maxTemp, 19);
  assert.equal(days[1].minTemp, 19);
  const noTempPayload = {
    forecasts: [{
      summary: {},
      detailed: {
        reports: [{ localDate: '2026-08-22', timeslot: '09:00' }]
      }
    }]
  };
  const noTemp = processForecastData(noTempPayload, 21);
  assert.equal(noTemp.length, 1);
  assert.equal(noTemp[0].maxTemp, '--');
  assert.equal(noTemp[0].minTemp, '--');
});

test('processForecastData returns an empty array when there are no hourly reports', () => {
  const empty = processForecastData({ forecasts: [{ summary: { report: { localDate: '2026-08-20' } }, detailed: { reports: [] } }] }, 21);
  assert.deepEqual(empty, []);
});
