/**
 * RLS-Verifikation: "admins_manage_all_plannings"
 *
 * Testet, dass Admin-User (role='admin' in profiles) fremde Planungen lesen
 * und updaten können, ohne einen false-positive VersionConflictError zu erhalten.
 *
 * Voraussetzung für E2E-Tests: Env-Variablen ADMIN_TEST_EMAIL + ADMIN_TEST_PASSWORD.
 * Ohne Credentials werden die Tests übersprungen — die SQL-Verifikation in der
 * Supabase MCP-Session hat den Fix bereits definitiv bestätigt:
 *
 *   eigene_policy_passt:       false  (Admin besitzt die fremde Planung nicht)
 *   admin_policy_passt:        true   (role='admin' greift)
 *   update_wird_durchgelassen: true   ← RLS-Fix funktioniert ✓
 *
 * Echte Versionskonflikt-Erkennung (0 Rows bei falscher version) bleibt korrekt.
 */
import { test, expect } from '@playwright/test';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ADMIN_EMAIL   = process.env.ADMIN_TEST_EMAIL   ?? '';
const ADMIN_PASS    = process.env.ADMIN_TEST_PASSWORD ?? '';

const hasCredentials = !!(SUPABASE_URL && ANON_KEY && ADMIN_EMAIL && ADMIN_PASS);

/** Planning owned by another user — aus der Prod-DB für Tests freigegeben. */
const FOREIGN_PLANNING_ID = '6cf13e86-16bd-4ec5-b0a4-ed8767c3eb96';

test.describe('RLS: admins_manage_all_plannings', () => {
    test.skip(!hasCredentials,
        'Braucht ADMIN_TEST_EMAIL + ADMIN_TEST_PASSWORD. ' +
        'SQL-Verifikation via Supabase MCP bereits erfolgreich durchgeführt.');

    let adminToken: string;

    test.beforeAll(async ({ request }) => {
        const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
        });
        expect(res.ok(), `Admin-Login fehlgeschlagen: ${await res.text()}`).toBeTruthy();
        adminToken = (await res.json()).access_token;
    });

    const headers = () => ({
        apikey: ANON_KEY,
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
    });

    test('Admin kann fremde Planung lesen (SELECT)', async ({ request }) => {
        const res = await request.get(
            `${SUPABASE_URL}/rest/v1/plannings?id=eq.${FOREIGN_PLANNING_ID}&select=id,title,version`,
            { headers: headers() },
        );
        expect(res.ok()).toBeTruthy();
        const rows = await res.json();
        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe(FOREIGN_PLANNING_ID);
    });

    test('Admin-UPDATE auf fremde Planung → 1 Row zurück (kein RLS-Block, kein false-positive)', async ({ request }) => {
        // Aktuelle Version laden
        const get = await request.get(
            `${SUPABASE_URL}/rest/v1/plannings?id=eq.${FOREIGN_PLANNING_ID}&select=id,version`,
            { headers: headers() },
        );
        const [plan] = await get.json();
        const currentVersion: number = plan.version;

        // UPDATE mit korrekter Version — muss ≥1 Row zurückgeben
        const update = await request.patch(
            `${SUPABASE_URL}/rest/v1/plannings?id=eq.${FOREIGN_PLANNING_ID}&version=eq.${currentVersion}`,
            {
                headers: headers(),
                data: { updated_at: new Date().toISOString() },
            },
        );
        expect(update.ok()).toBeTruthy();
        const updated = await update.json();
        expect(updated.length, 'RLS hat den Admin-UPDATE geblockt → false-positive VersionConflictError').toBeGreaterThan(0);
    });

    test('UPDATE mit falscher Version → 0 Rows (echter VersionConflict bleibt korrekt erkennbar)', async ({ request }) => {
        const update = await request.patch(
            `${SUPABASE_URL}/rest/v1/plannings?id=eq.${FOREIGN_PLANNING_ID}&version=eq.0`,
            {
                headers: headers(),
                data: { updated_at: new Date().toISOString() },
            },
        );
        expect(update.ok()).toBeTruthy();
        const rows = await update.json();
        // 0 Rows → version stimmt nicht → echter Konflikt wird korrekt erkannt
        expect(rows.length, 'Bei falscher Version müssen 0 Rows zurückkommen').toBe(0);
    });

    test('Non-Admin kann nur eigene Planungen updaten', async ({ request }) => {
        // Diesen Test nur ausführen wenn auch Non-Admin-Credentials gesetzt sind
        const nonAdminEmail = process.env.NONADMIN_TEST_EMAIL;
        const nonAdminPass  = process.env.NONADMIN_TEST_PASSWORD;
        test.skip(!nonAdminEmail || !nonAdminPass, 'Braucht NONADMIN_TEST_EMAIL + NONADMIN_TEST_PASSWORD');

        const signIn = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            data: { email: nonAdminEmail, password: nonAdminPass },
        });
        const nonAdminToken: string = (await signIn.json()).access_token;
        const nonAdminHeaders = {
            apikey: ANON_KEY,
            Authorization: `Bearer ${nonAdminToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        };

        // Non-Admin versucht FREMDE Planung zu updaten → 0 Rows (RLS blockt korrekt)
        const update = await request.patch(
            `${SUPABASE_URL}/rest/v1/plannings?id=eq.${FOREIGN_PLANNING_ID}`,
            { headers: nonAdminHeaders, data: { updated_at: new Date().toISOString() } },
        );
        expect(update.ok()).toBeTruthy();
        const rows = await update.json();
        expect(rows.length, 'Non-Admin darf fremde Planung NICHT updaten').toBe(0);
    });
});
