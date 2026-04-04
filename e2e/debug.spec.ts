import { test, expect } from '@playwright/test';

test('debug create room', async ({ page }) => {
	const logs: Array<string> = [];
	page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
	page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

	await page.goto('/');
	await page.waitForSelector('input[placeholder="Tvoje jméno"]', { timeout: 5000 });

	await page.fill('input[placeholder="Tvoje jméno"]', 'TestHost');

	// Check button state before click
	const btn = page.locator('button:has-text("Vytvořit místnost")');
	const isDisabled = await btn.isDisabled();
	console.log('Button disabled before click:', isDisabled);

	await btn.click();

	// Wait a bit and check what happened
	await page.waitForTimeout(3000);

	console.log('Current URL:', page.url());
	console.log('Console logs:', JSON.stringify(logs, null, 2));

	const bodyText = await page.locator('body').textContent();
	console.log('Body text:', bodyText?.substring(0, 500));
});
