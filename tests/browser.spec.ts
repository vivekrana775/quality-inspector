import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

// page.request shares the browser context's cookie jar, so the page is signed in afterwards.
async function signIn(page: Page) {
  await page.request.post('/api/auth/login', { data: { password: PASSWORD } });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
}

// Filters sit behind a toggle on phones and are always open on desktop.
async function openFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

const recordButton = (page: Page, project: string, machine: string, summary: string) =>
  project === 'desktop'
    ? page.getByRole('button', { name: machine, exact: true })
    : page.getByRole('button', { name: `View ${machine}, ${summary}` });

test('sign in is required and sign out works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await noOverflow(page);
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect password.')).toBeVisible();
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('create, filter, view, resolve and summarize a real inspection', async ({
  page,
}, testInfo) => {
  const machine = `LOOM-${testInfo.project.name}`;
  const uncaught: string[] = [];
  page.on('pageerror', (error) => uncaught.push(error.message));
  await signIn(page);
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
  await expect(page.getByText(/^Inspection #\d+ logged\.$/)).toBeVisible();
  await openFilters(page);
  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByLabel('Status').selectOption('Open');
  await page.getByLabel('From date').fill('2026-09-16');
  await page.getByLabel('To date').fill('2026-09-16');
  await expect(page).toHaveURL(/#inspections\?.*status=Open/);
  await page.getByLabel('Sort by').selectOption('severity');
  await expect(page.getByRole('button', { name: /Sort order: Critical first/ })).toBeVisible();
  await page.getByRole('button', { name: /Sort order: Critical first/ }).click();
  await expect(page.getByRole('button', { name: /Sort order: Minor first/ })).toBeVisible();
  const record = recordButton(page, testInfo.project.name, machine, 'Weave Defect, Critical, Open');
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
  const resolved = recordButton(
    page,
    testInfo.project.name,
    machine,
    'Weave Defect, Critical, Resolved',
  );
  await expect(resolved).toBeVisible();
  // Filters live in the URL, so they survive a reload.
  await page.reload();
  await expect(resolved).toBeVisible();
  await openFilters(page);
  await expect(page.getByLabel('Status')).toHaveValue('Resolved');
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
  await signIn(page);
  await openFilters(page);
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
  await signIn(page);
  await expect(page.getByText('Temporarily unavailable.')).toBeVisible();
  failList = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Temporarily unavailable.')).not.toBeVisible();
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  await page.getByLabel('Machine / line ID').fill('KEEP-MY-INPUT');
  await page.getByLabel('Defect type').selectOption('Other');
  await page.getByLabel('Severity').selectOption('Minor');
  await page.route('**/api/inspections', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Database is locked.' } }),
    }),
  );
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Database is locked.')).toBeVisible();
  await expect(page.getByLabel('Machine / line ID')).toHaveValue('KEEP-MY-INPUT');
  await page.unroute('**/api/inspections');
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quality inspections', exact: true }),
  ).toBeVisible();
});

test('inspections logged offline sync when the connection returns', async ({
  page,
  context,
}, testInfo) => {
  const machine = `OFFLINE-${testInfo.project.name}`;
  await signIn(page);
  await page.getByRole('button', { name: 'Log inspection', exact: true }).click();
  await page.getByLabel('Machine / line ID').fill(machine);
  await page.getByLabel('Defect type').selectOption('Hole/Tear');
  await page.getByLabel('Severity').selectOption('Major');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(
    page.getByText('Saved offline. It will sync when the connection is back.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending sync (1)' })).toBeVisible();
  await expect(page.locator('.pending-list').getByText(machine)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offline' })).toBeDisabled();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('inspection-outbox') ?? '[]').length),
  ).toBe(1);
  await noOverflow(page);
  await context.setOffline(false);
  await expect(page.getByText('1 offline inspection synced.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Pending sync/ })).not.toBeVisible();
  await expect(
    recordButton(page, testInfo.project.name, machine, 'Hole/Tear, Major, Open'),
  ).toBeVisible();
  const { data } = await (await page.request.get('/api/inspections')).json();
  expect(data.filter((row: { machineId: string }) => row.machineId === machine)).toHaveLength(1);
});

test('navigation works with keyboard, notes are not lost to a stray Escape, and long content does not overflow', async ({
  page,
}, testInfo) => {
  const machine = `LONG-${testInfo.project.name}-` + 'W'.repeat(70);
  await signIn(page);
  await page.request.post('/api/inspections', {
    data: {
      date: '2026-09-16',
      machineId: machine,
      defectType: 'Other',
      severity: 'Major',
      remarks: 'W'.repeat(2000),
    },
  });
  const summaryLink = page.getByRole('link', { name: 'Summary', exact: true });
  await summaryLink.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Inspection summary', exact: true }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Inspections', exact: true }).click();
  const record = recordButton(page, testInfo.project.name, machine, 'Other, Major, Open');
  await expect(record).toBeVisible();
  await noOverflow(page);
  await record.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByLabel('Resolution note').fill('Half-written note');
  let keep = true;
  page.on('dialog', (confirm) => (keep ? confirm.dismiss() : confirm.accept()));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Resolution note')).toHaveValue('Half-written note');
  keep = false;
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(record).toBeFocused();
});
