# Collapsible Indoor Temp Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Indoor Temp field out of the search form and nest it under the "Indoor Humidity" metric button as a collapsible panel that is only visible when the Indoor Humidity metric is active.

**Architecture:** Restructure the sidebar: (1) remove the Indoor Temp `form-group` from the search form, (2) wrap the Indoor Humidity metric button in a `.metric-item` with a collapsible `.indoor-temp-panel` containing the moved input and a scope note, (3) style the panel in CSS, and (4) toggle the panel open/closed from the existing metric button click handler and from `syncParamsFromURL()` when a valid `metric` URL param is present. The `indoorTempInput` element id is preserved, so the existing `change` listener and URL-sync (`indoorTemp` param) keep working unmodified.

**Tech Stack:** Vanilla JS, static site (HTML + CSS + JS). No test framework.

## Global Constraints

- Panel is open only when `activeMetric === 'inside_humidity'`; otherwise fully hidden (no pill/summary).
- The indoor temp input id stays `indoorTempInput` — do not rename; URL param `indoorTemp` behavior must remain unchanged.
- Drop the `required` attribute from the moved input (it no longer belongs to a form; `activeIndoorTemp` defaults to 23 in `app.js:10`).
- Do not change `calculateIndoorHumidity`, `recalculateIndoorRH`, `calculateInsights`, or the `indoorTempInput` `change` listener.
- Do not add comments to code.
- No test framework exists; verify manually in the browser.

---

### Task 1: Move Indoor Temp field into a `.metric-item` under the Indoor Humidity button

**Files:**
- Modify: `index.html:49-55` (remove Indoor Temp form-group from search form)
- Modify: `index.html:85-91` (wrap Indoor Humidity metric button in `.metric-item`, add `.indoor-temp-panel`)

**Interfaces:**
- Consumes: existing `indoorTempInput` number input markup.
- Produces: `.metric-item` wrapper containing the Indoor Humidity `button.metric-btn` (`data-metric="inside_humidity"`) and a `div.indoor-temp-panel` holding the label, `input#indoorTempInput` (no `required`), and scope note. Referenced later by the CSS in Task 2 and the toggling JS in Task 3.

- [ ] **Step 1: Remove the Indoor Temp field from the search form**

In `index.html`, delete the entire Indoor Temp `form-group` block (lines 49-55):

```html
<div class="form-group">
  <label for="indoorTempInput">Indoor Temp (°C)</label>
  <div class="input-wrapper">
    <i data-lucide="thermometer"></i>
    <input type="number" id="indoorTempInput" step="0.5" placeholder="e.g. 21" required>
  </div>
</div>
```

The search form now contains only the postcode group, the forecast-range group, and the submit button.

- [ ] **Step 2: Nest the panel under the Indoor Humidity button**

In `index.html`, wrap the Indoor Humidity button (currently lines 85-91) so that the button and the new panel are children of a `div.metric-item`. Replace this:

```html
<button type="button" class="metric-btn" data-metric="inside_humidity">
  <i data-lucide="droplet-half"></i>
  <div>
    <div style="font-weight: 600;">Indoor Humidity</div>
    <div style="font-size: 11px; opacity: 0.7;">Calculated psychrometric RH</div>
  </div>
</button>
```

with this:

```html
<div class="metric-item">
  <button type="button" class="metric-btn" data-metric="inside_humidity">
    <i data-lucide="droplet-half"></i>
    <div>
      <div style="font-weight: 600;">Indoor Humidity</div>
      <div style="font-size: 11px; opacity: 0.7;">Calculated psychrometric RH</div>
    </div>
  </button>
  <div class="indoor-temp-panel" id="indoorTempPanel">
    <div class="indoor-temp-label">Assumed Indoor Temp (°C)</div>
    <div class="indoor-temp-input-wrapper">
      <i data-lucide="thermometer"></i>
      <input type="number" id="indoorTempInput" step="0.5" placeholder="e.g. 21">
    </div>
    <div class="indoor-temp-note">Assumed indoor air temp used to calculate indoor RH. Also feeds Peak Indoor RH &amp; Mold Risk insights.</div>
  </div>
</div>
```

The input keeps the same `indoorTempInput` id as before — verify in Step 3 that no duplicate `id` remains. The new `.indoor-temp-input-wrapper` replicates the sidebar's `.input-wrapper` styles (see Task 2), since the old wrapper used the shared `.input-wrapper` class.

- [ ] **Step 3: Manually verify the DOM**

