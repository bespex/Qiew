# Die Freigaben `--annotate`, `--repo` und `CODEDECK_SOCKET`: Spezifikation

Stand 2026-11-21. Entwurf, **gebaut ist bisher nur `--id` (Abschnitt 3, Punkt 5).** Diese Datei ist die verbindliche Beschreibung der Parameter, mit
denen CodeDeck einem Betrachter etwas erlaubt, das er sonst nicht tut. Sie ist so geschrieben, dass eine Session ohne
Vorwissen daraus bauen, testen und dokumentieren kann. Wo `apps/dirq/PLAN.md`, `apps/dirq/IDEEN.md` oder
`docs/BEDIENKONZEPT.md` etwas anderes sagen, **gilt diese Datei**.

Geltungsbereich: hier steht, was die Parameter für **Dirq** bedeuten. Marq (eigene Session) kennt `--annotate` mit
anderer Wirkung (es schreibt `<!-- @ai: … -->` in die Datei, siehe `apps/marq/IDEEN.md`); der **Name und die
Grundregeln** (Abschnitte 1 und 2) sind für beide gleich und dürfen nicht auseinanderlaufen.

---

## 1. `--annotate`: was es bedeutet

**In einem Satz:** *„Dieses Dokument darf kommentiert werden. Was der Nutzer kommentiert, geht an den, der den Betrachter
gestartet hat.“*

Genauer:

1. **Ohne `--annotate` ändert sich nichts.** Kein „+“ an den Zeilen, keine Kommentar-Karten, kein Knopf in der
   Werkzeugleiste, kein Eintrag im Navigationsfeld, keine Taste. Dirq sieht und verhält sich genau wie heute. Das ist
   keine Einschränkung, sondern der Normalfall.
2. **Mit `--annotate` darf der Nutzer an Zeilen des Diffs Kommentare anlegen, ändern und entfernen.** Diese Fähigkeit ist
   das **Einzige**, was der Parameter einschaltet. Er schaltet nicht ein: Schreiben in die Patch-Datei, Schreiben in ein
   Repository, andere Aktionen an CodeDeck (anhängen, zurücknehmen, öffnen), Syntaxfarben, Kontext, Live-Anzeige.
3. **Dirq speichert Kommentare nicht dauerhaft.** Sie leben im Fenster, solange das Dokument geöffnet ist. Wer sie
   aufbewahrt, ist der Empfänger (bei CodeDeck: der Teil `notes` der Anhänge zum nächsten Prompt, `src/notes.ts`).
4. **Der Parameter ist eine Freigabe, keine Einstellung.** Er gibt es nur auf der Kommandozeile. Es gibt weder eine
   Umgebungsvariable noch einen Eintrag in einer Einstellungsdatei, noch einen Menüpunkt, der ihn dauerhaft setzt. Das
   ist Absicht: Nur wer Dirq startet und weiß, wohin die Kommentare gehen sollen, darf ihn setzen.
5. **Er gilt für den Aufruf und das Dokument, das dieser Aufruf mitbringt.** Siehe Abschnitt 3 (`--reuse`).

Aufruf:

```
dirq - --reuse --annotate            # Patch auf der Standardeingabe, Fenster wiederverwenden, kommentierbar
dirq change.patch --annotate         # Datei, kommentierbar
dirq change.patch                    # Datei, nur ansehen (wie heute)
```

Die Stellung auf der Kommandozeile ist gleichgültig. Mehrfach angegeben wirkt er einmal. Er hat keinen Wert.

### Was „kommentieren“ in Dirq heißt

- **Wo:** an einer einzelnen Zeile (Kontext, hinzugefügt oder gelöscht). Keine Bereiche; wer mehr meint, schreibt es in den
  Text („Zeilen 40–45“).
- **Wie:** Beim Überfahren erscheint links im Rand ein „+“; Klick (oder Strg+Alt+M, Tasten siehe
  `docs/BEDIENKONZEPT.md`) öffnet unter der Zeile eine Eingabekarte; Strg+Enter sendet, Esc bricht ab. Die fertige
  Karte zeigt Streifen und Blase; beim Überfahren erscheinen Stift (bearbeiten) und Papierkorb (entfernen).
