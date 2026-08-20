// Shared pure constants and calculations, extracted from app.js.
// Loaded as an ES module in the browser (see index.html) and importable in Node for unit tests.

export const CARBON_SERIES = [
  { key: 'regional_forecast', label: 'Regional Forecast', short: 'Regional F', color: '#34d399', dash: [] },
  { key: 'national_forecast', label: 'National Forecast', short: 'National F', color: '#60a5fa', dash: [] },
  { key: 'regional_historic', label: 'Regional Historic', short: 'Regional H', color: '#a78bfa', dash: [4, 4] },
  { key: 'national_historic', label: 'National Historic', short: 'National H', color: '#fbbf24', dash: [4, 4] }
];

// Metric definitions
export const METRICS = {
  outside_temp: {
    label: 'Outside Temperature',
    unit: '°C',
    yAxisLabel: 'Temperature (°C)',
    getValue: (report) => report.outside_temp
  },
  inside_humidity: {
    label: 'Indoor Relative Humidity',
    unit: '%',
    yAxisLabel: 'Indoor Relative Humidity (%)',
    getValue: (report) => report.inside_humidity
  },
  outside_humidity: {
    label: 'Outside Relative Humidity',
    unit: '%',
    yAxisLabel: 'Outside Relative Humidity (%)',
    getValue: (report) => report.outside_humidity
  },
  feels_like: {
    label: 'Feels Like Temperature',
    unit: '°C',
    yAxisLabel: 'Apparent Temp (°C)',
    getValue: (report) => report.feels_like
  },
  wind_speed: {
    label: 'Wind Speed',
    unit: ' km/h',
    yAxisLabel: 'Wind Speed (km/h)',
    getValue: (report) => report.wind_speed
  },
  precip_prob: {
    label: 'Precipitation Probability',
    unit: '%',
    yAxisLabel: 'Chance of Rain (%)',
    getValue: (report) => report.precip_prob
  },
  carbon_intensity: {
    label: 'Carbon Intensity',
    unit: ' gCO₂/kWh',
    yAxisLabel: 'Carbon Intensity (gCO₂/kWh)',
    getValue: (report) => report.regional_forecast ?? report.regional_historic
  }
};

// Consistent color scale for the timeline (Now -> Future)
export const TIMELINE_COLORS = {
  startHue: 205, // Sky Blue (Now)
  endHue: 280    // Purple (Future)
};

/**
 * Psychrometric calculations for relative humidity
 * Saturate vapor pressure is calculated via Magnus-Tetens formula.
 */
export function saturatePressure(temp) {
  return 6.122 * Math.exp((17.62 * temp) / (243.12 + temp));
}

export function calculateIndoorHumidity(outsideTemp, outsideHumidity, indoorTemp) {
  if (outsideTemp === null || outsideHumidity === null || indoorTemp === null) return null;
  const pSatOutside = saturatePressure(outsideTemp);
  const pSatInside = saturatePressure(indoorTemp);
  // Calculate relative humidity inside (assuming moisture level is similar to outdoors)
  const insideRH = (indoorTemp + 273.15) * outsideHumidity * pSatOutside / ((outsideTemp + 273.15) * pSatInside);
  return Math.min(100, Math.max(0, Math.round(insideRH * 10) / 10));
}

/**
 * Generate beautiful sequential color scale for days in forecast
 * Now (Today) is Sky Blue, transitioning to Purple for Future.
 */
export function getDayColor(index, total, opacity = 1) {
  const startHue = TIMELINE_COLORS.startHue;
  const endHue = TIMELINE_COLORS.endHue;
  // Interpolate hue linearly across the forecast window (Now -> Future)
  const hue = startHue + (index / Math.max(1, total - 1)) * (endHue - startHue);
  return `hsla(${hue}, 85%, 60%, ${opacity})`;
}

/**
 * Get formatted Date labels for readability (e.g. "Mon, Jul 6")
 */
export function isTodayDateStr(dateStr) {
  const d = new Date();
  const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  return dateStr === today;
}

export function formatDateLabel(dateStr) {
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj)) return dateStr;
  return dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function getWeatherIcon(text) {
  const desc = text.toLowerCase();
  if (desc.includes('sun') || desc.includes('clear')) return '☀️';
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) return '🌧️';
  if (desc.includes('snow') || desc.includes('sleet') || desc.includes('hail')) return '❄️';
  if (desc.includes('thunder')) return '⛈️';
  if (desc.includes('cloud') || desc.includes('overcast')) return '☁️';
  if (desc.includes('mist') || desc.includes('fog')) return '🌫️';
  return '⛅';
}

export function getDayMetricRange(day, metric) {
  if (metric === 'carbon_intensity') {
    const vals = [];
    day.reports.forEach(r => {
      CARBON_SERIES.forEach(s => {
        if (r[s.key] !== null && r[s.key] !== undefined) vals.push(r[s.key]);
      });
    });
    if (vals.length === 0) return '--';
    return `<span class="day-temp-max">${Math.round(Math.max(...vals))}</span> <span class="day-temp-min">${Math.round(Math.min(...vals))} gCO₂/kWh</span>`;
  }
  const metricConfig = METRICS[metric];
  const values = day.reports
    .map(r => metricConfig.getValue(r))
    .filter(val => val !== null && val !== undefined);
  if (values.length === 0) return '--';
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (metric === 'outside_temp' || metric === 'feels_like') {
    return `<span class="day-temp-max">${Math.round(max)}°</span> <span class="day-temp-min">${Math.round(min)}°</span>`;
  } else if (metric === 'inside_humidity' || metric === 'outside_humidity') {
    return `<span class="day-temp-max">${Math.round(max)}%</span> <span class="day-temp-min">${Math.round(min)}%</span>`;
  } else if (metric === 'wind_speed') {
    return `<span class="day-temp-max">${Math.round(max)}</span> <span class="day-temp-min" style="font-size: 10px;">km/h</span>`;
  } else if (metric === 'precip_prob') {
    return `<span class="day-temp-max">${Math.round(max)}%</span> <span class="day-temp-min" style="font-size: 10px;">rain</span>`;
  }
  return `<span class="day-temp-max">${Math.round(max)}</span> <span class="day-temp-min">${Math.round(min)}</span>`;
}

