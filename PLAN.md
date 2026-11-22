# Qiew: Plan für den gemeinsamen Rahmen

Was alle Betrachter teilen (`crates/frame`, `packages/frame`). Was eine einzelne App vorhat, steht in
`apps/<app>/PLAN.md`. Hier steht nur, was kommen soll.

## Brainstorm-Ideen

- **Tastenbelegung prüfen**: Alt+↑/↓ für den nächsten Abschnitt könnte mit Fenstermanagern kollidieren (Alternative
  Strg+↑/↓); Strg+Alt+M fühlt sich unter Linux ungewohnt an (Alternative Strg+Umschalt+M). Die Belegung steht an einer
  Stelle (`packages/frame/src/keys.ts`).
- **Kommentare zu Projektdateien**: Heute nimmt CodeDeck Kommentare nur zu Patches an, die es Dirq gegeben hat
  (Feld `doc`). Für Hyqe und Xaq (siehe deren `PLAN.md`) trüge die Nachricht stattdessen den Pfad der Datei, und
  CodeDeck nähme Kommentare zu jeder Projektdatei an, die es selbst mit `--annotate` geöffnet hat.
- **Weitere Wege zurück zu CodeDeck**: eine Auswahl (Textstelle, Zeilen, Hunk, jq-Ergebnis) als Anhang mit Herkunft
  schicken („An CodeDeck“). Jede Aktion braucht ihre eigene Freigabe und eine Prüfung in CodeDecks Hub.
- **Aussehen wie CodeDeck**: Farbschema und Sprache beim Start mitgeben.

## Geplante Umsetzungen

### Übergabe nur an ein laufendes Fenster

Eine Option (etwa `--if-running`), mit der `--reuse` das Dokument nur übergibt, wenn schon ein Fenster läuft, und sonst
nichts öffnet. Damit kann CodeDeck eine laufende Runde fortlaufend nachschicken, ohne ein geschlossenes Fenster wieder
aufzumachen (Dirq, „Live in Dirq“).

### Navigationsfeld im Rahmen

Marqs Gliederung (`outline.ts`, Strg+Umschalt+O, anheftbar) wird ein Baustein für alle: in Marq „Gliederung“, in Dirq
„Dateien“, je Eintrag Zähler (Kommentare, Änderungen), unten ein Abschnitt „Kommentare“ (in Dirq nur mit `--annotate`,
in Marq immer). Dirqs Dateiliste und Kommentarliste gehen darin auf.
