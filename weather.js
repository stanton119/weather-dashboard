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
    getDayMetricRange
  });
}