- **Was geschieht:** Dirq sendet eine Nachricht (Abschnitt 4). Bearbeiten ist „entfernen und neu senden“.
- **Marke `@ai`:** gibt es in Dirq nicht. Jeder Zeilenkommentar, den CodeDeck erhält, ist ohnehin für die KI.

---

## 2. Die drei Freigaben im Überblick

| Freigabe | Wo angegeben | Wer setzt sie | Bedeutung |
|---|---|---|---|
| `--annotate` | Kommandozeile | CodeDeck | Kommentieren erlaubt (dieses Kapitel) |
| `CODEDECK_SOCKET=<pfad>` | Umgebung des startenden Prozesses | CodeDeck | Wohin gesendet wird (Abschnitt 4); später auch Grundlage anderer Rückweg-Aktionen |
| `--repo <pfad>` | Kommandozeile, mit Wert | CodeDeck | Dirq darf in diesem Repository **lesend** nachsehen (Abschnitt 6) |

Gemeinsame Regeln: je Aufruf und Dokument, nie dauerhaft, ohne Freigabe nichts Neues, jede im `--help` und in der README
des Programms beschrieben (Abschnitt 8).

### Zusammenspiel von `--annotate` und `CODEDECK_SOCKET`

| `--annotate` | `CODEDECK_SOCKET` | Verhalten |
|---|---|---|
| nein | nein | wie heute |
| nein | ja | wie heute: **kein** „+“. Die Variable allein erlaubt nichts; sie nennt nur den Weg, den spätere Aktionen nutzen können |
| ja | ja | Kommentieren; jeder Kommentar wird an den Socket gesendet |
| ja | nein | Kommentieren; die Kommentare bleiben im Fenster; die Karten tragen den Hinweis „nicht gesendet“; „Als Liste kopieren“ (Markdown) in der Kommentar-Übersicht ist der Weg hinaus |

---

## 3. Je Aufruf und Dokument, besonders mit `--reuse`

Hier liegt die wichtigste Stolperstelle, die bei der Umsetzung leicht übersehen wird.

`dirq - --reuse` startet **keinen** neuen Prozess, wenn schon ein Fenster mit `--reuse` läuft: Der aufrufende Prozess übergibt
das Dokument über einen Unix-Socket (`crates/frame/src/launch.rs`: `Handover`, `init`, `listen`) und **beendet sich**.
Daraus folgt:

1. **Die Freigaben müssen in die `Handover`-Nachricht.** Heute enthält sie nur `file`, `line` und `geometry`. Zu ergänzen
   (mit `#[serde(default)]`, damit alte Fenster neue Nachrichten und umgekehrt verstehen; **`annotate` und `id` sind bereits
   gebaut**, `codedeck_socket` und `repo` fehlen noch):

   ```rust
   struct Handover {
       file: Option<String>,
       line: Option<u32>,
       geometry: …,
       #[serde(default)] annotate: bool,
       #[serde(default)] codedeck_socket: Option<String>,   // Wert von CODEDECK_SOCKET des Aufrufers
       #[serde(default)] repo: Option<String>,
   }
   ```

   Die Umgebung des **laufenden** Fensters darf nicht gelten: Es wurde vielleicht von einem früheren CodeDeck gestartet.
2. **Der Socket-Pfad ändert sich.** CodeDeck benennt seinen Socket nach seiner Prozessnummer (`hub.rs`:
   `<pid>.sock`). Startet CodeDeck neu, ist der alte Pfad tot, das Dirq-Fenster lebt aber weiter („it lives on when CodeDeck
   closes“, `apps.rs`). Deshalb gilt je Dokument der **zuletzt übergebene** Socket-Pfad.
