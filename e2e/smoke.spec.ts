import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
    test('App lädt und Login-Seite ist sichtbar', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL('/');
        await expect(page.getByText('Erlebnis Kirche Planner')).toBeVisible();
    });

    test('Dark-Mode-Toggle ist vorhanden', async ({ page }) => {
        await page.goto('/');
        const toggle = page.getByRole('button', { name: /Farbschema umschalten/i });
        await expect(toggle).toBeVisible();
    });

    test('Dark-Mode-Toggle wechselt Theme', async ({ page }) => {
        await page.goto('/');
        const toggle = page.getByRole('button', { name: /Farbschema umschalten/i });

        // System-Theme erzwingen, damit wir einen definierten Ausgangszustand haben
        await page.emulateMedia({ colorScheme: 'light' });

        await toggle.click();

        // Nach dem Klick muss das <html>-Element die Klasse "dark" tragen
        await expect(page.locator('html')).toHaveClass(/dark/);
    });
});
