# Refactoring-Handover — ErKi v0.7.153+

Stand: 2026-05-07. Schreibt eine Handover-Notiz für die nächste Person/Session, die die Refactoring-Wellen 4 und 5 fortführt.

## TL;DR

Die Codebasis wurde in zwei Sessions strukturiert verbessert: **Wellen 0–3 sind komplett, Welle 4 ist zu 1/4, Welle 5 ist zu 1/4**. Insgesamt 23 Commits, 66 Tests laufen grün, Reliability auf A, Coverage messbar (32 % Branch in `lib/`). Hauptaufgaben offen: ErkiApp.tsx weiter dekomponieren (Welle 4-2/4 bis 4-4/4), Multi-User-Härtung in DB+UI (Welle 5-2/4 bis 5-4/4).

## Aktueller Stand der Codebasis

| | Stand |
|---|---|
| **Commit** | `24b0899` auf `main` |
| **Tests** | 66 (grün), 7 Test-Files |
| **Coverage** | 32 % Branch / 12,9 % Lines (Sonar-Scope: gesamtes `lib/`+`components/`+`app/`) |
| **TS** | clean (`npx tsc --noEmit`) |
| **Build** | `npm run build` erfolgreich (Dummy-Env-Vars für CI) |
| **Sonar Reliability** | A · Security: A · Maintainability: A |
| **Bugs** | 0 |
| **Security Hotspots** | 3 (alle DoS-Regex, Code ist gefixt, brauchen "Reviewed/Safe"-Markierung in Sonar) |
| **Cognitive Complexity total** | 1.097 (war 1.160 trotz +1.012 LOC) |

**Working tree clean. Keine offenen Worktrees. Kein lokaler Sonar-Container.**

## Was die Wellen 0-3 + 4(1/4) + 5(1/4) geliefert haben

### Welle 0 — Cosmetic (`1246eff`)
- ESLint-Auto-Fix
- `.scannerwork/` in `.gitignore`

### Welle 1 — Bug-Fixes (`bd60e9a`, `93ff593`)
- 11× a11y (S1082): `<div onClick>` → `role="button"` + `onKeyDown` in PlanningHistory, OnboardingModal, ExplanationPage, ErkiApp:1400, AdminPanel, TemplatePickerDialog
- 4× Regex-Präzedenz (S5850): `^-+|-+$` → `(?:^-+)|(?:-+$)` in slugify.ts:8, pdfExport.ts (zwei Stellen, jetzt im `sanitizeTitle`-Helper konsolidiert), ErkiApp.tsx:2104

### Welle 2a — Schema (`42e33ba`, `820a5b3`)
- Migration-Timestamp-Kollision aufgelöst (`20260427000003_planning_snapshots.sql` → `…000006_…`)
- ⚠️ **Schema-Dump weiterhin offen** — siehe Blocker

### Welle 2b — Tests (`99a5b75`, `9d188ac`, `820cbc9`, `24b0899`)
- Vitest 4.1.5 + `@vitest/coverage-v8` eingerichtet
- 31 Tests: `slugify` (13), `scraper` (1 Smoke), `dbConverters` (17 — hierfür Konverter exportiert)
- Coverage-Pipeline mit lcov-Report → Sonar

### Welle 2c — Zod + Auth (`0f9c188`, `c7992c1`, `7bc2ecf`, `ebb19d2`)
- 11 Zod-Schemas in `lib/api/validation.ts`
- `requireAdmin` Auth-Helper in `lib/api/auth.ts`
- 10 API-Routes hardened
- 🚨 **Kritischer Befund:** `/api/admin/delete-user` hatte vor diesem Refactor **keine Auth** — geschlossen

### Welle 3 — pdfExport-Decomposition (`a970b4c`, `7c1643f`, `705375b`)
- 3 Funktionen mit CC ≥ 30 zerlegt (max 71 → 6 für `exportLageplanPDF`)
- Pure Helpers extrahiert: `sanitizeTitle`, `simulateLines`, `pickFontSize`, `computePdfImagePlacement`, `breakWordWithHyphenation`, `wrapTableParagraph`, `appendHyphenatedWord`, `loadHyphenator`, `drawTableHeader`, `buildTableBody` etc.
- 17 Unit-Tests
- Public API unverändert (`exportLageplanPDF`, `exportTablePDF`)