3. **Ein Dokument ohne `--annotate`, das in ein Fenster übergeben wird, das vorher kommentierbar war, ist nicht
   kommentierbar.** Das Fenster schaltet beim Wechsel um: „+“, Karten und Knopf verschwinden.
4. **Beim Wechsel zu einem anderen Dokument werden die Karten verworfen** (sie liegen weiter beim Empfänger). Beim
   Neuladen **desselben** Dokuments (Live-Reload einer Datei, oder CodeDeck schickt dieselbe Runde noch einmal) bleiben sie
   (Phase 4/5, Wiederfinden über den Zeilentext).
5. **Wann ist es „dasselbe Dokument“? Entschieden (2026-11-21): der Aufrufer sagt es, mit `--id <text>`.** Bei einer Datei
   genügt der Pfad. Bei Standardeingabe gibt es keinen: der Rahmen legt sie unter einem neuen Namen ab
   (`stdin-<pid>.patch`), jeder Aufruf hätte also einen anderen. Darum nennt CodeDeck eine Kennung
   (`dirq - --reuse --id <text>`), z. B. „Runde 7 · Projekt“. **Gleiche Kennung = neue Fassung desselben Dokuments**:
   Scrollposition, Faltungen, Filter und Karten bleiben, das Aufblitzen vergleicht mit dem vorigen Stand. **Andere Kennung
   = anderes Dokument**: alles beginnt neu. Eine neue Runde bekommt also eine neue Kennung. Ohne `--id` gilt: bei einer
   Datei der Pfad, bei Standardeingabe die Betreffzeile des Kopfes, ohne Kopf die Menge der Dateipfade. (Das ist nur der
   Notbehelf für `git diff | dirq -` von Hand; im Zweifel eher „dasselbe“, denn der Fehler ist harmlos: es blitzt etwas zu
   viel auf, eine Karte wird gedämpft.) Jeder Aufruf ersetzt die Kennung des vorigen; sie reist in der `Handover`-Nachricht
   (`id`, mit `#[serde(default)]`) und liegt im Rahmen: `launch::doc_id`, `launchDocId()`.

Eine neue `--reuse`-Übergabe an ein Fenster **ohne** diese Felder (älteres Dirq) lässt die Felder weg; dann gilt `false`/`None`.
Ein älteres Fenster ignoriert unbekannte Felder (`serde` ohne `deny_unknown_fields`, so ist es heute).

---

## 4. Der Rückweg: Nachrichten an CodeDeck

Nur mit `--annotate`. Eine Nachricht ist **eine Zeile JSON**, UTF-8, mit `\n` abgeschlossen, auf den Unix-Socket aus
`CODEDECK_SOCKET` (beim Aufruf mit `--reuse`: aus der Übergabe, Abschnitt 3). Nachrichten gehen **nur in eine Richtung**:
Dirq erwartet keine Antwort und liest nichts vom Socket.

```json
{"v":1,"action":"line_comment","source":"dirq","id":"d4f1","file":"src/limit.rs","line":42,"code":"let burst = cfg.burst;","text":"Was, wenn 0?"}
{"v":1,"action":"line_comment","source":"dirq","id":"d4f2","file":"src/limit.rs","line":57,"code":"(gelöschte Zeile) let max = 10;","text":"Warum entfällt das?"}
{"v":1,"action":"line_comment_remove","source":"dirq","id":"d4f1"}
```

| Feld | Bedeutung |
|---|---|
| `v` | Version des Formats, jetzt `1`. Neue Felder sind ohne neue Version erlaubt; der Empfänger ignoriert unbekannte |
| `action` | `line_comment` (anlegen/ersetzen) oder `line_comment_remove` |
| `source` | immer `"dirq"` |
| `id` | von Dirq vergeben, im Fenster eindeutig (zufällig, mindestens 8 Zeichen). Wird dieselbe `id` noch einmal gesendet, **ersetzt** sie den Kommentar |
| `file` | Pfad der Datei **wie im Patch** (ohne `a/`/`b/`), relativ zum Projekt. Dirq prüft nichts am Dateisystem |
| `line` | Zeilennummer der **neuen** Seite. Für eine gelöschte Zeile die der nächsten Zeile der neuen Seite dahinter (am Dateiende: die letzte) |
| `code` | Text dieser Zeile ohne Zeilenende, auf 200 Zeichen gekürzt. Bei einer gelöschten Zeile beginnt er mit `(gelöschte Zeile) ` und enthält den gelöschten Text |
| `text` | Text des Kommentars, bis 10 000 Zeichen, Zeilenumbrüche erlaubt |

