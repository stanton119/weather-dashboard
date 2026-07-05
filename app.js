/**
 * AeroTemp App JavaScript Logic
 * Interactivity, data processing, and custom Chart.js visualization.
 */

// Global State
let forecastData = []; // Processed days
let activeMetric = 'outside_temp'; // Current metric shown on Y axis
let activePostcode = 'KT4';
let activeIndoorTemp = 23;
let forecastDaysLimit = 7; // Limit for forecast days to show (default 7)
let chartInstance = null;
let highlightedDayIndex = null; // Currently highlighted day index

// Configuration constants
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

// DOM Elements
const forecastForm = document.getElementById('forecastForm');
const postcodeInput = document.getElementById('postcodeInput');
const indoorTempInput = document.getElementById('indoorTempInput');
const rangeSlider = document.getElementById('rangeSlider');
const rangeValueBadge = document.getElementById('rangeValueBadge');
const activeLocation = document.getElementById('activeLocation');
const metricTitle = document.getElementById('metricTitle');
const forecastPeriod = document.getElementById('forecastPeriod');
const chartYLabel = document.getElementById('chartYLabel');
const dayCardsList = document.getElementById('dayCardsList');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const customTooltip = document.getElementById('chartjs-tooltip');

// Insights DOM
const valWarmest = document.getElementById('valWarmest');
const descWarmest = document.getElementById('descWarmest');
const valMaxIndoorRH = document.getElementById('valMaxIndoorRH');
const descMaxIndoorRH = document.getElementById('descMaxIndoorRH');
const valWind = document.getElementById('valWind');
const descWind = document.getElementById('descWind');
const valMoldRisk = document.getElementById('valMoldRisk');
const descMoldRisk = document.getElementById('descMoldRisk');

// Metric definitions
const METRICS = {
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
  }
};

// Consistent color scale for the timeline (Now -> Future)
const TIMELINE_COLORS = {
  startHue: 205, // Sky Blue (Now)
  endHue: 280    // Purple (Future)
};

/**
 * Psychrometric calculations for relative humidity
 * Saturate vapor pressure is calculated via Magnus-Tetens formula.
 */
function saturatePressure(temp) {
  return 6.122 * Math.exp((17.62 * temp) / (243.12 + temp));
}

function calculateIndoorHumidity(outsideTemp, outsideHumidity, indoorTemp) {
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
function getDayColor(index, total, opacity = 1) {
  const startHue = TIMELINE_COLORS.startHue;
  const endHue = TIMELINE_COLORS.endHue;
  // Interpolate hue linearly across the forecast window (Now -> Future)
  const hue = startHue + (index / Math.max(1, total - 1)) * (endHue - startHue);
  return `hsla(${hue}, 85%, 60%, ${opacity})`;
}

/**
 * Parse URL Parameters
 */
function syncParamsFromURL() {
  const params = new URLSearchParams(window.location.search);
  const pc = params.get('postCode');
  const it = params.get('indoorTemp');
  
  if (pc) activePostcode = pc.trim().toUpperCase();
  if (it) {
    const parsed = parseFloat(it);
    if (!isNaN(parsed)) activeIndoorTemp = parsed;
  }
  
  // Populate form inputs
  postcodeInput.value = activePostcode;
  indoorTempInput.value = activeIndoorTemp;
  activeLocation.textContent = activePostcode;
}

function updateURLParams() {
  const params = new URLSearchParams();
  params.set('postCode', activePostcode);
  params.set('indoorTemp', activeIndoorTemp);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newUrl);
}

/**
 * Get formatted Date labels for readability (e.g. "Mon, Jul 6")
 */
function formatDateLabel(dateStr) {
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj)) return dateStr;
  return dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Fetch and process BBC aggregated weather forecast data
 */
