# Splitting the reader: spec

What `src/reader/reader.ts` and the files around it are once this work is done: which part owns
which state, which part may call which, and what each offers. Nothing the user sees changes. How
to get there is in `reader-split-plan.md`; where the two disagree, this file wins.

## Why

`reader.ts` is about 1,000 lines, and the `Reader` class holds every piece of the score screen's
state: where the reader is, what is on the screen, the zoom, the tools and the selection, undo and
saving, access to the scores folder, and opening and closing. Each method can read and change all
of it, so a change to one concern (say, drawing the screen) has to be checked against all the
others. After the split, each concern is a part with its own state, and the others reach it only
through what it offers.

## What changes for the user

Nothing. Every behaviour stays as it is, including the order things happen in (below). The one
change in code that could be seen is that `Reader.turn` no longer checks `t.to !== 'score'` twice.

## The parts

Each part is a class in a file of its own in `src/reader/`, with a leading underscore (internal to
`reader/`). Each owns the state listed, and nothing else holds or changes that state.

| Part | File | Owns | Does |
| --- | --- | --- | --- |
| `StageZoom` | `_stage-zoom.ts` | `zoom`, `minScale` | The screen's zoom and its transform; the view below the toolbar; placing a new screen; the smallest zoom as the toolbar shows and hides |
| `ToolDesk` | `_tool-desk.ts` | the lend stack, the tools' telling queue, the tools, their button faces, the tools' settings, the selection | Equipping, lending and unequipping tools; the selection and ending it; the tools' chrome layers; the tools' settings; making each tool's host |
| `Screen` | `_screen.ts` | the slots, the page canvases drawn for them, the screen's sequence number, the abort controller for drawing ahead, how many frames the screen shows, whether it is asking for access | Drawing a screen of frames (stand-ins first, then sharp), the screen of a score that can't be shown, drawing frames and their ink, the frozen layout while a cut is dragged, drawing the next screens ahead |
| `Pager` | `_pager.ts` | the item read (`k`), its frames, the first frame on the screen, whether an item is opening (and its sequence number), the score offered past a score's end | Going to an item and a screen; turning; offering and opening the library's next score; a setlist relisted; where to go after an edit; remembering where it was read |
| `Changes` | `_changes.ts` | undo history, the `Saver` | Taking an edit (undo step, carrying it through `Reading`, saving, showing it); the eraser's sweep; undo and redo; saving |
| `FolderAccess` | `_access.ts` | nothing | Whether what is read can be read from its files, and asking for access to the scores folder from a tap |
| `Reader` | `reader.ts` | the DOM root, the theme before, the wake lock, the resize timer and observer, the files changed, whether Back leaves without saving | Making and joining the parts; opening and closing; full screen, the wake lock, Back and leaving the app; the toolbar's state (`syncBar`), the title and the score card; showing and hiding the toolbar |

Two pure modules go with them, unit tested:

- `_landing.ts`: where the reader goes after a change: whether an edit moved the music
  (`sameLayout`), which screen then shows (`afterEdit`), where a score's last screen starts
  (`lastScreenStart`), and which entry a relisted setlist reads (`relistTarget`).
- What is already pure stays where it is: `_reading.ts`, `_turning.ts`, `_lending.ts`,
  `_last-read.ts`, `_history.ts`, `_open-scores.ts`.

The existing parts the reader joins keep their files and interfaces: `CutEditor`
(`_cuts/_editor.ts`), `Input` (`_input.ts`), `CloseUp` (`_close-up.ts`), `Loupe` (`_loupe.ts`),
`Toolbar` (`_toolbar.ts`), `ReaderMenus` (`_toolbar-menus.ts`), the tools (`tools/`), `OpenScores`
and `Reading`. `ReaderView` (`_view.ts`), `ToolHost`, `HandHost`, `InputHost`, `EditorHost` and
`MenusHost` keep their shape: the reader builds them from the parts.

## Who may call whom

The parts form layers. A part may hold a part in a lower row and call what it offers; it reaches a
part in its own row or a higher one only through a callback in its host.

| Row | Parts |
| --- | --- |
| 4 | `Reader` |
| 3 | `Changes`, `FolderAccess` |
| 2 | `Pager` |
| 1 | `Screen` |
| 0 | `StageZoom`, `ToolDesk` |

