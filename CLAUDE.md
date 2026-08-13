# CLAUDE.md

The working agreement for this repo lives in one place so it cannot drift:

@AGENTS.md

Two things worth repeating, because they are the ones most often skipped:

1. **Features ship with their README entry in the same change.** If you add,
   remove, or meaningfully change anything a user could notice — UI, shortcuts,
   file output, setup requirements — update `README.md` before you call the
   task done. See the "Non-negotiable: features ship with docs" section in
   `AGENTS.md`.

2. **Verify before you claim.** `npm test`, `npm run typecheck`, and
   `npm run check:electron` all have to pass. Run them and read the output —
   do not report success on unverified work.
