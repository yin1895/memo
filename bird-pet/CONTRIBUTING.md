# Contributing Guide

## Branch Strategy

1. Base branch for development is `dev`.
2. Create a dedicated branch for each change:
   - bug fix: `fix/<topic>`
   - feature: `feat/<topic>`
   - chore/docs/refactor: `chore/<topic>`
3. Merge into `dev` after local and CI checks pass.
4. Release merge from `dev` to `main` is handled separately.

## Commit Convention

Use concise conventional prefixes:

- `feat:` new feature
- `fix:` bug fix
- `refactor:` non-behavioral restructuring
- `test:` tests only
- `docs:` documentation only
- `chore:` build/tooling/config

## Required Checks Before Merge

Run the following in `bird-pet/`:

```bash
npm run check
npm run build
```

Run Rust checks in `bird-pet/src-tauri/`:

```bash
cargo check
```

## CI Policy

PRs to `dev`/`main` are validated by GitHub Actions:

1. frontend: format, lint, typecheck, test, build
2. rust: `cargo check`

Do not merge if CI is red.

## Testing Guidance

1. Add or update tests for behavior changes.
2. Prefer existing test patterns (`vi.mock` for Tauri APIs).
3. Use `npm run test:coverage` to inspect coverage changes.