async function fetchForecast(postcode) {
  // Format postcode to get outcode
  const cleanPostcode = postcode.split(' ')[0].trim().toLowerCase();
  const url = `https://weather-broker-cdn.api.bbci.co.uk/en/forecast/aggregated/${cleanPostcode}`;
  
  showLoading(true);
  hideError();
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch forecast for postcode "${postcode.toUpperCase()}".`);
    }
    const data = await response.json();
    processForecastData(data);
    updateDashboard();
  } catch (error) {
    console.error(error);
    showError(error.message || 'Error loading forecast. Please check the postcode and network connection.');
  } finally {
    showLoading(false);
  }
}

function getVisibleForecastData() {
  return forecastData.slice(0, forecastDaysLimit);
}

function updateRangeBadge() {
  if (rangeValueBadge) {
    rangeValueBadge.textContent = `${forecastDaysLimit} Day${forecastDaysLimit > 1 ? 's' : ''}`;
  }
}

function processForecastData(data) {
  const forecasts = data.forecasts || [];
  forecastData = forecasts.map((dayObj, index) => {
    const detailed = dayObj.detailed || {};
    const reports = detailed.reports || [];
    const summary = dayObj.summary || {};
    const summaryReport = summary.report || {};
    
    const dateStr = summaryReport.localDate || (reports[0] && reports[0].localDate) || '';
    
    const parsedReports = reports.map(r => {
      const outside_temp = r.temperatureC;
      const outside_humidity = r.humidity;
      const inside_humidity = calculateIndoorHumidity(outside_temp, outside_humidity, activeIndoorTemp);
      
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
    });

    return {
      index,
      dateStr,
      formattedDate: formatDateLabel(dateStr),
      maxTemp: summaryReport.maxTempC !== null ? summaryReport.maxTempC : Math.max(...parsedReports.map(r => r.outside_temp)),
      minTemp: summaryReport.minTempC !== null ? summaryReport.minTempC : Math.min(...parsedReports.map(r => r.outside_temp)),
      weatherText: summaryReport.weatherTypeText || (parsedReports[12] && parsedReports[12].weather_text) || 'Cloudy',
      reports: parsedReports,
      visible: true // Visible in chart
    };
  });

  // Set range slider limit based on data
  const totalDays = forecastData.length;
  if (rangeSlider) {
    rangeSlider.max = totalDays;
    if (forecastDaysLimit > totalDays) {
      forecastDaysLimit = totalDays;
    }
    rangeSlider.value = forecastDaysLimit;
  }
  updateRangeBadge();
}

/**
 * Recalculate indoor relative humidity when indoor temp updates
 */
function recalculateIndoorRH() {
  forecastData.forEach(day => {
    day.reports.forEach(r => {
      r.inside_humidity = calculateIndoorHumidity(r.outside_temp, r.outside_humidity, activeIndoorTemp);
    });
  });
}

/**
 * Toggle Loading and Errors
 */
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.add('visible');
  } else {
    loadingOverlay.classList.remove('visible');
  }
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.style.display = 'flex';
}

function hideError() {
  errorBanner.style.display = 'none';
}

/**
 * Dashboard updates (Chart, Day Cards, Stats Cards)
 */
function updateDashboard() {
  const visibleData = getVisibleForecastData();
  if (visibleData.length === 0) return;
  
  // Update header text
  const metricName = METRICS[activeMetric].label;
  metricTitle.textContent = `${metricName} Forecast`;
  
  const startDateStr = visibleData[0].formattedDate;
  const endDateStr = visibleData[visibleData.length - 1].formattedDate;
  forecastPeriod.textContent = `Forecast from ${startDateStr} to ${endDateStr}`;
  activeLocation.textContent = activePostcode;
  chartYLabel.textContent = METRICS[activeMetric].yAxisLabel;
  
  // Render subcomponents
  renderDayCards();
  renderChart();
  calculateInsights();
}

/**
 * Render horizontal scrolling list of day cards
 */
function renderDayCards() {
  dayCardsList.innerHTML = '';
  const visibleData = getVisibleForecastData();
  
  visibleData.forEach((day, i) => {
    const card = document.createElement('div');
    card.className = `day-card ${day.visible ? 'active' : ''}`;
    card.style.setProperty('--day-color', getDayColor(i, visibleData.length));
    
    // Select appropriate weather emoji icon
    const icon = getWeatherIcon(day.weatherText);
    
    card.innerHTML = `
      <div class="day-name">${i === 0 ? 'Today' : new Date(day.dateStr).toLocaleDateString('en-GB', { weekday: 'short' })}</div>
      <div class="day-date">${new Date(day.dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
      <span class="day-weather-icon">${icon}</span>
      <div class="day-temp-range">
        <span class="day-temp-max">${day.maxTemp}°</span>
        <span class="day-temp-min">${day.minTemp}°</span>
      </div>
    `;
    
    // Add Click listener to toggle day visibility in the chart
    card.addEventListener('click', (e) => {
      // Prevent highlighting trigger when clicking
      day.visible = !day.visible;
      card.classList.toggle('active', day.visible);
      updateChartVisibility();
    });
    
    // Hover listeners to highlight the corresponding chart line
    card.addEventListener('mouseenter', () => {
      highlightedDayIndex = i;
      updateChartLineStyle();
    });
    
    card.addEventListener('mouseleave', () => {
      highlightedDayIndex = null;
      updateChartLineStyle();
    });
    
    dayCardsList.appendChild(card);
  });
}

function getWeatherIcon(text) {
  const desc = text.toLowerCase();
  if (desc.includes('sun') || desc.includes('clear')) return '☀️';
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) return '🌧️';
  if (desc.includes('snow') || desc.includes('sleet') || desc.includes('hail')) return '❄️';
  if (desc.includes('thunder')) return '⛈️';
  if (desc.includes('cloud') || desc.includes('overcast')) return '☁️';
  if (desc.includes('mist') || desc.includes('fog')) return '🌫️';
  return '⛅';
}

/**
 * Generate Chart datasets based on forecast data and active metric
 */
function getChartDatasets() {
  const metricConfig = METRICS[activeMetric];
  const visibleData = getVisibleForecastData();
  
  return visibleData.map((day, i) => {
    // Map report data to hourly array
    const dataArray = Array(24).fill(null);
    day.reports.forEach(report => {
      dataArray[report.hour] = metricConfig.getValue(report);
    });
    
    // Compute styling: handle dimmed or highlighted hover states
    let colorOpacity = 0.8;
    let borderWidth = 2;
    
    if (highlightedDayIndex !== null) {
      if (highlightedDayIndex === i) {
        colorOpacity = 1.0;
        borderWidth = 4;
      } else {
        colorOpacity = 0.15;
        borderWidth = 1.5;
      }
    }
    
    const lineColor = getDayColor(i, visibleData.length, colorOpacity);
    
    return {
      label: day.formattedDate,
      data: dataArray,
      borderColor: lineColor,
      backgroundColor: 'transparent',
      borderWidth: borderWidth,
      tension: 0.35,
      spanGaps: true,
      hidden: !day.visible,
      pointBackgroundColor: lineColor,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderColor: lineColor,
      pointHoverBorderWidth: 2,
      pointRadius: (context) => {
        // Only show small dots on data points, highlight when hovered
        return context.dataset.hidden ? 0 : 2;
      }
    };
  });
}

/**
 * Render or Redraw the Chart.js canvas
 */
function renderChart() {
  const ctx = document.getElementById('forecastChart').getContext('2d');
  const datasets = getChartDatasets();
  const metricConfig = METRICS[activeMetric];
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: HOURS,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false // We use our own day cards row for legend!
        },
        tooltip: {
          enabled: false, // Turn off default tooltips to use custom HTML tooltip
          external: function (context) {
            handleCustomTooltip(context);
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.08)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit',
              size: 11
            },
            // Show tick labels every 3 hours for cleaner look
            callback: function(val, index) {
              return index % 3 === 0 ? HOURS[index] : '';
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.08)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit',
              size: 11
            },
            callback: function(value) {
              return value + metricConfig.unit;
            }
          }
        }
      }
    }
  });
}

function updateChartVisibility() {
  if (!chartInstance) return;
  const visibleData = getVisibleForecastData();
  visibleData.forEach((day, i) => {
    chartInstance.setDatasetVisibility(i, day.visible);
  });
  chartInstance.update('none'); // Update without full animation for performance
}

function updateChartLineStyle() {
  if (!chartInstance) return;
  
  const datasets = getChartDatasets();
  datasets.forEach((dataset, i) => {
    chartInstance.data.datasets[i].borderColor = dataset.borderColor;
    chartInstance.data.datasets[i].borderWidth = dataset.borderWidth;
    chartInstance.data.datasets[i].pointHoverBorderColor = dataset.pointHoverBorderColor;
    chartInstance.data.datasets[i].pointBackgroundColor = dataset.pointBackgroundColor;
  });
  
  chartInstance.update('none'); // Update style instantly
}

/**
 * Custom High-Fidelity Tooltip
 */
function handleCustomTooltip(context) {
  const tooltipModel = context.tooltip;
  
  if (tooltipModel.opacity === 0) {
    customTooltip.style.opacity = 0;
    return;
  }
  
  // Find which day is closest/active or hovered
  const dataPoints = tooltipModel.dataPoints || [];
  if (dataPoints.length === 0) return;
  
  // Grab the hour index
  const hourIndex = dataPoints[0].dataIndex;
  const hourLabel = HOURS[hourIndex];
  
  let html = `<div class="tooltip-header"><span>Time: ${hourLabel}</span></div>`;
  
  // Collect all data values for the current hour
  const activeReports = [];
  
  const visibleData = getVisibleForecastData();
  visibleData.forEach((day, i) => {
    if (!day.visible) return;
    const report = day.reports.find(r => r.hour === hourIndex);
    if (report) {
      activeReports.push({
        dayName: day.formattedDate,
        color: getDayColor(i, visibleData.length),
        val: METRICS[activeMetric].getValue(report),
        fullReport: report
      });
    }
  });
  
  // Sort reports so they display in order of day
  activeReports.forEach(item => {
    const valStr = item.val !== null ? `${item.val}${METRICS[activeMetric].unit}` : 'N/A';
    
    // Add additional secondary info context depending on active metric
    let extraInfo = '';
    if (activeMetric === 'outside_temp') {
      extraInfo = ` | RH: ${item.fullReport.outside_humidity}%`;
    } else if (activeMetric === 'inside_humidity') {
      extraInfo = ` | Out T: ${item.fullReport.outside_temp}°C`;
    } else if (activeMetric === 'outside_humidity') {
      extraInfo = ` | In RH: ${item.fullReport.inside_humidity}%`;
    }
    
    html += `
      <div class="tooltip-row" style="color: ${item.color};">
        <span class="tooltip-label">${item.dayName}${extraInfo}</span>
        <span class="tooltip-value">${valStr}</span>
      </div>
    `;
  });
  
  customTooltip.innerHTML = html;
  
  // Positioning the tooltip
  const position = context.chart.canvas.getBoundingClientRect();
  
  customTooltip.style.opacity = 1;
  customTooltip.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 15 + 'px';
  customTooltip.style.top = position.top + window.pageYOffset + tooltipModel.caretY - 20 + 'px';
}

/**
 * Compute key dashboard insights
 */
function calculateInsights() {
  let peakTemp = -Infinity;
  let peakTempTime = '';
  let peakIndoorRH = -Infinity;
  let peakIndoorRHTime = '';
  let peakWind = -Infinity;
  let peakWindTime = '';
  
  let moldSustainedHours = 0; // Number of hours with indoor humidity > 60%
  let totalHours = 0;

  const visibleData = getVisibleForecastData();
  visibleData.forEach(day => {
    day.reports.forEach(r => {
      totalHours++;
      
      // Warmest peak
      if (r.outside_temp !== null && r.outside_temp > peakTemp) {
        peakTemp = r.outside_temp;
        peakTempTime = `${day.formattedDate} @ ${r.timeslot}`;
      }
      
      // Peak Indoor Humidity
      if (r.inside_humidity !== null && r.inside_humidity > peakIndoorRH) {
        peakIndoorRH = r.inside_humidity;
        peakIndoorRHTime = `${day.formattedDate} @ ${r.timeslot}`;
      }
      
      // Peak Wind Speed
      if (r.wind_speed !== null && r.wind_speed > peakWind) {
        peakWind = r.wind_speed;
        peakWindTime = `${day.formattedDate} @ ${r.timeslot} (${r.wind_direction})`;
      }
      
      // Mold risk (sustained RH > 60%)
      if (r.inside_humidity !== null && r.inside_humidity > 60) {
        moldSustainedHours++;
      }
    });
  });

  // Warmest
  if (peakTemp !== -Infinity) {
    valWarmest.textContent = `${peakTemp}°C`;
    descWarmest.textContent = peakTempTime;
  }
  
  // Peak Indoor RH
  if (peakIndoorRH !== -Infinity) {
    valMaxIndoorRH.textContent = `${peakIndoorRH}%`;
    descMaxIndoorRH.textContent = peakIndoorRHTime;
    
    // Mold Risk calculations
    const moldPercentage = (moldSustainedHours / totalHours) * 100;
    if (peakIndoorRH > 70 && moldPercentage > 15) {
      valMoldRisk.textContent = 'HIGH';
      valMoldRisk.style.color = 'var(--danger-color)';
      descMoldRisk.textContent = `RH > 60% for ${Math.round(moldPercentage)}% of forecast`;
    } else if (peakIndoorRH > 60 && moldPercentage > 5) {
      valMoldRisk.textContent = 'MEDIUM';
      valMoldRisk.style.color = 'var(--warning-color)';
      descMoldRisk.textContent = `RH > 60% for ${Math.round(moldPercentage)}% of forecast`;
    } else {
      valMoldRisk.textContent = 'LOW';
      valMoldRisk.style.color = 'var(--success-color)';
      descMoldRisk.textContent = 'Indoor humidity is safe';
    }
  }
  
  // Peak Wind Speed
  if (peakWind !== -Infinity) {
    valWind.textContent = `${peakWind} km/h`;
    descWind.textContent = peakWindTime;
  }
}

/**
 * Event Listeners & Bootstrapping
 */
function initEventListeners() {
  // Update forecast submit
  forecastForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const inputPostcode = postcodeInput.value.trim().toUpperCase();
    const inputIndoorTemp = parseFloat(indoorTempInput.value);
    
    if (inputPostcode) activePostcode = inputPostcode;
    if (!isNaN(inputIndoorTemp)) activeIndoorTemp = inputIndoorTemp;
    
    updateURLParams();
    fetchForecast(activePostcode);
  });
  
  // Live update indoor temp (debounced or on change)
  indoorTempInput.addEventListener('change', () => {
    const inputIndoorTemp = parseFloat(indoorTempInput.value);
    if (!isNaN(inputIndoorTemp)) {
      activeIndoorTemp = inputIndoorTemp;
      updateURLParams();
      recalculateIndoorRH();
      calculateInsights();
      if (activeMetric === 'inside_humidity') {
        updateChartLineStyle();
        chartInstance.update();
      }
    }
  });

  // Range slider interaction
  if (rangeSlider) {
    rangeSlider.addEventListener('input', () => {
      forecastDaysLimit = parseInt(rangeSlider.value);
      updateRangeBadge();
      updateDashboard();
    });
  }

  // Metric buttons toggles
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.metric-btn.active').classList.remove('active');
      btn.classList.add('active');
      
      activeMetric = btn.dataset.metric;
      updateDashboard();
    });
  });
  
  // Select All/Deselect All buttons
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    getVisibleForecastData().forEach(day => day.visible = true);
    document.querySelectorAll('.day-card').forEach(card => card.classList.add('active'));
    updateChartVisibility();
  });

  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    getVisibleForecastData().forEach(day => day.visible = false);
    document.querySelectorAll('.day-card').forEach(card => card.classList.remove('active'));
    updateChartVisibility();
  });
}

// Start application
function startApp() {
  syncParamsFromURL();
  initEventListeners();
  
  // Fetch default forecast
  fetchForecast(activePostcode);
  
  // Create icons
  lucide.createIcons();
}

// Kickoff
window.addEventListener('DOMContentLoaded', startApp);
