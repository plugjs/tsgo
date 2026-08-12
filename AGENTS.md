# Agent Instructions

## Formatting And Linting

- After every edit, run `npm run lintfix` to apply the repository's formatting and linting fixes. This applies to every change.

## Code And Test Changes

- When changing files under `src/` or `test/`, always run `npm run build fix=true` after the edits. This command checks types, runs tests and coverage, and formats/lints/fixes any inconsistencies.
