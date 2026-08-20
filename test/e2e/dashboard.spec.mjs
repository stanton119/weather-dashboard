import { test, expect } from '@playwright/test';
import { forecastResponse } from './helpers.mjs';

const skipIfUnreachable = (resp) =>
  test.skip(!resp || resp.status() >= 400, 'BBC weather API unreachable');

const EXTERNAL_NETWORK_FAILURES = ['Failed to fetch', 'Failed to load resource', 'net::ERR'];

test('loads, renders the chart, and has no console errors', async ({ page }) => {
  const errors = [];
  let cdnFailed = false;
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('response', (resp) => {
    if (resp.url().includes('weather-broker-cdn') && resp.status() >= 400) {
      cdnFailed = true;
    }
  });

  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);

  skipIfUnreachable(resp);
  test.skip(cdnFailed, 'weather-broker-cdn returned an error response');

  await expect(page.locator('#forecastChart')).toBeVisible();
  await expect(page.locator('.day-card').first()).toBeVisible();

  const unexpected = errors.filter(
    (text) => !EXTERNAL_NETWORK_FAILURES.some((frag) => text.includes(frag))
  );
  expect(unexpected).toEqual([]);
});

test('submitting a postcode updates the location and URL', async ({ page }) => {
  await page.goto('/');

  const respPromise = forecastResponse(page, 'sw1a');
  await page.fill('#postcodeInput', 'SW1A');
  await page.click('button[type="submit"]');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await expect(page).toHaveURL(/postCode=SW1A/);
  await expect(page.locator('#activeLocation')).toHaveText('SW1A');
});

test('switching metric updates the title and reloads the chart', async ({ page }) => {
  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await page.click('.metric-btn[data-metric="wind_speed"]');
  await expect(page.locator('#metricTitle')).toHaveText('Wind Speed Forecast');
});

test('clicking a day card toggles its active state', async ({ page }) => {
  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  const firstCard = page.locator('.day-card').first();
  await expect(firstCard).toHaveClass(/active/);
  await firstCard.click();
  await expect(firstCard).not.toHaveClass(/active/);
});

test('shows the error banner for an invalid postcode', async ({ page }) => {
  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await page.fill('#postcodeInput', 'ZZZZZZ');
  await page.click('button[type="submit"]');

  await expect(page.locator('#errorBanner')).toBeVisible();
});