### Welle 4 (1/4) — BubbleLayoutMath (`3da7707`, `366b6c6`)
- Slot-Positioning-Algorithmus aus ErkiApp.tsx in `lib/bubbleLayoutMath.ts` extrahiert
- 234 Zeilen aus dem Monolithen raus (2128 → ~1894)
- Public API: `computeBubbleSlots(input)` + Helpers (`projectMarkerToPerimeter`, `sToPoint`, `segmentsCross`, `wrap`)
- 10 Unit-Tests, 92 % Coverage auf dem neuen Modul
- Verhalten identisch zum Original

### Welle 5 (1/4) — Realtime-Hooks (`f779bbd`, `92645e1`, `75e6ab6`, `f741b84`)
- `lib/realtime/usePresence.ts` (107 LOC) — wer ist online auf einem Channel
- `lib/realtime/useBroadcast.ts` (97 LOC) — Pub/Sub ohne DB-Roundtrip
- 8 Tests (pure Helper `flattenPresenceState` + Smoke)
- ⚠️ **Noch nicht in UI verdrahtet** — kommt nach Welle 4-2/4

## Offene Wellen — was als Nächstes ansteht

### Welle 4 (2/4) — useRealtimeSync extrahieren

**Scope:** `components/ErkiApp.tsx` Zeilen ~540-647 (zwei `useEffect`-Blöcke mit Postgres-CDC-Subscriptions auf `plannings` und `stations`).

**Output:** neues Modul `lib/realtime/useRealtimeSync.ts` mit Hook `useRealtimeSync(planId, callbacks)`.

**Aufwand:** 1 Session, ~1 Tag.

**Risiko:** mittel — der Hook ist tightly coupled mit `latestPlanRef`/`isDirtyRef`/`activeTabRef`. Die Refs müssen in der Public API sauber durchgereicht werden, sonst geht der Echo-Schutz verloren.

**Verifikation:** Es existieren keine UI-Tests für ErkiApp. Manuelle Verifikation via 2 Browser-Tabs öffnen + parallel editieren ist Pflicht.

### Welle 4 (3/4) — MapView extrahieren

**Scope:** Den Lageplan-Tab als eigene Komponente `components/erki/MapView.tsx`. Inklusive Drag-Drop, Bubble-Rendering, Connection-Lines.

**Aufwand:** 1–2 Sessions, weil komplex.

**Risiko:** mittel-hoch.

### Welle 4 (4/4) — StationsTable extrahieren

**Scope:** Den Tabellen-Tab als eigene Komponente `components/erki/StationsTable.tsx`. Inklusive contentEditable-Logik mit Echo-Schutz.

**Aufwand:** 1 Session.

**Risiko:** mittel.

### Welle 5 (2/4) — Optimistic Locking + version-Spalte

**Scope:**
1. Neue Migration `supabase/migrations/<timestamp>_plannings_version.sql` mit `version int NOT NULL DEFAULT 0` auf `plannings`.
2. `lib/db.ts` `savePlanning()` mit `If-Match`-Vergleich umbauen — bei Mismatch: throw, UI zeigt Toast "Planung wurde extern geändert".
3. Trigger oder Function um `version` bei jedem UPDATE zu inkrementieren.

**Blocker:** Migration muss durch Kollegen mit Cloud-Zugang appliziert werden (`supabase db push`).

**Aufwand:** 0,5 Session Code, 5 Min beim Kollegen.

**Risiko:** niedrig (additiv).

### Welle 5 (3/4) — Field-Level plannings-Updates

**Scope:** `savePlanning()` aktuell macht ein Full-Row-UPDATE auf `plannings`. Das überschreibt parallel-editierte Felder (z. B. wenn A den Titel ändert während B `bg_zoom` ändert). Lösung: Diff zwischen `previousPlan` und `nextPlan` berechnen, nur geänderte Spalten patchen.