Hinweise für den Empfänger (CodeDeck): `file` muss im Projekt liegen (CodeDeck prüft); `code` dient dazu, die Zeile zu finden,
wenn sich die Nummern verschoben haben (so nutzt es `Note.code`); CodeDeck kürzt `code` selbst auf 160 Zeichen
(`notesText`).

**Wenn das Senden scheitert** (Socket weg, Verbindung abgelehnt): Der Text geht **nie** verloren. Die Karte bleibt, trägt „nicht
gesendet“ und bietet „Erneut senden“ (und „Als Liste kopieren“). Kein stilles Verwerfen, keine Fehlerdialoge, die den
Lesefluss stören. Beim Wechsel auf einen neuen Socket (Abschnitt 3) bietet Dirq an, die ungesendeten noch einmal zu senden.

**Voraussetzung, die Dirq nicht prüfen kann:** Die Zeilennummern der neuen Seite müssen zum Arbeitsordner des Projekts
passen. **CodeDeck setzt `--annotate` deshalb nur für Patches, die den Arbeitsordner beschreiben** (laufende Runde, noch
nicht Committetes), nicht für einen alten Commit oder einen Snapshot; dort bezögen sich die Nummern auf einen anderen Stand.

**Datenschutz:** Der Socket gehört dem Nutzer (Rechte `0600`, `hub.rs`). Dirq sendet nur diese Nachrichten, nie den Inhalt
von Dateien über die eine Zeile hinaus.

---

## 5. Optional: die Session im Patch-Kopf

Damit CodeDeck weiß, welcher Session ein Kommentar gilt (im Reiter Änderungen hängt das an der Runde,
`NoteSessionContext`): CodeDeck ergänzt den Kopf des Patches (`Subject:`, `From:`, `Date:` …) um eine Zeile

```
X-CodeDeck-Session: <id>
```

Dirq liest sie beim Parsen des Kopfes (`parseHeader` in `src/diff.ts`; sie zählt dort wie ein Trailer) und sendet ihren
Wert als Feld `"session":"<id>"` in jeder Nachricht mit. Fehlt die Zeile, fehlt das Feld, und es gilt das bisherige Verhalten
in CodeDeck. Das ist die **einzige** Information, die über den Kopf von CodeDeck nach Dirq kommt, und sie gilt nur mit
`--annotate`. Der Kopf wird trotzdem wie bisher angezeigt (die Zeile erscheint nicht als Trailer, sondern wird ausgeblendet).

---

## 6. `--repo <pfad>`

- **Bedeutung:** „Dirq darf in diesem Git-Repository **lesend** nachsehen.“ Wirkung nur für Phase 6: fehlende Zeilen aus dem
  Blob holen (`git cat-file -p <blob>`), `.gitattributes` lesen. Es schaltet **nichts** Schreibendes ein.
- **Wert:** Pfad zum Projektordner oder zum Arbeitsbaum des Repositorys. Existiert er nicht oder ist er kein Repository: ohne
  Meldung ignoriert (die Funktionen sind dann einfach nicht da).
- **Nur lesend:** Dirq ruft ausschließlich `git cat-file` (und `git check-attr`, falls nötig) auf, mit festem Argumentvektor
  (keine Shell), im angegebenen Ordner. Nie `git apply`, `checkout`, `reset` oder Ähnliches. Der Befehl ist in Dirqs
  `src-tauri/src/lib.rs` und **nicht** im gemeinsamen Rahmen, damit andere Betrachter keinen git-Zugriff erben.
