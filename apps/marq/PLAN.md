# Marq: Plan

Was Marq kann, steht in der README, das Kommentieren im Einzelnen in `KOMMENTARE.md`. Hier steht nur, was kommen soll.

## Brainstorm-Ideen

- **Eine Textstelle als Anker**: der Kommentar hält die gemeinte Stelle als Zitat fest (`<!-- @ai["Once, add"]: … -->`),
  ohne bestehende Kommentare zu brechen.

## Geplante Umsetzungen

### Kommentare in Gliederung, Liste und Suche

- Gliederung (`outline.ts`): je Überschrift die Zahl der offenen Kommentare darunter, Filter nach Typ.
- Eine Liste „Alle Kommentare“ zum Springen, als Abschnitt im Navigationsfeld (wie die Kommentarliste in Dirq; am
  besten als gemeinsamer Baustein, siehe Wurzel-`PLAN.md`).
- Suche (`@qiew/frame/search`): Kommentartexte werden gefunden, auch wenn keine Karte offen ist.
- README um diese Teile ergänzen.
