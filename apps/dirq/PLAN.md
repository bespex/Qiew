# Dirq: Plan

Was Dirq kann, steht in der README; die Freigaben `--annotate`, `--repo` und `CODEDECK_SOCKET` beschreibt
`docs/ANNOTATE.md`, die gemeinsamen Gesten `docs/BEDIENKONZEPT.md`. Hier steht nur, was kommen soll.

## Brainstorm-Ideen

- **Datei als gesehen abhaken**: Schalter im Kopf jeder Datei, „3 von 7 gesehen“, Sprung zur nächsten ungesehenen;
  gemerkt je Fingerabdruck des Datei-Diffs bei Dirq (`~/.local/state/dirq/viewed.json`), so dass eine geänderte Datei
  wieder ungesehen ist. Mit CodeDeck abgeglichen (dort „Angesehen“), etwa über einen Kopf `X-CodeDeck-Viewed`.
- **Hunk oder Datei an CodeDeck anhängen** („An CodeDeck“ an einem Hunk), als Text des Hunks mit Datei und Zeilen.
- **An dieser Zeile bearbeiten**: CodeDeck öffnet die Datei im gewählten Editor an der Zeile.
- **Hunk zurücknehmen**: Dirq bittet, CodeDeck legt einen Snapshot an und nimmt nur diesen Hunk aus dem Arbeitsordner
  zurück (`git apply -R` des Hunks); nur wenn der Hunk dort noch so steht.
- **Kommentare einer früheren Runde wiedersehen**: CodeDeck schreibt offene Zeilenkommentare in den Patch-Kopf
  (`X-CodeDeck-Note: <datei>:<zeile> <text>`), Dirq zeigt sie als Karten.
- **Einen Bereich statt einer Zeile kommentieren** (über die Zeilennummern aufziehen). Heute bewusst nur eine Zeile,
  wie in CodeDeck.
- **Kommentarliste und Navigationsfeld** wie Marqs Gliederung als gemeinsamer Baustein (siehe `PLAN.md` im
  Wurzelverzeichnis).

## Geplante Umsetzungen

### Live in Dirq

CodeDeck schickt den Diff der laufenden Runde bei jeder Änderung neu, entprellt, mit derselben `--id`; Dirq behält
Ort, Faltungen und Kommentare und markiert Neues (das kann es schon). Damit ein geschlossenes Fenster nicht wieder
aufgeht, braucht der Rahmen eine Option, die nur an ein laufendes Fenster übergibt (siehe Wurzel-`PLAN.md`,
„Übergabe nur an ein laufendes Fenster“). In CodeDeck: an der laufenden Runde ein Schalter „Live in Dirq“.

### Syntaxfarben über die ganze Datei

Hat Dirq mit `--repo` den Blob einer Datei geladen, wird die ganze Datei hervorgehoben und die Zeilen der Hunks werden
daraus genommen, statt je Hunk ohne den Anfang der Datei. Das macht Kommentare und Zeichenketten richtig, die vor dem
ersten Hunk beginnen.

### Verschobener Code

Gelöschte und hinzugefügte Blöcke über Dateien hinweg vergleichen (ab 3 Zeilen, Leerraum am Rand egal), Paare als
„verschoben“ markieren und verlinken, wie `git diff --color-moved`; innerhalb des Blocks geänderte Zeilen trotzdem
zeigen.

- **Darstellung:** eigene Farbe (blau statt rot/grün), am Rand ein Pfeil mit dem Ziel („verschoben von src/a.rs:40“);
  Klick springt hin, das Ziel blitzt auf, Alt+← geht zurück. In der Dateiliste eine eigene Zahl „↔ 38“, die nicht zu
  `+`/`−` zählt.
- **Test:** der Algorithmus als reine Funktion (innerhalb einer Datei, über Dateien, mit kleiner Änderung im Block).

### Serien von Commits

Eine Datei mit mehreren Patches (mbox, `git format-patch --stdout`) als Serie: oben die Commits mit Betreff, Wechsel
mit Tasten, je Commit sein Kopf. CodeDeck liefert dafür alle Runden seit dem letzten Commit als mbox, je Runde mit
Runde, Session, Prompt und Schlussworten.

### Diff von Diffs

Zwei Fassungen eines Patches vergleichen („Was hat sich seit meinem letzten Review am Vorschlag geändert?“). Braucht
zuerst ein Konzept, auch für CodeDeck: wann ein Stand als gesehen gilt und wogegen verglichen wird. Vorher prüfen, ob
das Aufblitzen beim Live-Review schon genügt; dann entfällt es.
