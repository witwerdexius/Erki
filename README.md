# Erlebnis Kirche (Erki) Planner

Der **Erlebnis Kirche Planner** (kurz *Erki*) ist eine interaktive Web-Anwendung (gebaut mit React und Next.js), die Teams bei der Planung und räumlichen Organisation von Veranstaltungen mit verschiedenen Stationen unterstützt – etwa für die Kinder- und Jugendarbeit oder Stationsläufe.

## Was macht die App genau?

Die App bietet ein digitales Dashboard, in dem man einen **Lageplan** sowie eine detaillierte **Tabelle** aller Stationen verwalten kann. Sie löst das Problem, dass man oft den Überblick verliert, welche Station wo aufgebaut wird, wer zuständig ist und was dafür benötigt wird.

### 🌟 Hauptfunktionen

1. **Interaktiver Lageplan (Map View)**
   * Man kann ein eigenes Hintergrundbild hochladen (z.B. den Grundriss eines Gebäudes oder einen Außenbereich-Plan).
   * Auf diesem Plan lassen sich Stationen visuell anordnen. Jede Station wird durch eine "Blase" am Rand dargestellt, die mit einer Linie zu ihrem vorgesehenen Ort ("Target") auf dem Plan verbunden ist.
   * Die Stationen können per Drag & Drop frei auf dem Plan positioniert werden.
   * Zur besseren visuellen Trennung werden die Stationen automatisch farblich codiert (Cyan, Lavendel, Minze, Pink).

2. **Detail-Tabelle (Table View)**
   * Hier werden alle inhaltlichen und organisatorischen Aspekte einer Station gepflegt:
     * *Name & Beschreibung*
     * *Benötigtes Material*
     * *Zuständigkeit für den Aufbau*
     * *Zuständigkeit für die Durchführung*
     * *Status*: Man kann abklicken, ob eine Station fertig vorbereitet bzw. "voll" (isFilled) ist. 

3. **Import von externen Websites**
   * Die App kann über einen eingebauten Scraper (mit *Cheerio*) Programmabläufe von **jugendarbeit.online** einlesen. 
   * Gibt man eine URL ein, extrahiert die App automatisch die einzelnen Stationen, Materiallisten und Beschreibungen und erstellt daraus einen fertigen Plan.

4. **PDF-Export**
   * Der visuelle Lageplan kann direkt als PDF heruntergeladen werden. Dabei wird die Karte vor dem Export bereinigt (Entfernen von störenden Schatten), um ein klares, druckfertiges Dokument für das Team zu erzeugen.

5. **Backup & Wiederherstellung (Persistence)**
   * Alle Pläne werden automatisch im lokalen Speicher des Browsers (`localStorage`) zwischengespeichert.
   * Man kann den aktuellen Stand der Pläne als JSON-Datei exportieren ("Backup laden / Export als JSON") und später oder auf einem anderen Gerät wieder importieren. Dies ermöglicht auch das Offline-Teilen von Planungsständen.

6. **Hilfswerkzeuge**
   * Automatische Neunummerierung von Stationen.
   * Automatische, gleichmäßige Farbverteilung der Stationsblasen, um Farbkonflikte auf der Karte zu vermeiden.

## Zielgruppe

Die App richtet sich an Event-Organisatoren in Kirchengemeinden, Jugendgruppen oder Vereinen, die Ablaufpläne mit Stationen haben (z.B. Stationenläufe, interaktive Gottesdienste, Großgruppenspiele) und eine Kombination aus inhaltlicher Planung (Material, Mitarbeiter) und räumlicher Übersicht (Wo ist was?) benötigen.
