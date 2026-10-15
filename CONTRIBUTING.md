# Contributing

Use Node.js 24 and install with `npm ci`. Run `npm run check` before proposing a change. Source files use TypeScript, two-space indentation and Prettier.

Keep parsing, mapping and inference in `src/core/`; keep React interaction state in the hook/components. Missing data must stay unknown. Never use imported candidate values to fill inferred solver values.

For a mapping or inference issue, provide the game language/version, emulator or hardware, observation JSON, exact supplied facts and expected byte offsets. An encrypted 80-byte record is helpful when it can be shared. Do not attach ROMs, complete save files or savestates.

Changes to inferred guarantees need tests against an independent oracle or fixed external evidence. A renderer/solver round trip alone does not prove the in-game mapping. Keep source-derived mappings separate from runtime-configuration assumptions.

The source package intentionally excludes local capture folders, private handoff notes and development backups. Preserve minimal deterministic fixtures needed by the tests.