Serve the repo root (`python3 -m http.server`), open the page, and open DevTools:
- Confirm the search form contains no "Indoor Temp" label.
- Confirm one (and only one) element with `id="indoorTempInput"` exists, inside `#indoorTempPanel`.
- Confirm `#indoorTempPanel` renders inside the metrics card below the Indoor Humidity button.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: nest indoor temp input under indoor humidity metric"
```

### Task 2: Style the metric-item and collapsible panel

**Files:**
- Modify: `style.css` (after the Metric Toggles block, around line 305-338)

**Interfaces:**
- Consumes: `.metric-item`, `.indoor-temp-panel` from Task 1.
- Produces: `.indoor-temp-panel` visible/animated when it has the `open` class and hidden otherwise; an open/close transition for Task 3's JS to toggle.

- [ ] **Step 1: Add `.metric-item` and `.indoor-temp-panel` styles**

Append after the `.metric-btn i` rule (style.css:335-338):

```css
.metric-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.indoor-temp-panel {
  margin-left: 8px;
  background: rgba(30, 41, 67, 0.8);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-left: 3px solid var(--accent-color);
  border-radius: 10px;
  padding: 12px;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  transition: max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
  pointer-events: none;
}

.indoor-temp-panel.open {
  max-height: 220px;
  opacity: 1;
  padding-top: 12px;
  padding-bottom: 12px;
  pointer-events: auto;
}

.indoor-temp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.indoor-temp-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.indoor-temp-input-wrapper i {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  width: 16px;
  height: 16px;
}

.indoor-temp-input-wrapper input[type="number"] {
  width: 100%;
  padding: 10px 12px 10px 38px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  transition: all 0.3s ease;
}

.indoor-temp-input-wrapper input[type="number"]:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow);
  background: rgba(0, 0, 0, 0.5);
}

.indoor-temp-note {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.4;
}
```

- [ ] **Step 2: Manually verify styling**

With the page served, in DevTools add the class `open` to `#indoorTempPanel`. Confirm it expands smoothly, the thermometer icon aligns inside the input, and the note wraps correctly under the input. Remove the `open` class and confirm it collapses with no visible remains.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: style collapsible indoor temp panel"
```

### Task 3: Toggle the panel from metric selection and URL param

**Files:**
- Modify: `app.js:145-148` (metric URL param block in `syncParamsFromURL`)
- Modify: `app.js:978-987` (metric button click handler)
- Add: a small `updateIndoorTempPanel()` helper (place it near `syncParamsFromURL`, before `initEventListeners`)

**Interfaces:**
- Consumes: `#indoorTempPanel` element from Task 1, the `open` class from Task 2.
- Produces: `updateIndoorTempPanel()` — toggles `#indoorTempPanel`'s `open` class based on `activeMetric === 'inside_humidity'`. Called on load (when a valid `metric` param is present) and on every metric button click.

- [ ] **Step 1: Add the `updateIndoorTempPanel` helper**

In `app.js`, add this function after `updateURLParams()` (app.js:180-189):

```js
function updateIndoorTempPanel() {
  const panel = document.getElementById('indoorTempPanel');
  if (!panel) return;
  panel.classList.toggle('open', activeMetric === 'inside_humidity');
}
```

- [ ] **Step 2: Set initial panel state from the URL param**

In `syncParamsFromURL()`, inside the existing block that handles the `metric` param (app.js:145-148), extend it so the panel state is derived on load. Replace:

```js
  const mt = params.get('metric');
  if (mt && METRICS[mt]) {
    activeMetric = mt;
  }
```

with:

```js
  const mt = params.get('metric');
  if (mt && METRICS[mt]) {
    activeMetric = mt;
  }
  updateIndoorTempPanel();
```

Also, when no valid `metric` param exists, the HTML default metric is `outside_temp` (first `.metric-btn` is `active` in index.html:77), so the panel must start closed. Call `updateIndoorTempPanel()` once unconditionally at the end of `syncParamsFromURL()` (after the existing `mt` metric-button active-state block, app.js:173-177). With both calls present, delete the one added above in the `mt` block (keep only the unconditional call at the end) to avoid double-toggling.

Final state in `syncParamsFromURL()`: after the metric-button active-state block (app.js:173-177), add:

```js
  updateIndoorTempPanel();
```

- [ ] **Step 3: Toggle on metric button click**

In the metric button click handler (app.js:978-987), after `updateDashboard();`, add:

```js
      updateIndoorTempPanel();
```

- [ ] **Step 4: Manually verify all paths**

Serve the repo root and verify:
- Default load (no URL params): panel is closed.
- Click "Indoor Humidity": panel animates open; the input is editable and typing a value still live-updates the chart and the Peak Indoor RH / Mold Risk insight cards.
- Click another metric (e.g. "Wind Speed"): panel fully hides.
- Reload with `...&metric=inside_humidity`: panel is open on load.
- Reload with `...&metric=outside_temp` (existing metric-button styles set the correct active button): panel is closed on load.
- Change the temp while the humidity panel is open, then reload the page with the resulting URL: the input retains the edited value.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: collapse indoor temp panel unless indoor humidity is active"
```