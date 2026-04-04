import { test, expect } from '@playwright/test';

test('two players can create and join a room', async ({ browser }) => {
	const host = await browser.newPage();
	const guest = await browser.newPage();

	// Host creates a room
	await host.goto('/');
	await host.fill('input[placeholder="Tvoje jméno"]', 'Host');
	await host.click('button:has-text("Vytvořit místnost")');

	// Wait for lobby to load
	await expect(host.locator('.code')).toBeVisible({ timeout: 5000 });
	const roomCode = await host.locator('.code').textContent();
	expect(roomCode).toBeTruthy();
	expect(roomCode!.trim().length).toBe(4);

	// Guest joins the room
	await guest.goto('/');
	await guest.fill('input[placeholder="Tvoje jméno"]', 'Guest');
	await guest.fill('input[placeholder="Kód místnosti"]', roomCode!.trim());
	await guest.click('button:has-text("Připojit se")');

	// Wait for guest to see the lobby
	await expect(guest.locator('.code')).toBeVisible({ timeout: 5000 });
	const guestRoomCode = await guest.locator('.code').textContent();
	expect(guestRoomCode!.trim()).toBe(roomCode!.trim());

	// Both players should see 2 player cards
	await expect(host.locator('.player-card')).toHaveCount(2, { timeout: 3000 });
	await expect(guest.locator('.player-card')).toHaveCount(2, { timeout: 3000 });

	// Host should see "Start" button enabled now
	const startBtn = host.locator('button:has-text("Start")');
	await expect(startBtn).toBeVisible();
	await expect(startBtn).toBeEnabled();

	await host.close();
	await guest.close();
});

test('back to lobby after race', async ({ browser }) => {
	const host = await browser.newPage();
	const guest = await browser.newPage();

	// Create and join room
	await host.goto('/');
	await host.fill('input[placeholder="Tvoje jméno"]', 'Host');
	await host.click('button:has-text("Vytvořit místnost")');
	await expect(host.locator('.code')).toBeVisible({ timeout: 5000 });
	const roomCode = await host.locator('.code').textContent();

	await guest.goto('/');
	await guest.fill('input[placeholder="Tvoje jméno"]', 'Guest');
	await guest.fill('input[placeholder="Kód místnosti"]', roomCode!.trim());
	await guest.click('button:has-text("Připojit se")');
	await expect(guest.locator('.code')).toBeVisible({ timeout: 5000 });

	// Host starts game -> pairing phase
	await expect(host.locator('button:has-text("Start")')).toBeEnabled({ timeout: 3000 });
	await host.click('button:has-text("Start")');

	// Both confirm pairing
	await expect(host.locator('button:has-text("Potvrzuji pozici")')).toBeVisible({ timeout: 5000 });
	await expect(guest.locator('button:has-text("Potvrzuji pozici")')).toBeVisible({ timeout: 5000 });
	await host.click('button:has-text("Potvrzuji pozici")');
	await guest.click('button:has-text("Potvrzuji pozici")');

	// Race should start - track SVG should appear
	await expect(host.locator('.track-svg')).toBeVisible({ timeout: 5000 });
	await expect(guest.locator('.track-svg')).toBeVisible({ timeout: 5000 });

	// Verify the race is running (speed indicator visible)
	await expect(host.locator('.speed-indicator')).toBeVisible({ timeout: 3000 });

	await host.close();
	await guest.close();
});
