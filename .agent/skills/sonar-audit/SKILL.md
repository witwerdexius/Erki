---
name: sonar-audit
description: Static-quality audit via SonarQube (lokaler Docker-Container, headless), Bilanz-Diff, Wellen-Planung und parallele Refactoring-Ausführung via Subagents in Worktrees.
allowed-tools: Bash, Read, Edit, Write, Agent, Glob, Grep
---

# Sonar Audit & Refactoring-Wellen

Reproduzierbarer Ablauf, um eine Codebasis statisch zu vermessen, Findings nach Pareto zu priorisieren, und in disjunkten Wellen via Subagents zurückzubauen — ohne Browser, ohne Cloud-Account.

## Wann dieser Skill triggert

- "mach einen Sonar-Scan", "Code-Quality-Audit", "wie steht's um die Tech-Schuld"
- "wo lohnt sich Refactoring", "wo sind die Hotspots im Code"
- Folge-Audit nach abgeschlossener Welle ("nochmal scannen")
- Bevor größere Architektur-Eingriffe geplant werden

**Nicht triggern**, wenn der Nutzer nur ein einzelnes Issue beheben will — dann direkt fixen.

## Voraussetzungen prüfen

```bash
which sonar-scanner   # ggf. brew install sonar-scanner
docker ps             # Docker muss laufen
lsof -i :9000         # Port 9000 frei?
```

## Workflow — sieben Schritte

### 1. Disposable SonarQube starten

```bash
docker run -d --name <projekt>-sonarqube \
  -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:community
```

Warten bis ready (60–120 s, im Hintergrund pollen):
```bash
until curl -sf http://localhost:9000/api/system/status 2>/dev/null \
  | grep -q '"status":"UP"'; do sleep 5; done
```

### 2. Admin-Passwort + Token via API (kein Browser!)

```bash
SONAR_PW='<Wegwerf-PW>'
curl -sf -u admin:admin -X POST "http://localhost:9000/api/users/change_password" \
  --data-urlencode "login=admin" \
  --data-urlencode "previousPassword=admin" \
  --data-urlencode "password=${SONAR_PW}"

TOKEN=$(curl -sf -u admin:${SONAR_PW} -X POST \
  "http://localhost:9000/api/user_tokens/generate" \
  --data-urlencode "name=scan-$(date +%s)" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### 3. `sonar-project.properties` (falls fehlt)

Stack-passende Defaults, Excludes, Coverage-Pfad:

```properties
sonar.projectKey=<project-name>
sonar.projectName=<Display Name>
sonar.projectVersion=<version>

sonar.host.url=http://localhost:9000