**Aufwand:** 1 Session.

**Risiko:** mittel — Diff-Logik muss alle nullable Felder korrekt behandeln.

### Welle 5 (4/4) — UI-Wiring

**Scope:**
1. `usePresence` und `useBroadcast` aus Welle 5-1/4 in MapView/StationsTable einbinden
2. Anzeige "Anna ist online", "Tim editiert Station 3"
3. Auto-Save-Debounce auf 300 ms reduzieren bei Idle
4. Optimistic-Locking-Toast bei Konflikt

**Aufwand:** 1–2 Sessions.

**Voraussetzung:** Welle 4-3/4 + 4-4/4 fertig (sonst ist die UI noch monolithisch).

## Bekannte Blocker

### 1. Schema-Dump (Welle 2a) — wartet auf Kollegen

Das Repo hat keine `CREATE TABLE`-Statements für die Basis-Tabellen (`plannings`, `stations`, `profiles`, `communities`, `templates`). Die wurden historisch direkt in Supabase Studio angelegt.

**Anleitung:** [supabase/README.md](../supabase/README.md). Der Kollege braucht `supabase login` (Browser) + `supabase link --project-ref <ref>` + `supabase db dump --schema-only -f supabase/schema.sql`.

**Auswirkung:** Bis das passiert, ist das Repo nicht reproduzierbar. Welle 5-2/4 (Migration für `version`-Spalte) sollte erst nach dem Schema-Dump fließen, damit die Reference-Snapshot konsistent ist.

### 2. npm-Vulnerabilities

`npm audit` zeigt aktuell 1 moderate + 1 high. Beide vermutlich transitiv. Vor Production-Deploy `npm audit fix` (ohne `--force`) prüfen, dann ggf. dependent updaten.

### 3. Sonar-Hotspots-Markierung

3 DoS-Regex-Hotspots werden weiterhin gemeldet, obwohl der Code in Welle 1b korrekt entschärft wurde. Sonar erkennt das nicht automatisch. Wenn das stört: API-Call zur "Reviewed/Safe"-Markierung pro Hotspot — siehe `.agent/skills/sonar-audit/SKILL.md` für die Endpoints.

## Tools-Setup für Folge-Sessions

```bash
# Vorhanden + erprobt:
- Node 20+, npm
- Vitest 4.1.5 + @vitest/coverage-v8
- TypeScript strict
- Supabase CLI (brew install supabase/tap/supabase) — nicht authed!
- Docker (für SonarQube-Audits)
- sonar-scanner (Homebrew)

# Wichtige NPM-Scripts:
npm test                 # Unit-Tests
npm run test:watch       # Live-Tests
npm run test:coverage    # Tests + lcov-Report für Sonar
npm run build            # Produktions-Build
npm run lint             # ESLint

# Build mit Dummy-Env (z. B. für CI):
NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
SUPABASE_SERVICE_ROLE_KEY=dummy \
npm run build
```

## Sonar-Audit reproduzieren

Komplette Anleitung: [`.agent/skills/sonar-audit/SKILL.md`](../.agent/skills/sonar-audit/SKILL.md).

Quick-Start:
```bash
docker run -d --name kirche-kunterbunt-sonarqube \
  -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:community
# 60-120s warten, dann Token via API holen (kein Browser!)
# coverage: npm run test:coverage
# scan:     sonar-scanner -Dsonar.token=...
# stop:     docker stop kirche-kunterbunt-sonarqube && docker rm ...
```

## Wichtige Architektur-Entscheidungen aus den Sessions

1. **Multi-User-Strategie:** Supabase Realtime ist bereits da (Postgres CDC). Kein WebSocket-Eigenbau, kein CRDT (Yjs) — die App ist strukturiert-tabellarisch, nicht doc-zentriert. Stattdessen: Presence + Broadcast + Optimistic Locking (siehe Welle 5).

