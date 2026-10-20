# Mobile workspace and touch input

Updated 2026-10-20. This uses the existing workbench and deduction worker; it
adds no solver assumptions or investigation JSON fields.

At widths up to 900 CSS pixels, the workspace has a mobile-only **Curtain** tab
between Pokemon info and Investigate. The form and visual workspace share one
normally scrolling page rather than two viewport-height panels with nested
scrollbars. The four navigation buttons stay accessible while scrolling. On
larger screens the original split workspace and three tabs remain.

`useMobileLayout.ts` subscribes to a width media query with
`useSyncExternalStore`; the matching CSS breakpoint is in `workbench.css`.
Keyboard height changes do not switch views. The form and single canvas remain
mounted when switching to/from Curtain, preserving drafts, manual observations,
automatic predictions, history and selected pixels. Switching views creates no
observation evidence. Resizing back to desktop restores the split layout.

Mobile controls generally have a 44px minimum height, with 16px text in inputs,
numeric keyboards for decimal trainer IDs/EXP/levels/stats/PP and text entry for
hexadecimal PID. Game-name autocorrection is disabled. Small screens use two
primary form columns and stack stats, moves and optional controls. PP validation
has an inline alert after blur and an accessible description as well as its
existing hover explanation. Safe-area padding supports notched screens; browser
zoom remains enabled.

The mobile Curtain tab defaults to a fitted overview: the curtain is beside the
complete 80-byte grid, with the pixel inspector below both. The app heading and
file buttons are available under the other tabs to leave room for this view.
The autosave footer is also omitted in the fitted view; background calculation
and drawing-pause status appear above the curtain instead.
Drawing options and Recovered values expand below the core view. Within Drawing
options, **Larger drawing & byte targets** restores the spacious scrolling layout;
**Fit curtain, inspector & bytes** returns to the overview and closes the extras.

Curtain starts in Inspect mode on mobile. The Draw toggle explicitly enables
painting; Inspect and imported-record previews use `touch-action: pan-y
pinch-zoom`. Only editable drawing uses `touch-action: none`. Pointer presses on
non-data artwork no longer start a stroke. `recordStripLayout()` crops only
decorative context and neighboring records in the compact view, exposing the
same 160 main-record nibbles in an 8x20 viewport (160x400 bitmap). The original
14x26 viewport and artwork remain in the larger view and desktop. Tests check
each of the 160 pixels against the original placement, with no remapping or
missing main-record data. The existing contained-bitmap hit conversion handles
letterboxing and responsive sizes. Switching size preserves evidence and does
not finish a drawing or add observations.

Draw and Finish drawing stay together above the compact workspace, or
in the sticky toolbar in the larger view. Lines, Undo,
Redo and automatic-pixel display are under Drawing options. Actual painting
retains the existing prediction freeze and background-calculation pause until
Finish drawing, which opens the updated findings. Clicking toggles the visible
black/transparent state, including predicted and reference pixels; dragging
continues the starting color. Blank cells look transparent without immediately
becoming evidence. Finishing the full drawing confirms its remaining blanks,
excludes automatic predictions, preserves hidden neighbors and can be undone.
Finishing an experiment never fills its unexamined pixels. Mobile inspector details sit
directly below the curtain and bytes. The compact grid shows all 80 bytes in ten
rows without horizontal scrolling; its smaller digit buttons are for inspection,
and the larger view retains larger touch targets with a horizontally scrollable
byte grid. Short screens, long prediction/conflict explanations and expanded
extras may scroll rather than clipping data. Tables scroll within their regions.

Locate pixel opens Curtain with the selected target visible; in the larger view
it centers the target below the sticky controls. Back to experiment questions
returns to the pending test. Only the
existing explicit Black/Transparent answers become evidence. Main recommendation
explanations can be expanded instead of overwhelming the phone screen.

Validation: 175 automated tests and the TypeScript/Vite production build pass.
New regressions check scroll-versus-draw gesture policy without changing bitmap
geometry and keyboard/name-entry behavior. Connected Chrome production-preview
checks cover 320x740, 390x844, 768x1024 and 1440x900: no page-wide horizontal
overflow, mobile navigation, inline invalid PP feedback, pending-test reload,
target location/return/answer, Inspect keyboard safety, drawing pause/Undo/Finish,
and restoration of the desktop split view with one canvas. Test data and answers
were confined to an isolated localhost origin, not the user's investigation.
Viewport emulation does not constitute a physical iOS/Android hardware test.
