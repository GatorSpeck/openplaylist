# UI Components

This folder contains React components organized by feature and responsibility.

## Feature Folders

- `playlist/`: playlist grid, editing, matching, and sync UI
- `nav/`: settings, navigation, and top-level controls
- `search/`: search surfaces and result interactions
- `job/`: background job status and progress surfaces
- `main/`: high-level page shell components
- `common/`: reusable cross-feature UI building blocks

## Notes

- Keep shared primitives in `common/`.
- Keep domain-heavy behavior close to feature folders.