2. **Backend-Stack:** Bleibt Next.js + Supabase. Kein FastAPI-Port — die wenigen API-Routes machen banale Dinge, wo Sprachwechsel nichts gewinnt. Pydantic-Äquivalent ist Zod (Welle 2c).

3. **ORM/Migrations:** Supabase CLI ist die richtige Antwort, nicht Alembic (Python) oder Drizzle (würde zu viel umstellen). Schema-Dump als Reference + forward-only-Migrations.

4. **Test-Strategie:** Pure Functions zuerst (Welle 2b). Component/UI-Tests werden erst sinnvoll **nach** Welle 4-Decomposition — vorher ist ErkiApp.tsx zu monolithisch.

5. **Subagent-Pattern:** Worktrees mit disjunkten File-Sets erlauben echte Parallelisierung. Welle 4-Sub-Tasks sind aber NICHT parallelisierbar, weil alle ErkiApp.tsx anfassen — sequenziell, je eigene Session.

## Letzte 25 Commits (in umgekehrter chronologischer Reihenfolge)

```
24b0899 fix(test): localeCompare in sort-Aufrufen (Sonar S2871)
22f4c92 chore: Lockfile-Resync nach Welle-3+4+5-Merge
366b6c6 test: Unit-Tests für computeBubbleSlots (Welle 4 — 1/4)
3da7707 refactor(layout): BubbleLayoutMath in eigenes Modul extrahiert (Welle 4 — 1/4)
f779bbd merge: Welle 5 (1/4) — usePresence + useBroadcast Realtime-Hooks
a970b4c merge: Welle 3 — pdfExport-Refactor (CC≥30 Funktionen zerlegt)
f741b84 test: Unit-Tests für realtime-Hooks (Welle 5 — 1/4)
75e6ab6 feat(realtime): useBroadcast-Hook für Pub/Sub-Nachrichten (Welle 5 — 1/4)
92645e1 feat(realtime): usePresence-Hook für Online-Status (Welle 5 — 1/4)
705375b test: Unit-Tests für pure Helpers in pdfExport (Welle 3)
7c1643f refactor(pdfExport): drei Funktionen mit CC>=30 in private Helpers zerlegt (Welle 3)
820cbc9 test: Coverage-Pipeline mit lcov-Report für Sonar
21978e4 chore: sonar-project.properties und Lockfile-Resync
820a5b3 docs(supabase): Anleitung Schema-Dump für Kollegen (Welle 2a)
9d188ac test: DB-Konverter exportiert und getestet (Welle 2b)
0f9c188 merge: Welle 2c — Zod-Validierung + requireAdmin Auth-Helper
99a5b75 merge: Welle 2b — Vitest-Setup + Tests für Pure Functions
42e33ba merge: Welle 2a — Migration-Timestamp-Fix
1246eff merge: Welle 0+1 — ESLint auto-fix, a11y bugs, Regex-Härtung
ebb19d2 refactor(api): Validierung und Auth-Helper auf alle Routes angewendet (Welle 2c)
93ff593 fix(regex): explizite Operator-Präzedenz und ReDoS-Härtung in slugify (Welle 1b)
06b262c test: Smoke-Test für scraper (Welle 2b)
7bc2ecf refactor(api): requireAdmin Auth-Helper extrahiert (Welle 2c)
bd60e9a fix(a11y): Tastatur-Support für klickbare Elemente (Welle 1a)
c7992c1 feat(api): Zod-Schemas für Request-Validierung (Welle 2c)
```

## Kontaktpunkte / Verantwortlichkeiten

- **Schema-Dump in Cloud:** Kollege mit Supabase-Login (Axel hat keinen Cloud-Zugang)
- **Migrations-Apply:** ebenfalls Kollege
- **PDF-Export visuelle QA:** manuell durch Nutzer (Welle 3 hat keine Visual-Snapshots, nur Pure-Helper-Tests)
- **Multi-User-Verifikation (Welle 5):** Manuelles Testing mit 2 Browser-Tabs als Pflicht-Schritt vor Merge
