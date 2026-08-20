export function forecastResponse(page, postcodePath) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('weather-broker-cdn') &&
      r.url().toLowerCase().includes(postcodePath.toLowerCase()),
    { timeout: 25000 }
  );
}
