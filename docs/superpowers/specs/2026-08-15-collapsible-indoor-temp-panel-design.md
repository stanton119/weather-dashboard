# Collapsible Indoor Temp Panel Design

## Goal

Make the sidebar's Indoor Temp field communicate that it is an input *to the indoor humidity calculation* — not a general setting. Physically nest it under the "Indoor Humidity" metric button in the "Select Metric" card, and collapse it entirely when the Indoor Humidity metric is not active.

## Context

The Indoor Temp field currently lives in the main search form (`index.html:49-55`) with the label "Indoor Temp (°C)". It only feeds `calculateIndoorHumidity()` (`app.js:102`), which powers the `inside_humidity` metric, the "Peak Indoor RH" insight card, and the "Mold Risk" insight card. Because it sits in the general form beside the postcode and forecast-range controls, it reads like a global setting even though it affects only humidity-related values.

Note: Peak RH and Mold Risk insight cards are always displayed in the summary grid regardless of the active metric, so the value keeps affecting the dashboard even when the panel is collapsed.

## Approach

Nest the Indoor Temp input inside the metric list, directly under the "Indoor Humidity" button, as a collapsible sub-panel. The panel is locked closed except when the Indoor Humidity metric is active (determined by `syncParamsFromURL()` on load and by the metric button click handler). When a different metric is selected, the panel hides entirely — no pill, no placeholder.

## Changes

### 1. `index.html`

- Remove the Indoor Temp `form-group` from the search form (lines 49-55).
- Wrap the Indoor Humidity metric button (lines 85-91) in a `.metric-item` div:
  - Existing `.metric-btn` intact (same `data-metric="inside_humidity"`, icon, title, subtitle).
  - Add `<div class="indoor-temp-panel">` immediately after it containing:
    - Label "Assumed Indoor Temp (°C)"
    - The existing number input (`id="indoorTempInput"`, `step="0.5"`, `placeholder="e.g. 21"`) — **drop the `required` attribute** (it no longer belongs to the form; `activeIndoorTemp` defaults to 23).
    - Note: "Assumed indoor air temp used to calculate indoor RH. Also feeds Peak Indoor RH & Mold Risk insights."

### 2. `style.css`

Add styles next to the existing Metric Toggles block (around line 305):

- `.metric-item` — container for the button + panel.
- `.indoor-temp-panel` — indented under the button, accent left border, subtle card background, `overflow: hidden` with a `max-height`/`opacity` transition for a smooth open/close.
- A closed state (max-height anchored / hidden) applied via a modifier class toggled from JS.

### 3. `app.js`

- Metric button click handler (`app.js:978-987`): after `activeMetric` is set, toggle the panel — open when `activeMetric === 'inside_humidity'`, closed otherwise.
- `syncParamsFromURL()` (`app.js:145-148`): when a valid `metric` param is present, apply the same open/close logic on load (handles shared/refreshed URLs).
- No changes to `calculateIndoorHumidity`, `recalculateIndoorRH`, `calculateInsights`, or the `indoorTempInput` `change` listener (`app.js:930`) — the element id is unchanged, so the indoor temp URL param (`syncParamsFromURL` read at `app.js:129-137`, `updateURLParams` write at `app.js:183`) keeps working as-is.

## Validation

- None (static site, no test framework — consistent with prior specs).
- Manual verification: load the dashboard; the temp panel is closed by default (metric default is `outside_temp`). Click "Indoor Humidity" → panel animates open, input value is editable and updates the chart/insights live. Click another metric → panel collapses. Reload with `&metric=inside_humidity` in the URL → panel is open on load; `&metric=outside_temp` → panel closed.

## Out of Scope

- Changing the psychrometric calculation itself.
- Pill/summary representation of the hidden value (decided: hide entirely).
- Any URL param behavior changes.