sonar.sources=app,components,lib,types,supabase
sonar.exclusions=**/node_modules/**,**/.next/**,**/build/**,**/out/**,**/coverage/**,**/*.min.js,public/**,package-lock.json,**/.agent/**

sonar.sourceEncoding=UTF-8
sonar.typescript.tsconfigPath=tsconfig.json
sonar.javascript.environments=node,browser
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

### 4. Coverage-Report generieren (falls Tests vorhanden)

Vitest-Setup als Beispiel:
```bash
npm run test:coverage   # erzeugt coverage/lcov.info
```

(Wenn nicht vorhanden: `@vitest/coverage-v8` als devDep, Reporter `['text','lcov']` in `vitest.config.ts`.)

### 5. Scan ausführen

```bash
sonar-scanner -Dsonar.token=${TOKEN}
# Output enthält: ANALYSIS SUCCESSFUL ... task?id=<UUID>
```

Auf Verarbeitung warten:
```bash
until [ "$(curl -sf -u ${TOKEN}: \
  "http://localhost:9000/api/ce/task?id=${TASK_ID}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["task"]["status"])')" = "SUCCESS" ]; do
  sleep 1
done
```

### 6. Metriken & Findings via API ziehen

**Kernmetriken:**
```bash
curl -sf -u ${TOKEN}: "http://localhost:9000/api/measures/component?\
component=${PROJECT_KEY}&\
metricKeys=ncloc,bugs,vulnerabilities,security_hotspots,code_smells,coverage,\
line_coverage,branch_coverage,sqale_index,reliability_rating,security_rating,\
sqale_rating,files,cognitive_complexity,duplicated_lines_density"
```

**Issues nach Severity/Type/File:**
```bash
curl -sf -u ${TOKEN}: "http://localhost:9000/api/issues/search?\
componentKeys=${PROJECT_KEY}&resolved=false&\
facets=severities,types,rules,files&ps=1"
```

**Hotspots:**
```bash
curl -sf -u ${TOKEN}: "http://localhost:9000/api/hotspots/search?\
projectKey=${PROJECT_KEY}&ps=10"
```

### 7. Container abräumen

```bash
docker stop <projekt>-sonarqube && docker rm <projekt>-sonarqube
```

## Findings priorisieren — Pareto-Regel

| Frage | Worauf achten |
|---|---|
| Welche Files sind die Hotspots? | Top 3-5 Files mit ≥ 25 % der Issues |
| Welche Funktionen sind Refactor-Kandidaten? | `cognitive_complexity` per Funktion > 30 (CRITICAL) |
| Was ist Lärm vs. Substanz? | a11y/Stil-Smells = Quick-Wins; Cognitive Complexity = strukturelles Signal |
| Was ist Sicherheits-Realität vs. Sonar-Pessimismus? | Hotspots auf user-input-facing Code (z. B. Slugify) ernster nehmen als auf interne Pfade |

## Welle-Planung — Schablone

Wellen sortiert nach **Risiko ↑ Effekt ↓**:

| Welle | Inhalt | Risiko | Aufwand |
|---|---|---|---|
| **0** | `eslint --fix`, dead stores, unused imports | sehr niedrig | ½ Tag |
| **1** | a11y-Bugs (S1082), Regex-Härtung (S5850), ReDoS-Hotspots (slugify) | niedrig | 2–3 Tage |
| **2** | Foundation: Schema-Dump, Vitest-Setup, Tests für pure Functions, Zod auf API-Routes | niedrig | 1–2 Wochen |
| **3** | Funktionen mit CC > 30 zerlegen | mittel | 1 Woche/File |
| **4** | Monolithen-Komponenten dekomponieren | mittel-hoch | 2–3 Wochen, mehrere Sessions |
| **5** | Multi-User/Concurrency, Optimistic Locking, Presence | mittel | 2–3 Wochen |

## Parallele Ausführung via Subagents

### Goldene Regel: **disjunkte File-Sets**

Subagents in Worktrees können parallel laufen, **wenn** sie keine gemeinsamen Dateien anfassen. Vor dem Spawnen prüfen:
- Welche Files modifiziert jeder Agent?
- Welche `package.json`-Felder ändert jeder Agent? (typische Konfliktquelle)
- `.gitignore`-Anpassungen: nur **ein** Agent darf das

### Spawn-Template

```
Agent({
  description: "Welle X — <kurz>",
  subagent_type: "general-purpose",
  isolation: "worktree",
  prompt: `<self-contained briefing>
- Project context (1-3 sentences)
- npm install first (worktree starts ohne node_modules)
- Exact file scope + line numbers
- Constraints: don't touch other agents' files
- Verification: tsc, npm test, npm run build
- Commit messages in DE/EN per repo convention
- Report back: branch name, files changed, verification status
`
})
```

### Merge-Strategie

1. **Reihenfolge:** kleinste/sauberste zuerst, konfliktreichste zuletzt
2. **Erwartete Konflikte** dokumentieren bevor man merged
3. Bei `package.json`-Konflikt: `git checkout --ours` und `npm install`-Resync
4. Bei alten worktrees (vom älteren `main` gebranched): cherry-pick statt merge, um nichts zurückzurollen
5. Worktrees danach abräumen: `git worktree remove -f -f <pfad>` + `git branch -D <branch>`

## Häufige Sonar-Regeln und Fixes

| Rule | Bedeutung | Fix |
|---|---|---|
| **S1082** | `<div onClick>` ohne Keyboard-Listener | Zu `<button type="button">` ODER `role="button" tabIndex={0} onKeyDown={...}` |
| **S5850** | Mehrdeutige Regex-Operator-Präzedenz | Explizite Gruppierung mit `(?:...)`, z. B. `^-+\|-+$` → `(?:^-+)\|(?:-+$)` |
| **S2871** | `Array.sort()` ohne Compare-Function | Bei Strings: `.sort((a,b) => a.localeCompare(b))` |
| **S3776** | Cognitive Complexity > 15 | Funktion in private Helper zerlegen, max 4 Verschachtelungs-Ebenen |
| **S2004** | Funktionen > 4 Ebenen verschachtelt | Helper extrahieren oder Early-Returns |
| **S1854** | Dead store (Variable beschrieben, nie gelesen) | Entfernen — meist `eslint --fix` |
| **S1128** | Unused import | Entfernen — `eslint --fix` |
| **S4325** | Redundante Type-Assertion | Entfernen |
| **DoS-Hotspot Regex** | Mögliche super-lineare Backtracking | Nested Quantifier vermeiden, Alternationen disjunkt halten, Anker setzen |

## Bilanz-Format (für Vergleichsläufe)

Nach jedem Lauf eine Tabelle pflegen:

| Metrik | Lauf 1 | Lauf 2 | … | Δ vs. Start |
|---|---:|---:|---:|---|
| Bugs | | | | |
| Reliability Rating | | | | |
| Code Smells | | | | |
| CRITICAL | | | | |
| Cognitive Complexity total | | | | |
| Coverage % | | | | |
| Branch Coverage % | | | | |
| ncloc | | | | |
| Tests | | | | |
| sqale_index (min) | | | | |

**Akzeptanz-Signale**:
- Reliability auf A
- Cognitive Complexity sinkt trotz +LOC
- Code Smells pro 1.000 LOC sinken
- Coverage steigt

**Stop-Signale** (Welle abbrechen oder neu planen):
- Reliability fällt
- Build bricht
- > 50 % der Tests rot

## Was NICHT in den Skill gehört

- Keine cloud-basierten Scans (Privacy)
- Keine Code-Modifikation ohne Build/Test/tsc-Verifikation
- Welle 4 (Monolith-Decomposition) niemals "in einem Rutsch" — immer in 4+ Sub-Sessions, jede mit Verifikation
- Migrations-Apply gegen Cloud-DB ist nie Sache des Skills — nur SQL-Files schreiben

## Ergänzende Refactoring-Prinzipien

- **Pure-First**: Pure Funktionen extrahieren bevor man React-Komponenten anfasst — leichter zu testen, niedrigeres Risiko
- **Disjunkte Welle vor Sequenz**: Wenn drei Wellen disjunkte Files berühren, parallel via Subagents; sonst sequentiell
- **Tests vor Strukturwandel**: Welle 2 (Tests) muss vor Welle 3-5 abgeschlossen sein — sonst keine Sicherheit gegen Regressionen
- **Eine Sicherheitslücke pro Refactor entdeckt** ist ein typischer Bonus (in dieser Codebasis: `/api/admin/delete-user` war unauth!)
