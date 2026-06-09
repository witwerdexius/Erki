import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
    test('App lädt und Login-Seite ist sichtbar', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: 'Erlebnis Kirche Planner' })).toBeVisible();
    });

    test('Login-Formular zeigt E-Mail, Passwort und Anmelden-Button', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByPlaceholder('name@beispiel.de')).toBeVisible();
        await expect(page.getByPlaceholder('••••••••')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
    });

    test('Wechsel zu Registrierung zeigt Name-Feld', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Konto erstellen' }).click();
        // "Vor- und Nachname"-Placeholder existiert nur im Register-Formular
        await expect(page.getByPlaceholder('Vor- und Nachname')).toBeVisible();
    });
});