So `Screen` holds the `StageZoom`, `Pager` holds the `Screen` and the `ToolDesk`, `Changes` holds the
`Pager` and `Screen`, and `FolderAccess` holds the `Pager` and `Screen`. Everything else goes
through host callbacks the `Reader` gives.

Rules:

- **Each part's host is an interface in its own file**, named `<Part>Host`, listing only what it
  calls, as `EditorHost` and `MenusHost` do now. The `Reader` builds each one, with arrow functions
  where it needs a part made later.
- **No part reads or writes another's fields.** What a part offers is its methods and read-only
  getters; nothing outside it assigns to them.
- **The `OpenScores` and `Reading` are shared**, as now: the `Reader` makes them and passes them to
  the parts that need them. Only `Pager` calls `OpenScores.ensure`, `keepNear` and `adopt`; only
  `Changes` and the menus change what the `Reading` holds.
- **No part keeps another's state in a copy.** For example, the screen asks the `Pager` for the
  frames each time, as `ReaderView` asks the reader now.

## What each part offers

Public surface only; the exact signatures are in the plan.

- `StageZoom`: `zoom`, `minScale`, `view()`, `set(z)`, `placeFresh()`, `reset()`, `barChanged()`.
- `ToolDesk`: `tools`, `handHost`, `active`, `selected`, `settings`; `setTool`, `useTool`,
  `panel`, `select`, `keepSelected`, `deselect`, `refreshSelection`, `deleteSelected`,
  `setThisTimeOnly`, `showLayers`, `drawChromes`, `sync`, `showFaces`, `finish`.
- `Screen`: `slots`, `shown`, `show(options)`, `draw`, `drawInk`, `reframe`, `redraw`, `stop`.
- `Pager`: `k`, `items`, `frames`, `frame`, `loading`, `current`; `framesFor`, `goTo`, `turn`,
  `relisted`, `replay`, `relayout`, `saveSpot`, `stop`.
- `Changes`: `saver`, `canUndo`, `canRedo`; `commit`, `showSweep`, `endSweep`, `undo`, `redo`.
- `FolderAccess`: `readable`, `allow`, `withAccess`.

## Behaviour to keep exactly

These are the orderings and checks that make the reader work; the split keeps each.

- **A newer screen supersedes an older one.** `Screen.show` raises its sequence number and aborts
  drawing ahead before anything else; every await after it checks the number and gives back the
  draws it holds when it is stale. `Pager.goTo` has its own sequence number the same way, and
  returns when the reader has closed.
- **`loading`.** While `Pager.goTo` waits for a score to open, `Screen.show` does nothing and
  turning does nothing.
- **The order of a screen's showing:** title, the first draw of every page, the slots placed and
  drawn, the screen filled, placed fresh (unless kept), the cut editor's decoration, the tools'
  chrome, the selection checked, the page info, the score card, the place remembered, then drawing
  ahead and sharpening.
- **An edit that leaves the layout and the screen as they are only repaints the ink** (each slot
  takes its new frame, then the cut editor's decoration and the selection check); otherwise the
  screen is shown again, kept in place when it is the same screen.
- **`commit` order:** the selection (when the edit replaced it) is set first, then the undo step is
  recorded with the state before, then the `Reading` carries the edit, then the state is set and
  saved soon, then the toolbar synced, then the layout.
- **Closing:** tools are unequipped (Text finishes typing) and waited for, the overlay closed and
  the cut editor dismissed, the changes saved (staying open when that fails, as now), and only then
  everything else is torn down, in the order it is now.
- **Tools are told of stack changes one after another**, each waiting for the one before, and a
  newly equipped tool draws its chrome after `onEquipped`.
- **Undo across scores:** an undo entry holds the `OpenScore` it was made on; undoing one for
  another item sets that score's state, saves it, and goes to its item.

## Size

`reader.ts` ends up under 400 lines; no new file is over 300.

## Tests

The new pure functions in `_landing.ts` are unit tested. The classes use the DOM and are not; each
stage is tried in the running app (the plan lists what to try). The existing tests keep passing
unchanged, and `layers.test.ts` needs no change: every new file is in `reader/`.

## Docs

`ARCHITECTURE.md`, "The two screens", says what each part owns and does, and the rows above. Each
new module starts with a comment saying what belongs in it.

## Data

Nothing stored changes, and nothing is dropped.