export function normalizeCarbonSeries(payload) {
  const raw = payload.data || [];
  const items = Array.isArray(raw) ? raw : (raw.data || []);
  return items.map(el => {
    const intensity = el.intensity || {};
    const value = (typeof intensity.forecast !== 'undefined' ? intensity.forecast : intensity.actual) ?? null;
    return { timestamp: new Date(el.from).getTime(), value };
  });
}

export function buildCarbonData(seriesResults) {
  const byTime = new Map();
  seriesResults.forEach(entry => {
    entry.points.forEach(p => {
      if (p.value === null || p.value === undefined) return;
      const d = new Date(p.timestamp);
      const localDate = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      if (!byTime.has(p.timestamp)) {
        byTime.set(p.timestamp, {
          timestamp: p.timestamp,
          localDate,
          timeslot: d.toTimeString().slice(0, 5),
          halfHour: Math.floor((d.getHours() * 60 + d.getMinutes()) / 30),
          regional_forecast: null,
          national_forecast: null,
          regional_historic: null,
          national_historic: null
        });
      }
      byTime.get(p.timestamp)[entry.key] = p.value;
    });
  });
  const reports = Array.from(byTime.values()).sort((a, b) => a.timestamp - b.timestamp);
  const byDate = {};
  reports.forEach(r => {
    if (!byDate[r.localDate]) byDate[r.localDate] = [];
    byDate[r.localDate].push(r);
  });
  return Object.keys(byDate).sort().map((dateStr, index) => ({
    index,
    dateStr,
    formattedDate: formatDateLabel(dateStr),
    weatherText: 'carbon',
    reports: byDate[dateStr],
    visible: true
  }));
}

export function processForecastData(data, indoorTemp) {
  const forecasts = data.forecasts || [];
  const reportsByDate = {};
  const summaryByDate = {};
  forecasts.forEach(dayObj => {
    const summaryReport = (dayObj.summary && dayObj.summary.report) || {};
    if (summaryReport.localDate) summaryByDate[summaryReport.localDate] = summaryReport;
    const detailed = dayObj.detailed || {};
    const reports = detailed.reports || [];
    reports.forEach(r => {
      if (!r.localDate) return;
      if (!reportsByDate[r.localDate]) reportsByDate[r.localDate] = [];
      reportsByDate[r.localDate].push(r);
    });
  });
  const sortedDates = Object.keys(reportsByDate).sort();
  return sortedDates.map((dateStr, index) => {
    const reportsForDate = reportsByDate[dateStr];
    const parsedReports = reportsForDate.map(r => {
      const outside_temp = r.temperatureC;
      const outside_humidity = r.humidity;
      const inside_humidity = calculateIndoorHumidity(outside_temp, outside_humidity, indoorTemp);
      return {
        hour: parseInt(r.timeslot.split(':')[0]),
        timeslot: r.timeslot,
        localDate: r.localDate,
        outside_temp,
        outside_humidity,
        inside_humidity,
        feels_like: r.feelsLikeTemperatureC,
        wind_speed: r.windSpeedKph,
        wind_direction: r.windDirectionAbbreviation,
        precip_prob: r.precipitationProbabilityInPercent,
        weather_text: r.weatherTypeText || 'Unknown'
      };
    }).sort((a, b) => a.hour - b.hour);
    const summaryReport = summaryByDate[dateStr] || {};
    const temps = parsedReports.map(r => r.outside_temp).filter(t => t !== null && t !== undefined);
    const maxTemp = summaryReport.maxTempC !== null && summaryReport.maxTempC !== undefined ?
      summaryReport.maxTempC : (temps.length ? Math.max(...temps) : '--');
    const minTemp = summaryReport.minTempC !== null && summaryReport.minTempC !== undefined ?
      summaryReport.minTempC : (temps.length ? Math.min(...temps) : '--');
    const midIndex = Math.floor(parsedReports.length / 2);
    const weatherText = summaryReport.weatherTypeText ||
      (parsedReports[midIndex] && parsedReports[midIndex].weather_text) || 'Cloudy';
    return {
      index,
      dateStr,
      formattedDate: formatDateLabel(dateStr),
      maxTemp,
      minTemp,
      weatherText,
      reports: parsedReports,
      visible: true
    };
  });
}

// Expose as globals for classic-script app.js, which resolves these names bare.
if (typeof window !== 'undefined') {
  Object.assign(window, {
    CARBON_SERIES,
    METRICS,
    TIMELINE_COLORS,
    saturatePressure,
    calculateIndoorHumidity,
    getDayColor,
    isTodayDateStr,
    formatDateLabel,
    getWeatherIcon,
    getDayMetricRange,
    normalizeCarbonSeries,
    buildCarbonData,
    processForecastData
  });
}