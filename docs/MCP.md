# MCP-Server: Planungen per KI bearbeiten

Endpunkt: `https://<app-domain>/api/mcp/<ERKI_MCP_TOKEN>` (Streamable HTTP, stateless)

## Umgebungsvariablen (Vercel)

| Variable | Zweck |
|---|---|
| `ERKI_MCP_TOKEN` | Geheimes Token im Pfad, mind. 32 Zeichen (`openssl rand -base64 48 \| tr -d '/+='`) |
| `ERKI_MCP_USER_ID` | Supabase-User-ID, in deren Namen die KI arbeitet |
| `SUPABASE_SERVICE_ROLE_KEY` | bereits vorhanden |

Ohne gültiges Token antwortet der Endpunkt mit 404.

## Einbinden

- **Claude.ai / App:** Einstellungen → Connectors → Custom Connector hinzufügen → URL oben.
- **Claude Code:** `claude mcp add --transport http erki https://<app-domain>/api/mcp/<TOKEN>`

## Tools

`planungen_auflisten`, `planung_lesen`, `planung_anlegen`, `planung_aendern`,
`station_anlegen`, `station_aendern`, `station_loeschen`, `stationen_sortieren`,
`aufgabe_anlegen`, `aufgabe_aendern`, `aufgabe_loeschen`

## Verhalten

- Service-Role-Client; Zugriff wird in `lib/mcp/context.ts` geprüft
  (Eigentümer, Collaborator, gleiche Community, Admin).
- `planung_aendern` unterstützt `erwarteteVersion` (Optimistic Locking).
- `station_loeschen` legt vorher einen Snapshot an (`trigger_action = mcp:station_loeschen`).
- Änderungen erscheinen per `postgres_changes` live in offenen Editoren.
- Hintergrundbild und PDF-Vorlage (Data-URLs) werden weder gelesen noch geschrieben.
- Planungen löschen ist bewusst nicht enthalten.

## Bereiche

- `planung.areas`: benannte Bereiche `[{ id, name, points }]` (Koordinaten in %, ungezoomt wie `masks`);
  per `planung_aendern` mit `areas` komplett ersetzbar.
- Station `areaId` (`area_id`): `null` = automatisch (Bereich, in dem der Marker liegt),
  Bereichs-`id` = manuell, `"__none__"` = kein Bereich.
- Wird `areaId` auf einen Bereich gesetzt (ohne `targetX`/`targetY`), verlegt `station_anlegen`/`station_aendern`
  den Marker an eine freie Stelle im Bereich – wie die Auswahl in der Tabelle. Der Kreis bleibt.
- `planung_lesen` liefert je Station zusätzlich `bereich` (Name des wirksamen Bereichs oder `null`).
- Bereiche erscheinen nur im Editor und in Tabellen, nicht im Lageplan-PDF.
