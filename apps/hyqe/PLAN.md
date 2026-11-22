# Hyqe: Plan

Was Hyqe kann, steht in der README. Hier steht nur, was kommen soll.

## Brainstorm-Ideen

- **Kommentare an Elementen der Seite für die KI** (mit `--annotate`, wie in Dirq): Eine KI schreibt oft HTML-Seiten
  (Berichte, Mock-ups); „dieser Knopf soll anders aussehen“ gehört an die Stelle. Beim Überfahren eines Blockelements
  erscheint der Randknopf, darunter die Eingabekarte; beides und das Senden kommen aus dem Rahmen
  (`@qiew/frame/annotate`, `sendComment`), Hyqe liefert nur den Anker. Anker ist die Zeile im Quelltext (beim
  Darstellen an die Elemente geschrieben, etwa als `data-line`), gesendet wird `file` (die Datei), `line`, `code` (die
  Quelltextzeile) und eine Kurzbeschreibung des Elements (Tag, Text). Hyqe schreibt nichts in die Datei. Auf
  CodeDeck-Seite braucht es dafür Kommentare zu Projektdateien, die CodeDeck selbst geöffnet hat (siehe
  Wurzel-`PLAN.md`, „Kommentare zu Projektdateien“).

## Geplante Umsetzungen

Noch keine.
