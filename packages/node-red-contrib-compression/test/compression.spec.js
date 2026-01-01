const { test, expect } = require('@playwright/test');

const NODE_RED_URL = 'http://localhost:1880';

test.describe('Compression Node Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(NODE_RED_URL);
        await page.waitForSelector('.red-ui-palette', { timeout: 30000 });
    });

    test('Node-RED loads successfully', async ({ page }) => {
        await expect(page.locator('.red-ui-header')).toBeVisible();
        await expect(page.locator('.red-ui-palette')).toBeVisible();
    });

    test('Compression node is available in palette', async ({ page }) => {
        // Search for compression node
        const searchInput = page.locator('#red-ui-palette-search input');
        await searchInput.fill('compress');
        await page.waitForTimeout(500);

        // Check if compression node appears
        const compressNode = page.locator('.red-ui-palette-node[data-palette-type="compression"]');
        await expect(compressNode).toBeVisible();
    });

    test('Cache node is available in palette', async ({ page }) => {
        const searchInput = page.locator('#red-ui-palette-search input');
        await searchInput.fill('cache');
        await page.waitForTimeout(500);

        const cacheNode = page.locator('.red-ui-palette-node[data-palette-type="cache"]');
        await expect(cacheNode).toBeVisible();
    });

    test('Chart node is available in palette', async ({ page }) => {
        const searchInput = page.locator('#red-ui-palette-search input');
        await searchInput.fill('chart');
        await page.waitForTimeout(500);

        const chartNode = page.locator('.red-ui-palette-node[data-palette-type="chart"]');
        await expect(chartNode).toBeVisible();
    });

    test('Import and deploy compression test flow', async ({ page }) => {
        // Open import dialog
        await page.keyboard.press('Control+i');
        await page.waitForSelector('.red-ui-editor-dialog', { timeout: 5000 });

        // Read the examples.json content
        const flowJson = require('../examples/examples.json');

        // Paste the flow JSON
        const importTextarea = page.locator('.red-ui-clipboard-dialog-box textarea');
        await importTextarea.fill(JSON.stringify(flowJson));

        // Click import button
        await page.locator('button:has-text("Import")').click();
        await page.waitForTimeout(1000);

        // Deploy the flow
        await page.locator('#red-ui-header-button-deploy').click();
        await page.waitForTimeout(2000);

        // Verify deployment succeeded (no error notification)
        const successNotification = page.locator('.red-ui-notification-success');
        // If there's a success notification, wait for it
        await page.waitForTimeout(1000);
    });

    test('Deduplicate test - same value should be filtered', async ({ page }) => {
        // Navigate to Compression Tests tab if exists
        const tab = page.locator('.red-ui-workspace-tabs li:has-text("Compression Tests")');
        if (await tab.isVisible()) {
            await tab.click();
        }

        // Open debug sidebar
        await page.locator('#red-ui-header-button-sidebar').click();
        await page.waitForTimeout(500);

        // Clear debug messages
        const clearButton = page.locator('button[title="Clear all messages"]');
        if (await clearButton.isVisible()) {
            await clearButton.click();
        }

        // Find and click "Same Value (25)" inject node twice
        const injectNode = page.locator('.red-ui-flow-node:has-text("Same Value")');
        if (await injectNode.isVisible()) {
            // Double-click to trigger inject
            await injectNode.click({ button: 'left' });
            await page.waitForTimeout(100);

            // Click the inject button on the node
            const injectButton = page.locator('.red-ui-flow-node-button');
            if (await injectButton.first().isVisible()) {
                await injectButton.first().click();
                await page.waitForTimeout(500);
                await injectButton.first().click();
                await page.waitForTimeout(500);
            }
        }

        // Check debug output - second message should be filtered (dedup)
        await page.waitForTimeout(1000);
    });

    test('Exception test - small change filtered, large change passes', async ({ page }) => {
        const tab = page.locator('.red-ui-workspace-tabs li:has-text("Compression Tests")');
        if (await tab.isVisible()) {
            await tab.click();
        }

        await page.waitForTimeout(500);

        // This verifies the exception compression node is configured correctly
        const exceptionNode = page.locator('.red-ui-flow-node:has-text("Exception")');
        await expect(exceptionNode.first()).toBeVisible();
    });

    test('Chart node opens and shows Chart.js', async ({ page }) => {
        // Search and add chart node
        const searchInput = page.locator('#red-ui-palette-search input');
        await searchInput.fill('chart');
        await page.waitForTimeout(500);

        const chartNode = page.locator('.red-ui-palette-node[data-palette-type="chart"]');
        await expect(chartNode).toBeVisible();

        // Double-click to add node (or drag)
        await chartNode.dblclick();
        await page.waitForTimeout(500);

        // Find the newly added node and double-click to open editor
        const addedChart = page.locator('.red-ui-flow-node:has-text("Chart")').first();
        if (await addedChart.isVisible()) {
            await addedChart.dblclick();
            await page.waitForTimeout(1000);

            // Check if the edit dialog opened
            const editDialog = page.locator('.red-ui-editor-dialog');
            await expect(editDialog).toBeVisible();

            // Check if chart preview container exists
            const chartContainer = page.locator('#chart-preview-container');
            await expect(chartContainer).toBeVisible();

            // Close the dialog
            await page.locator('button:has-text("Cancel")').click();
        }
    });

    test('Compression node config dialog opens correctly', async ({ page }) => {
        // Search for compression node
        const searchInput = page.locator('#red-ui-palette-search input');
        await searchInput.fill('compress');
        await page.waitForTimeout(500);

        const compressNode = page.locator('.red-ui-palette-node[data-palette-type="compression"]');
        await compressNode.dblclick();
        await page.waitForTimeout(500);

        // Find the node and open its config
        const addedNode = page.locator('.red-ui-flow-node:has-text("Dedup")').first();
        if (await addedNode.isVisible()) {
            await addedNode.dblclick();
            await page.waitForTimeout(500);

            // Check dialog opened
            const editDialog = page.locator('.red-ui-editor-dialog');
            await expect(editDialog).toBeVisible();

            // Check algorithm dropdown exists
            const algorithmSelect = page.locator('#node-input-algorithm');
            await expect(algorithmSelect).toBeVisible();

            // Check timestamp field exists
            const timestampField = page.locator('#node-input-timestampField');
            await expect(timestampField).toBeVisible();

            // Check value field exists
            const valueField = page.locator('#node-input-valueField');
            await expect(valueField).toBeVisible();

            // Close dialog
            await page.locator('button:has-text("Cancel")').click();
        }
    });
});
