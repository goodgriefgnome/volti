# Text and symbol markings, plan 5: Academico 0.905, its Italic, and the Text tool's fonts

How to build this part of `text-and-symbol-markings.md` (the spec). Read the spec first: it says
what the result must be, and this plan only how to get there. **Where the two disagree, the spec
wins**; stop and say so rather than follow the plan.

Plans 1 to 4 (`text-and-symbol-markings-plan-1.md` to `-plan-4.md`) are done. Plan 3 bundled
Academico Regular 0.902 (id `551b7cce`), from an npm package that has no Italic. Academico 0.905
has one; this plan bundles its Regular and Italic in place of 0.902, and gives the Text tool its
fonts in the second row, now that there are two text fonts. Read `ARCHITECTURE.md` too.

## What this plan delivers

- **Academico 0.905**, Regular and Italic, bundled; 0.902 is no longer bundled.
- **The fonts** in the second row while Text is the tool: Academico and Academico Italic. Choosing
  one sets the font of new text, of the text being typed, and of the selected text marking.

Left for a later plan, and not to be started here: imported fonts.

**What changes for what is stored**: nothing is dropped, but 0.905's Regular is a new font with a
new id, as the spec's *Fonts* says. Text and library symbols made with 0.902 keep their glyphs and
look as they did. Editing such text shapes it in Academico 0.905 Regular. A library symbol in 0.902
shows "Font no longer bundled" in the editor, and its characters can be changed only after another
font is chosen (plan 2 built this).

## Stages

Each stage is one commit (or a few), pushed to `main`, and leaves `npm test` and `npm run build`
passing. Do them in order.

---

### Stage 1: Academico 0.905, Regular and Italic

**The files**: Steinberg publishes no download of Academico. The OTFs are in the GitHub repository
`dbenjaminmiller/academico-mirror`, at commit `b10716d` (2025-11-11):
`Academico-Regular.otf` and `Academico-Italic.otf`, each "Version 0.905;SMTG;…;2025", and
`COPYING` (SIL Open Font License 1.1, copyright Steinberg 2017–2025). Clone it into a scratch
folder, not the repository, and check that the version strings say 0.905.

Convert each OTF to WOFF2 with `wawoff2` in the scratch folder, as plan 3's stage 1 did (the
conversion is lossless; don't add `wawoff2` as a dependency). Then in `public/fonts/`:

- `Academico.woff2`: replaced by 0.905's Regular.
- `Academico-Italic.woff2`: new, 0.905's Italic.
- `Academico-OFL.txt`: replaced by the mirror's `COPYING`.

**The one-off check, before committing**, as plan 3's: for each style, read the OTF and the WOFF2
through fontkit and compare every glyph's path data and advance width, and the kerning of every
pair of letters. They must be the same; say so in the commit message, with the numbers of glyphs
and kerned pairs. Also check that the Italic's vertical metrics (`ascent`, `descent`,
`capHeight`) are the Regular's: an older Italic had its baseline wrong, which would put a typing
field's text off its line. If anything differs, stop and say so.

**`src/fonts/fonts.ts`**:

- `ACADEMICO` becomes the new Regular's id (the first 8 hex digits of `sha256sum` of the new
  file). Its comment says it is release 0.905.
- `ACADEMICO_ITALIC`, the Italic's id, the same way.
- `FILES`: `[ACADEMICO_ITALIC]: 'fonts/Academico-Italic.woff2'` added.
- `fontChoices()`: Bravura, Academico, then `{ id: ACADEMICO_ITALIC, name: 'Academico Italic',
  text: true }`.

0.902's id (`551b7cce`) is in no code from then on; it stays only in the spec's examples.

**Tests** in `src/fonts/_shape.test.ts`: as for the Regular now, the Italic's `fontId` is
`ACADEMICO_ITALIC`, shaping `'Ped.'` gives four glyphs left to right, and a pair is kerned (find
one during the one-off check); its metrics' `ascent` and `descent` equal the Regular's. Keep the
Regular's tests passing against the new file (a kerned pair may need changing: use one the check
found).

**Docs**: `TODO.md`'s *Text and symbol markings* entry: Academico is 0.905, Regular and Italic,
from the mirror, converted and checked (replace the note on the Italic and on 0.902).

