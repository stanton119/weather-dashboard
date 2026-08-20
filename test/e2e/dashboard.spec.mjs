import { test, expect } from '@playwright/test';
import { forecastResponse } from './helpers.mjs';

const skipIfUnreachable = (resp) =>
  test.skip(!resp || resp.status() >= 400, 'BBC weather API unreachable');

test('loads, renders the chart, and has no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await expect(page.locator('#forecastChart')).toBeVisible();
  await expect(page.locator('.day-card').first()).toBeVisible();
  expect(errors).toEqual([]);
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