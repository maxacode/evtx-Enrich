import { test, expect } from '@playwright/test';

// Playwright E2E test for evtx-to-csv
// Note: In a real environment, this would run against the Tauri binary.
// For this mock setup, we assume the frontend is served at http://localhost:1421

test.beforeEach(async ({ page }) => {
  // Mock Tauri IPC before navigation
  await page.addInitScript(() => {
    let reloadCounter = 0;

    const mockInvoke = async (cmd: string, args: any) => {
        if (cmd === 'get_signatures_info') {
            return { count: 120, path: '/mock/signatures.json' };
        }
        if (cmd === 'reload_signatures') {
            reloadCounter++;
            if (reloadCounter === 1) {
                throw "File not found"; // Tauri often throws strings or simple objects
            }
            return { count: 150, path: '/mock/signatures.json' };
        }
        if (cmd === 'select_evtx_files') {
            return ['/mock/file1.evtx', '/mock/file2.evtx', '/mock/file3.evtx'];
        }
        if (cmd === 'get_evtx_summary') {
            return {
                total_records: 100,
                start_time: '2023-01-01T00:00:00Z',
                end_time: '2023-01-01T23:59:59Z',
                event_ids: { '4624': 10 },
            };
        }
        if (cmd === 'select_save_csv') {
            return '/mock/combined.csv';
        }
        if (cmd === 'parse_evtx') {
            return [
              { timestamp: '2023-01-01T00:00:01Z', event_id: 4624, level: 'Info', channel: 'Security', computer: 'PC1', extra_fields: {} },
              { timestamp: '2023-01-01T00:00:02Z', event_id: 4688, level: 'Info', channel: 'Security', computer: 'PC1', extra_fields: {} }
            ];
        }
        if (cmd === 'export_csv') {
            return;
        }
        if (cmd === 'run_enrichment_check') {
            return '# Mock Enrichment Report';
        }
        if (cmd === 'enrich_records') {
          return args.records;
        }
        return;
    };

    (window as any).__TAURI_METADATA__ = {
      __windows: [{ label: 'main' }],
      __currentWindow: { label: 'main' },
    };

    (window as any).__TAURI__ = {
        invoke: mockInvoke,
        transformCallback: (cb: any) => cb,
    };
    
    // Tauri v1 @tauri-apps/api uses window.__TAURI_IPC__
    (window as any).__TAURI_IPC__ = async (message: any) => {
        const { cmd, callback, error, ...payload } = message;
        if (cmd === 'invoke') {
            const { cmd: innerCmd, args } = payload.data;
            try {
                const result = await mockInvoke(innerCmd, args);
                (window as any)[callback](result);
            } catch (e) {
                (window as any)[error](e);
            }
        }
    };
  });

  await page.goto('http://localhost:1421');
});

test('Full app flow: Load, Filter, Export', async ({ page }) => {
  // Verify app is loaded
  await expect(page.locator('h1.app-title')).toContainText('evtx-to-csv');

  // Load a file
  await page.getByRole('button', { name: 'Add Files' }).first().click();
  
  // Wait for the file card to appear (we mocked 3 files)
  const fileCards = page.locator('.file-card');
  await expect(fileCards).toHaveCount(3, { timeout: 10000 });
  await expect(fileCards.first().locator('.file-name')).toHaveText('file1.evtx');

  // Open filters and change something on the first file
  await fileCards.first().getByRole('button', { name: 'Filters' }).click();
  await fileCards.first().getByPlaceholder('Filter by hostname…').fill('TARGET-PC');
  
  // Run Export for the first file
  await fileCards.first().getByRole('button', { name: 'Export CSV', exact: true }).click();

  // Verify success message on the card
  await expect(fileCards.first().locator('.status-success-msg')).toBeVisible();
  await expect(fileCards.first().locator('.status-success-msg')).toContainText('Exported 2 records');
});

test('Combined Export Flow (3 Files)', async ({ page }) => {
  // 1. Add 3 files
  await page.getByRole('button', { name: 'Add Files' }).first().click();
  await expect(page.locator('.file-card')).toHaveCount(3);

  // 2. Click "Export All CSV"
  await page.getByRole('button', { name: 'Export All CSV' }).click();

  // 3. Verify the combined export toast shows the correct count
  // Each file returns 2 records, so 3 * 2 = 6 records.
  const toast = page.locator('.refresh-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Exported 6 records from 3 files');
});

test('Signature Reload Flow (Failure then Success)', async ({ page }) => {
  // 1. Click "Refresh Rules" - first time fails (mocked)
  await page.getByRole('button', { name: 'Refresh Rules' }).click();
  
  // 2. Verify failure toast
  const toast = page.locator('.refresh-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Reload failed: File not found');

  // 3. Click "Refresh Rules" again - second time succeeds
  await page.getByRole('button', { name: 'Refresh Rules' }).click();
  
  // 4. Verify success toast
  await expect(toast).toContainText('Loaded 150 rules');
  
  // 5. Verify rule count in UI
  await expect(page.locator('.sig-status')).toContainText('150 rules active');
});

test('Global Filter Sync resets file status', async ({ page }) => {
  // 1. Add files
  await page.getByRole('button', { name: 'Add Files' }).first().click();
  
  // 2. Mock completing one file
  const fileCards = page.locator('.file-card');
  await fileCards.first().getByRole('button', { name: 'Export CSV', exact: true }).click();
  await expect(fileCards.first().locator('.status-badge')).toContainText('2 records');

  // 3. Open Global Filters
  await page.getByRole('button', { name: 'Global Filters' }).click();
  await page.getByPlaceholder('Filter by hostname…').fill('GLOBAL-PC');

  // 4. Apply to all files
  await page.getByRole('button', { name: 'Apply to All Files (3)' }).click();

  // 5. Verify status badges reset to 'idle'
  // In the UI, 'idle' status means the status badge is hidden.
  await expect(fileCards.first().locator('.status-badge')).not.toBeVisible();
  await expect(fileCards.nth(1).locator('.status-badge')).not.toBeVisible();
  
  // Check that the toast confirms application
  const toast = page.locator('.refresh-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Applied filters to 3 files');
});