**Check**: the build has both files in `dist/fonts/`; in the app, a text placed before this stage
looks as it did, and editing it gives Academico 0.905.

---

### Stage 2: the Text tool's fonts

**The second row** (`reader/_symbol-row.ts`): a group of font buttons, before the backgrounds,
shown while Text is the tool and `fontChoices()` has more than one text font (`text: true`). Each
button shows its font's name ("Academico", "Academico Italic") written in that font
(`cssFamily`; the app's own font until it has loaded), with the name as its `aria-label`; one is
pressed.

```ts
// SymbolRowActions gains:
font(id: string): void;
// show() takes, besides what it takes now:
//   fonts: { choices: FontChoice[]; pressed: string } | undefined, undefined to hide them.
```

The buttons call `preventDefault` on `pointerdown`, so tapping one doesn't take the focus from the
typing field (and so doesn't finish the typing).

**When the row shows** (`_toolbar.ts` `sync`): as now (while the groups are shown, or a symbol or
Text is the tool); the order in it is the groups, the fonts, the backgrounds, as the spec says.

**`Reader`** (`reader/reader.ts`):

- `textFont`: the font of new text, `ACADEMICO` to start, kept while the app runs. `newText` uses
  it in place of `ACADEMICO`.
- **Which button is pressed**: the font of the text being typed, while typing; else the selected
  marking's, when it is text in one of the choices; else `textFont`.
- **`font(id)`**:
  - sets `textFont`;
  - while typing: the field changes to that font, and so does what it places (below);
  - else, with a text marking selected whose font isn't `id`: it is shaped again in `id`, keeping
    its text, the start of its baseline, its size, colour and background, as an edit of it does
    (one `commit`, still selected).
- Editing text (`editText`) keeps its font when it is a choice, as now; choosing a font while its
  field is open changes it.
- Put what an edit's `done` does now in one method, `retext(sel: Selected, font: string, text:
  string)`, which both `editText` and `font` use.

**`TypingField`** (`reader/_typing.ts`) gains

```ts
/** Show the text in another font, keeping its baseline start, size and what is typed; `done` then gives the font too. */
setFont(font: string): Promise<void>;
```

and `TypingRequest.done` becomes `done(text: string, font: string)`. The field's top moves with
the new font's ascent so its baseline stays where it was; the caret stays where it was in the
text.

**Tests**: none new; the row and the field are checked in the app.

**Check in the app**: as in the manual checks below.

---

### Stage 3: docs and the TODO

- `TODO.md`: in the *Text and symbol markings* entry, plan 5 is done; what is left of the spec is
  imported fonts, still to plan.
- `TODO.manual.md`: the manual checks below, in the group the earlier plans added.

## Manual checks, in the app

On the tablet, with a score open:

1. A text placed before this plan looks as it did. Edit it: it is now in Academico 0.905, starting
   where it did.
2. Tap **Text**: the second row shows "Academico" and "Academico Italic", each in its own font,
   Academico pressed, then the backgrounds.
3. Tap "Academico Italic", then the music, and type "dolce": it is italic in the field and when
   placed, on the same baseline (no jump on Enter). The next text is italic too.
4. While typing, tap "Academico": the field turns upright without closing, the keyboard stays, and
   Enter places it upright.
5. Select an italic text and tap "Academico": it turns upright, its start where it was; undo turns
   it back.
6. With a symbol selected and Text as the tool, tap a font: the symbol doesn't change.
7. In the library editor, a symbol made in Academico before this plan shows "Font no longer
   bundled"; choose Academico and its characters can be changed again.
8. Export a score with italic text: it shows as in Volti in another PDF app.

## Decisions made here that the spec doesn't make

- Academico 0.905 comes from `dbenjaminmiller/academico-mirror` at commit `b10716d`, a third-party
  mirror (Steinberg publishes none); Bold and Bold Italic aren't bundled.
- 0.902's Regular is no longer bundled, rather than kept beside 0.905: text in it keeps its look,
  and is shaped in 0.905 when edited.
- The font buttons show each font's name in that font.
- Choosing a font sets the font of new text, of the text being typed (without finishing it) and of
  the selected text marking; it doesn't change symbols.
- The font for new text starts as Academico each run.
