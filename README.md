# AeroTemp Weather Dashboard

A premium, interactive weather and humidity trend visualization dashboard built using HTML, Vanilla CSS, and modern JavaScript. It fetches live, detailed weather data from the BBC Weather Aggregated API for any UK postcode.

![AeroTemp Mockup](https://images.unsplash.com/photo-1592210454359-9043f067919b?w=1200&q=80)

## Features

- **Postcode & Indoor Temp Filtering:** Fetches live weather data for any UK postcode (e.g. `KT4`, `SW1A`) and calculates indoor relative humidity on the fly.
- **Dynamic Multi-Dataset Charting:** Plots hourly variations of metrics over the 14-day forecast window. Each day is represented as a separate line, colored using a custom chronological HSL spectral scale to view progression trends easily.
- **Advanced Metric Selector:** Toggle between:
  - Outside Temperature
  - Indoor Humidity (calculated via vapor pressure saturation formulas)
  - Outside Relative Humidity
  - Feels Like Temp
  - Wind Speed
  - Precipitation Probability
- **High-Fidelity Tooltip & Highlight Effects:** Hover over day summary cards to highlight that day's line on the chart. Toggle lines on/off by clicking cards. Custom tooltips show multi-dimensional comparisons.
- **Smart Insights Panel:** Dynamically calculates maximum temperature peaks, maximum indoor RH peaks, maximum wind speeds, and assesses damp/mold risks based on sustained high indoor humidity.

## Indoor Humidity Calculation

Indoor Relative Humidity ($RH_{in}$) is calculated using the Magnus-Tetens psychrometric formula to determine the saturation vapor pressure ($p_{sat}$) at a given temperature:

$$p_{sat}(T) = 6.122 \times \exp\left(\frac{17.62 \times T}{243.12 + T}\right)$$

Assuming the moisture level inside is close to outside, the inside humidity is computed as:

$$RH_{in} = \frac{(T_{in} + 273.15) \times RH_{out} \times p_{sat}(T_{out})}{(T_{out} + 273.15) \times p_{sat}(T_{in})}$$

## How to Run Locally

1. Clone or navigate to the directory:
   ```bash
   cd weather-dashboard
   ```
2. Start the local development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:8080` in your web browser. Or pass URL parameters directly:
   `http://localhost:8080/?postCode=KT4&indoorTemp=23`
