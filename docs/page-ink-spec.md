# Ink on the page, passes on the cuts: spec

What a score's ink is once this work is done: markings belong to the original's pages, not to
cuts, and a cut says which pass of its page it plays. Everything not named here stays as it is. How
to get there is in `page-ink-plan.md`; where the two disagree, this file wins.

## The model

- **A score** is its cuts in played order, as now.
- **A cut** is a page of the original, its top and bottom (`y0`, `y1`), as now, and its **pass**
  of that page: a whole number from 1. A cut without one stored is pass 1. `ownInk` goes.
- **A score's ink** is its markings by original page (0-based), in the coordinates of that page,
  as markings are now. It is no longer kept by cut.
- **A marking** may have a **pass**: the one pass of its page it belongs to. A marking without one
  belongs to every pass. Every kind of marking (strokes, symbols, text) can have one.
- **Archived cuts go.** `Score.archived` is dropped: a removed cut is deleted, and its page's ink
  stays on the page.

## What a cut shows

A cut shows a marking of its page when both hold:

- the marking's anchor point (`anchorOf`: a placed marking's centre, a stroke's first point) lies
  within the cut, from `y0` to `y1`, ends included;
- the marking has no pass, or the cut's pass.

It draws the marking whole, not clipped at the cut's edges. A marking near an edge may then overlap
the next cut on the frame; that is accepted. A marking whose anchor no cut covers, or whose pass no
cut has, is not shown anywhere and is kept.

The same rule decides, everywhere a cut's markings are asked for: what is painted, what the eraser
reaches (`_eraser.ts`), what a press can select (`markingAt`), the loupe, and the PDF export
(`export/pdf.ts`). Export of a score needs nothing else: each cut's markings come out where the
cut does.

## Making, moving and erasing markings

- **A new marking** goes on the page of the cut that holds most of it on the frame (the nearest
  cut when none does), as `claimMarking` chooses now, in that page's coordinates, with no pass.
- **A moved or resized marking** goes on the page of the cut holding most of it, as now. If it has
  a pass, it takes the pass of the cut it lands on; without one, it stays without.
- **Erasing or editing a marking without a pass** changes it on every pass, since it is one marking
  on the page.

## The selection

- A selected marking is known by its page and the marking itself (by identity, as now), and by the
  cut it was selected in, which gives the pass and where its box is drawn.
- **"This time only"**, a toggle beside the delete button in `SelectionBox`
  (`reader/tools/_selection.ts`), so every tool that selects has it:
  - on: the marking takes the pass of the cut it was selected in;
  - off: the marking loses its pass, and shows on every pass.
  - It shows on, with a marking that has a pass, and off without.
  - It is hidden when the cuts of the marking's page all have one pass and the marking has none.
- Turning it on or off is one edit, undone like any other; the marking stays selected.

## Cuts and their passes

- **Edits to the cuts never change the ink.** Moving an edge, cutting, joining, removing, the white
  space and inserting leave every marking where it was. A marking that a cut stops covering is
  shown again when a cut covers it again.
- **Cutting a cut in two:** both halves have its pass.
- **Joining two cuts:** the joined cut has the upper one's pass.
- **Cuts on the same page with different passes are unrelated**, as cuts on different pages are:
  the music between them is not "cut out", a tab doesn't stop at the other's edge, and the menu
  offers no Join or Restore between them (`edgeKind`, `edgeRange`, `inOrder` in `scores/edits.ts`).
- **Removing a cut** deletes it (never the last cut, as now). A cut dragged to nothing is removed.
- **A new score's cuts** are pass 1.
- **Inserting original pages** (the cut menu's Insert… items, `cuts/_insert-picker.ts`):
  - The dialog offers a pass: each pass the picked pages' cuts already have, and one more (the
    highest of them plus 1; pass 1 when no cut shows any of the picked pages). The new pass is
    chosen at first when the picked pages already have cuts; pass 1 is when they have none.
  - Every inserted cut has the chosen pass.
  - The "Copy markings" box, the archived cuts row and "Delete archived cuts…" go.
- **Changing a cut's pass:** a cut menu item, **Pass…**, opens the same choice as inserting, for
  the cut's page (each pass its page's cuts have, and one more), with the cut's own pass chosen.
  The cut then shows the markings of its new pass.
- **The pass on the tabs:** while Cuts is on, each cut's tab shows "Pass N" when its page's cuts
  have more than one pass among them. Nothing about passes shows while reading.

## The version of the stored data

- The kv store keeps the **version of its data**, a whole number, under a new key in
  `storage/keys.ts`. No version stored is version 1: everything saved before this change. This
  change makes version 2.
- **At start-up**, after a new version of the app is taken (`takeUpdate` in `main.ts`) and before
  anything else reads the store, each step from the stored version up to the app's runs in order,
  and the stored version is raised after each step. A step is a function that brings the whole
  store from one version to the next; this change has one, from 1 to 2 (below). Later changes to
  stored data add a step each.
- **While steps run, nothing else can be done:** the start screen stays, saying "Updating your
  scores…", and the library opens only once they are all done. With no step to run, nothing shows.
- **If a step fails**, the start screen says so, with a Try again button that runs the steps again
  from the stored version; the library does not open. A step's writes to each score are one
  transaction, so a step run again after failing partway finishes what is left.
- **A stored version newer than the app's** (data from a newer Volti): the start screen says so,
  and the library does not open.

## From version 1 to 2: scores saved before this change

For each score in the store (every `score:` key, with its `ink:` record), whether its original is
there or not, its score and its ink are rewritten together, in one transaction:

- every cut is pass 1, and `ownInk` is dropped;
- every marking of every cut, archived ones included, goes on that cut's page with no pass, in the
  order the cuts were (played cuts first, in played order, then archived ones);
- of markings on a page that are exactly the same (equal as JSON), only the first is kept;
- ink kept under a cut id that no cut has, played or archived, is dropped;
- archived cuts are dropped.

A score already in the new form (no archived cuts, ink keyed by page) is left as it is, so the step
can be run again. Nothing else is migrated. After this step, `loadScore` and everything else reads
only the new form.

## Unchanged

Excerpts, named excerpts and setlist entries (they name cuts by id, and cuts keep their ids), the
tools, the toolbar, the panels, undo, the symbol and text sizes, the reader's layout and frames.
