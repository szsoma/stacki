# Terminal Panel Title Style

**Date:** 2026-08-04
**Status:** Approved for implementation

## Goal

Make the Stacki terminal panel title use the same text styling as the CMS
panel title while preserving the terminal panel's existing layout dimensions.

## Design

Keep the existing `terminal-header` markup and its 52px height and horizontal
spacing. Update only `.terminal-header h2` so its typography matches the
shared `.panel-header h2` rule:

- `font-size: 11.5px`
- `font-weight: 600`
- `color: var(--text)`
- `letter-spacing: 0.01em`

Do not replace the terminal header with `.panel-header`; that would also alter
its padding and height. Do not introduce a new global token for this single
alignment.

## Verification

Add a focused component assertion that the terminal heading remains present
with the terminal header structure. Run the focused `TerminalPanel` test,
then the full test suite and production build. Review the diff to confirm no
terminal behavior or layout dimensions changed beyond the requested title
typography.
