# Supabase

## Verzeichnisstruktur

- `migrations/` — Forward-only SQL-Migrations, sortiert per Zeitstempel-Prefix.
- `schema.sql` — _(geplant, noch nicht im Repo)_ Referenz-Snapshot des kompletten Schemas. Ergänzt `migrations/`, weil die Basis-Tabellen (`plannings`, `stations`, `profiles`, `communities`, `templates`) historisch direkt im Supabase Studio angelegt wurden und nie als Migration erfasst sind.

## Schema-Dump erzeugen (einmalig durch Kollegen mit Cloud-Zugang)

Voraussetzung: Supabase-Account mit Zugriff auf das ErKi-Cloud-Projekt.

```bash
# 1. CLI installieren (macOS — auf Linux: siehe https://supabase.com/docs/guides/cli)
brew install supabase/tap/supabase

# 2. Login (öffnet Browser)
supabase login

# 3. Projekt verlinken — die <project-ref> ist die Subdomain von
#    https://<project-ref>.supabase.co aus der Projekt-URL.
cd "/path/to/Kirche Kunterbunt"
supabase link --project-ref <project-ref>

# 4. Schema dumpen
supabase db dump --schema-only -f supabase/schema.sql

# 5. Header-Kommentar oben in supabase/schema.sql einfügen:
#    -- ErKi schema reference snapshot.
#    -- Regenerate via: supabase db dump --schema-only -f supabase/schema.sql
#    -- This file is the source of truth for the base schema; supabase/migrations/
#    -- contains forward-only patches applied on top.

# 6. Committen
git add supabase/schema.sql
git commit -m "chore(supabase): Schema-Dump als Referenz (Welle 2a)"
```

## Konflikte vermeiden

- Migrations-Dateinamen brauchen einen **eindeutigen Zeitstempel-Prefix** (`YYYYMMDDHHMMSS_*.sql`).
  Eine Kollision (`20260427000003_*` × 2) wurde in Commit `90ccab2` aufgelöst.
- Bei neuer Migration: `supabase migration new <name>` benutzen — vergibt automatisch einen neuen Stempel.

## Lokale Entwicklung

Aktuell ist kein lokaler Supabase-Stack konfiguriert (`supabase init` wurde bewusst nicht ausgeführt). Wer das einführen möchte, sollte `supabase/.temp`, `supabase/.branches` und `.supabase/` in `.gitignore` lassen — sind bereits dort.