- **Gilt je Aufruf und Dokument** wie `--annotate` und reist in `Handover.repo` (Abschnitt 3).
- **Fallstrick Kommandozeile:** `--repo` hat einen Wert. In `Launch::parse` (`crates/frame/src/launch.rs`) steht die Liste
  `WITH_VALUE`; `--repo` muss dort hinein, sonst hielte ein **älteres** Dirq den Wert für die Datei (siehe Abschnitt 7).

---

## 7. Verträglichkeit mit älteren Fassungen

(`--id <text>` ist keine Freigabe, sondern eine Benennung; für sie gilt dasselbe wie unten: ein älteres Dirq ignoriert sie
still, es merkt sich dann nur das Live-Review nicht über einen Reload hinaus. Auch `--id` steht **nach** `-`.)

Geprüft am Code (`crates/frame/src/launch.rs`, `Launch::parse`): **Unbekannte Optionen werden still ignoriert** (jede Option mit
`-` am Anfang). Ein Dirq ohne dieses Feature bricht bei `--annotate` also nicht ab, sondern zeigt **kein „+“**, ohne Hinweis.
Der Nutzer würde nicht merken, dass etwas fehlt.

Folgen:

1. **CodeDeck erkennt die Fähigkeit vor dem Start.** Vorschlag: `dirq --help` enthält die Zeile `--annotate`, und CodeDeck
   merkt sich das Ergebnis je Programmdatei (Änderungszeit). Alternativ eine Mindestversion aus `dirq --version`.
   Ohne Fähigkeit setzt CodeDeck `--annotate` nicht und zeigt im Reiter Änderungen, dass die installierte Dirq-Version es
   noch nicht kann.
2. **`--repo <pfad>` darf nie vor dem Dateiargument stehen**, solange ältere Dirq-Fassungen laufen: `dirq --repo /x -` würde `/x`
   als Datei öffnen. CodeDeck ruft `dirq - --reuse --annotate --repo <pfad>` (das `-` zuerst); das tut es heute schon mit
   `dirq - --reuse`.
3. **Ein bereits laufendes älteres Fenster** (mit `--reuse` gestartet, vor dem Update) nimmt die neue `Handover`-Nachricht an
   und ignoriert die neuen Felder: es bleibt unkommentierbar, bis der Nutzer es schließt. Das ist hinzunehmen und in den
   Release-Hinweisen von Dirq zu nennen.

---

## 8. Was dokumentiert werden muss (Teil der Aufgabe, nicht Zugabe)

Die Dokumentation gehört zu **derselben Phase** wie der Code und gilt als Teil der Abnahme. Die Wortlaute sind Vorlagen;
sie sind Englisch, wie die READMEs und `--help` der Apps.

1. **`crates/frame/src/help.rs`**, Liste `OPTIONS` (gilt für alle Betrachter) oder `AppInfo.options` von Dirq (nur Dirq, wenn
   Marq die Option anders belegt). Vorschlag für Dirq:

   ```
   --annotate        let the user comment on single lines (a "+" in the margin); each comment is sent to the program
                     that started Dirq (CODEDECK_SOCKET), never written to the patch. Without it Dirq only views.
   --repo <path>     let Dirq look into this Git repository, read-only, for more context around a change
   ```

   und in `AppInfo.features` eine Zeile, die sagt, dass Kommentare nur mit der Option möglich sind.
2. **`apps/dirq/README.md`**: ein Abschnitt „Comments for the assistant (`--annotate`)“ mit den Punkten 1–5 aus Abschnitt 1
   in Alltagssprache, der Tabelle aus „Zusammenspiel“ und dem Hinweis, dass Dirq ohne die Option nichts schreibt und
   nichts sendet. In „Usage“ die beiden Optionen aufnehmen. Der Satz „read-only“ des README muss weiter stimmen und sagen,
   **warum**: Kommentare sind Nachrichten, keine Änderungen an der Datei.
