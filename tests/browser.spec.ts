import { test, expect, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('create, filter, view, resolve and summarize a real inspection', async ({
  page,
}, testInfo) => {
  const machine = `LOOM-${testInfo.project.name}`;
  const uncaught: string[] = [];
  page.on('pageerror', (error) => uncaught.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Log inspection', exact: true }).click();
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Enter a machine or line ID.')).toBeVisible();
  await expect(page.getByLabel('Machine / line ID')).toBeFocused();
  await page.getByLabel('Inspection date').fill('2026-09-16');
  await page.getByLabel('Machine / line ID').fill(machine);
  await page.getByLabel('Defect type').selectOption('Weave Defect');
  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByLabel('Remarks').fill('Broken warp threads near the edge.');
  await noOverflow(page);
  await page.screenshot({
    path: `.test-artifacts/${testInfo.project.name}-form.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByLabel('Status').selectOption('Open');
  await page.getByLabel('From date').fill('2026-09-16');
  await page.getByLabel('To date').fill('2026-09-16');
  await page.getByLabel('Sort by').selectOption('severity');
  await expect(page.getByRole('button', { name: /Sort order: Critical first/ })).toBeVisible();
  await page.getByRole('button', { name: /Sort order: Critical first/ }).click();
  await expect(page.getByRole('button', { name: /Sort order: Minor first/ })).toBeVisible();
  const record =
    testInfo.project.name === 'desktop'
      ? page.getByRole('button', { name: machine, exact: true })
      : page.getByRole('button', { name: `View ${machine}, Weave Defect, Critical, Open` });
  await expect(record).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `.test-artifacts/${testInfo.project.name}-register.png`,
    fullPage: true,
  });
  await record.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Broken warp threads near the edge.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close inspection details' })).toBeFocused();
  await page.getByRole('button', { name: 'Mark as resolved' }).click();
  await expect(page.getByText('Add a resolution note before resolving.')).toBeVisible();
  await expect(page.getByLabel('Resolution note')).toBeFocused();
  await page.getByLabel('Resolution note').fill('Replaced guide and checked the next sample.');
  await page.getByRole('button', { name: 'Mark as resolved' }).click();
  await expect(dialog.getByRole('heading', { name: 'Resolution recorded' })).toBeVisible();
  await expect(dialog.getByText('Replaced guide and checked the next sample.')).toBeVisible();
  await page.screenshot({
    path: `.test-artifacts/${testInfo.project.name}-detail.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await page.getByLabel('Status').selectOption('Resolved');
  const resolved =
    testInfo.project.name === 'desktop'
      ? page.getByRole('button', { name: machine, exact: true })
      : page.getByRole('button', { name: `View ${machine}, Weave Defect, Critical, Resolved` });
  await expect(resolved).toBeVisible();
  await page.reload();
  await expect(resolved).toBeVisible();
  await page.getByRole('link', { name: 'Summary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Breakdown by severity' })).toBeVisible();
  await expect(page.getByText('All inspections · All dates')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `.test-artifacts/${testInfo.project.name}-summary.png`,
    fullPage: true,
  });
  expect(uncaught).toEqual([]);
});

test('invalid ranges and no-results filters are clear and reversible', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('From date').fill('2026-09-17');
  await page.getByLabel('To date').fill('2026-09-16');
  await expect(page.getByRole('heading', { name: 'Check your date range' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('From date').fill('2099-01-01');
  await expect(page.getByRole('heading', { name: 'No matching inspections' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'No matching inspections' })).not.toBeVisible();
  await noOverflow(page);
});

test('list failures can be retried and failed saves preserve form input', async ({ page }) => {
  let failList = true;
  await page.route('**/api/inspections?*', (route) =>
    failList
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Temporarily unavailable.' } }),
        })
      : route.continue(),
  );
  await page.goto('/');
  await expect(page.getByText('Temporarily unavailable.')).toBeVisible();
  failList = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Temporarily unavailable.')).not.toBeVisible();
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  await page.getByLabel('Machine / line ID').fill('KEEP-MY-INPUT');
  await page.getByLabel('Defect type').selectOption('Other');
  await page.getByLabel('Severity').selectOption('Minor');
  await page.route('**/api/inspections', (route) => route.abort());
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(
    page.getByText('Cannot reach the server. Check your connection and try again.'),
  ).toBeVisible();
  await expect(page.getByLabel('Machine / line ID')).toHaveValue('KEEP-MY-INPUT');
  await page.unroute('**/api/inspections');
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
});

test('navigation works with keyboard and long content does not overflow', async ({
  page,
  request,
}, testInfo) => {
  const machine = `LONG-${testInfo.project.name}-` + 'W'.repeat(70);
  await request.post('/api/inspections', {
    data: {
      date: '2026-09-16',
      machineId: machine,
      defectType: 'Other',
      severity: 'Major',
      remarks: 'W'.repeat(2000),
    },
  });
  await page.goto('/');
  const summaryLink = page.getByRole('link', { name: 'Summary', exact: true });
  await summaryLink.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Inspection summary', exact: true }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Inspections', exact: true }).click();
  const record =
    testInfo.project.name === 'desktop'
      ? page.getByRole('button', { name: machine, exact: true })
      : page.getByRole('button', { name: `View ${machine}, Other, Major, Open` });
  await expect(record).toBeVisible();
  await noOverflow(page);
  await record.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await noOverflow(page);
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(record).toBeFocused();
});
