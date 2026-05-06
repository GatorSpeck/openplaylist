# Matching, Normalization, And Utility Helpers

This folder contains backend helpers that support matching, normalization, and performance instrumentation.

## Main Modules

- `match.py`: matching logic used when relating local tracks to remote or requested items
- `normalize.py`: normalization helpers for titles, artists, and other metadata fields
- `normalize_path.py`: path cleanup and normalization helpers
- `timing.py`: timing and profiling utilities

## Why This Area Matters

- Track sync quality depends heavily on normalization and matching behavior.
- Route handlers and repositories rely on these helpers to avoid duplicating fuzzy-match logic.
- Small changes here can have project-wide effects on import, sync, and discovery features.

## Editing Guidelines

- Favor deterministic transformations over one-off route-specific adjustments.
- Preserve backwards-compatible normalization where possible.
- Test any matching changes against realistic ambiguous data, not only ideal cases.