3. **Qiew-`README.md`, Abschnitt „Working with CodeDeck“:** Der Absatz „Planned … A channel back“ wird zu **Beschreibung des
   Bestehenden**: `CODEDECK_SOCKET`, `--annotate`, `--repo`, das Einzeilen-JSON aus Abschnitt 4, und der Grundsatz „nur auf
   ausdrücklichen Wunsch“. Die Liste „CodeDeck's part“ um die neuen Aufgaben ergänzen.
4. **Diese Datei** bleibt die ausführliche Fassung; die README verweist nicht darauf (sie muss allein verständlich sein),
   `PLAN.md` und `IDEEN.md` verweisen darauf.
5. **CodeDeck:** `docs/DIRQ.md` und `docs/QIEW.md` beschreiben, wann CodeDeck `--annotate`/`--repo` setzt und warum (nur
   Patches des Arbeitsordners), wie die Fähigkeit geprüft wird und was ein Nachrichteneingang bewirkt.
6. **Release-Hinweise** von Dirq: die neuen Optionen, der Hinweis aus Abschnitt 7, Punkt 3.
7. **Kommentare im Code** an den Stellen, an denen die Freigabe geprüft wird (ein Satz: „nur mit `--annotate`“), damit niemand
   die Prüfung wegrationalisiert.

---

## 9. Prüfliste für Tests

Automatisch (reine Funktionen, `npm run check`, `cargo test -p qiew-frame`; den Namen des Pakets in `crates/frame/Cargo.toml`
prüfen):

- `Launch::parse`: `--annotate` allein, mit `-`, mit Datei, mehrfach, hinter anderen Optionen; `--repo <wert>` (Wert wird nicht
  zur Datei); ohne beide.
- `Handover`: Hin- und Rückserialisierung mit und ohne die neuen Felder (altes Fenster, neue Nachricht und umgekehrt).
- Nachricht aus einem Kommentar zusammenbauen: neue Zeile, Kontextzeile, gelöschte Zeile (mitten in der Datei, am Ende), Text
  mit Umbruch, Anführungszeichen, Umlauten, 10 000 Zeichen; Ausgabe ist **eine** Zeile gültiges JSON.
- Wiederfinden über den Zeilentext: Zeile unverändert, verschoben, entfallen.
- `--id`: gelesen mit und ohne Wert, steht nach `-`, wird nicht zur Datei, leerer Wert zählt nicht (gebaut: `Launch::parse`,
  `Handover`).
- „Dasselbe Dokument“ (Abschnitt 3, Punkt 5): gleiche und verschiedene Kennung; ohne Kennung Pfad, Betreffzeile, Dateimenge.

Von Hand (jeweils mit `example.patch` und einem Patch mit Kopf von CodeDeck):

| Fall | Erwartung |
|---|---|
| Start ohne Parameter | Aussehen und Verhalten wie vor der Änderung, kein „+“ |
| `--annotate` mit erreichbarem Socket (Gegenstelle: `socat`/Skript, das die Zeilen mitschreibt) | „+“ da; Kommentar erzeugt genau eine Zeile `line_comment`; Entfernen eine Zeile `line_comment_remove` |
| `--annotate` ohne Socket | Karte mit „nicht gesendet“; „Als Liste kopieren“ liefert Markdown |
| Socket verschwindet nach dem Start | Karte „nicht gesendet“, „Erneut senden“ geht nach neuem Socket |
| `--reuse` von kommentierbar zu nicht kommentierbar | „+“, Karten, Knopf weg |
| `--reuse` mit demselben Dokument (Live) | Karten bleiben an ihrer Zeile; bei geänderter Zeile gedämpft |
| `--reuse` mit anderem Dokument | Karten weg |
| Kommentar an gelöschter Zeile | `line` = nächste neue Zeile, `code` beginnt mit `(gelöschte Zeile) ` |
| `--help` | nennt beide Optionen |
| Älteres Dirq mit `--annotate` | kein Absturz, kein „+“ (so wie in Abschnitt 7 beschrieben) |
