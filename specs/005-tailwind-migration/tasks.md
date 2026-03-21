---
description: "Task list for Tailwind CSS Migration"
---

# Tasks: Tailwind CSS Migration

**Input**: Design documents from `/specs/005-tailwind-migration/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Tailwind Installation)

**Purpose**: Install and wire up Tailwind CSS in the Vite/React project without disturbing any existing styles.

- [x] T001 Install Tailwind CSS, PostCSS, and Autoprefixer into `frontend/` (`package.json` + `package-lock.json`)
- [x] T002 Create `frontend/postcss.config.js` with Tailwind and Autoprefixer plugins
- [x] T003 Create `frontend/tailwind.config.js` — enable `darkMode: 'class'`, set `content` paths to all `src/**/*.{js,jsx,ts,tsx}`, disable `corePlugins.preflight` (MUI coexistence), add placeholder `theme.extend` stub
- [x] T004 Measure and record the pre-migration production CSS bundle size as baseline in `specs/005-tailwind-migration/plan.md`

**Checkpoint**: `npm run build` in `frontend/` still succeeds with no style regressions; Tailwind is installed but no classes applied yet.

---

## Phase 2: Foundational (Design Tokens + Theme Infrastructure)

**Purpose**: Define the single source of truth for all design tokens and bootstrap the dark-mode context that all user stories depend on. No user story can be completed until this phase is finished.

**⚠️ CRITICAL**: All user story phases depend on this phase being complete.

- [x] T005 Populate `frontend/tailwind.config.js` `theme.extend` with full design token set: colour palette (accent, surface, surface-subtle, surface-dark, text, text-dark, border, row-alt), spacing scale, typography scale (font sizes, weights, line heights), border radii, and box-shadow levels — mapped from values in the 17 legacy CSS files
- [x] T006 Replace the content of `frontend/src/styles/index.css` with Tailwind directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`) plus only the global resets and font declarations that were in the old file (body font-family, box-sizing, margin: 0) expressed via `@layer base`
- [x] T007 Create `frontend/src/contexts/ThemeContext.tsx` — exports `ThemeProvider` component and `useTheme()` hook; reads OS preference via `prefers-color-scheme`, reads/writes user override to `localStorage`, syncs `dark` class on `<html>` element
- [x] T008 Create `frontend/src/components/common/DarkModeToggle.tsx` — a button that calls `useTheme()` to toggle between light and dark; displays a sun/moon icon
- [x] T009 Update `frontend/src/App.jsx` to wrap the entire tree in `<ThemeProvider>` and insert `<DarkModeToggle>` in the top-level nav bar area

**Checkpoint**: App builds and runs; OS dark-mode preference sets a `dark` class on `<html>` (verify in DevTools); toggle button is visible and switches the class; preference survives a page refresh.

---

## Phase 3: User Story 1 — Dark Mode (Priority: P1) 🎯

**Goal**: Every screen in the application renders correctly in both light and dark colour schemes, with no unstyled or raw-colour elements leaking through.

**Independent Test**: Set OS to dark mode → open app → visually inspect Playlist view, Search panel, Settings modal, and Job tracker; all must display with dark backgrounds and readable text. Repeat with the in-app toggle.

### G1 — App Shell

- [x] T010 [P] [US1] Migrate `frontend/src/App.jsx` to Tailwind layout classes (top-level flex/grid, background, text colour); remove `frontend/src/App.css` import (keep the file until T066)
- [x] T011 [P] [US1] Migrate `frontend/src/styles/index.css` body/root rules to `@layer base` inside the already-updated index.css (Task T006 output); ensure `bg-surface dark:bg-surface-dark` applies at document level

### G2 — Layout / Navigation

- [x] T012 [US1] Migrate `frontend/src/components/nav/PlaylistSidebar.tsx` to Tailwind; add `dark:` variants for all background, text, and border classes; remove `frontend/src/styles/PlaylistSidebar.css` import
- [x] T013 [P] [US1] Migrate `frontend/src/components/main/Playlists.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/Playlists.css` import

### G3 — Core Playlist View

- [ ] T014 [US1] Migrate `frontend/src/components/playlist/PlaylistGrid.tsx` to Tailwind; retain `style={{ gridTemplateColumns: getGridTemplate() }}` inline prop for runtime column widths; add dark variants for grid, row, zebra, header, controls; remove `frontend/src/styles/PlaylistGrid.css` import
- [x] T015 [P] [US1] Migrate `frontend/src/components/playlist/PlaylistEntryRow.tsx` to Tailwind; add dark variants for row background, selected state, hover state; no separate CSS file to remove (styles were in PlaylistGrid.css)
- [x] T016 [P] [US1] Migrate `frontend/src/components/EntryTypeBadge.tsx` to Tailwind with dark variants
- [x] T017 [P] [US1] Migrate `frontend/src/components/playlist/AlbumArtGrid.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/AlbumArtGrid.css` import
- [x] T018 [P] [US1] Migrate `frontend/src/components/playlist/AnniversaryTimeline.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/AnniversaryTimeline.css` import

### G4 — Generic Modals

- [x] T019 [US1] Migrate `frontend/src/components/common/Modal.jsx` to Tailwind; add dark variants for overlay, panel, header, close button; remove `frontend/src/styles/Modal.css` import
- [x] T020 [P] [US1] Migrate `frontend/src/components/common/BaseModal.tsx` to Tailwind with dark variants (inherits from Modal — verify no double-styling)
- [x] T021 [P] [US1] Migrate `frontend/src/components/common/TrackDetailsModal.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/TrackDetailsModal.css` import

### G5 — Playlist Modals

- [x] T022 [P] [US1] Migrate `frontend/src/components/playlist/EditItemModal.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/EditItemModal.css` import
- [x] T023 [P] [US1] Migrate `frontend/src/components/playlist/MatchTrackModal.tsx` to Tailwind with dark variants
- [x] T024 [P] [US1] Migrate `frontend/src/components/playlist/MatchAlbumModal.tsx` to Tailwind with dark variants
- [x] T025 [P] [US1] Migrate `frontend/src/components/playlist/DuplicateSelectionModal.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/DuplicateSelectionModal.css` import
- [x] T026 [P] [US1] Migrate `frontend/src/components/playlist/SelectPlaylistModal.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/SelectPlaylistModal.css` import
- [x] T027 [P] [US1] Migrate `frontend/src/components/playlist/SyncConfig.tsx` to Tailwind; add dark variants; remove `frontend/src/components/playlist/SyncConfig.css` import
- [x] T028 [P] [US1] Migrate `frontend/src/components/playlist/SyncLogModal.tsx` to Tailwind; add dark variants; remove `frontend/src/components/playlist/SyncLogModal.css` import
- [ ] T029 [P] [US1] Migrate `frontend/src/components/playlist/PlaylistAutoSyncDialog.tsx` to Tailwind with dark variants

### G6 — Nav Modals

- [ ] T030 [P] [US1] Migrate `frontend/src/components/nav/SettingsModal.tsx` to Tailwind with dark variants
- [ ] T031 [P] [US1] Migrate `frontend/src/components/nav/ImportPlaylistModal.tsx` to Tailwind with dark variants
- [ ] T032 [P] [US1] Migrate `frontend/src/components/nav/LogsPanel.tsx` to Tailwind with dark variants
- [ ] T033 [P] [US1] Migrate `frontend/src/components/nav/ScheduledTasksPanel.tsx` to Tailwind with dark variants
- [ ] T034 [P] [US1] Migrate `frontend/src/components/nav/PathSelector.tsx` to Tailwind with dark variants
- [ ] T035 [P] [US1] Migrate `frontend/src/components/nav/RenameDialog.tsx` to Tailwind with dark variants

### G7 — Search

- [ ] T036 [US1] Migrate `frontend/src/components/search/SearchResultsGrid.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/SearchResultsGrid.css` import
- [ ] T037 [P] [US1] Migrate `frontend/src/components/search/LastFMSearch.tsx` to Tailwind; add dark variants; remove `frontend/src/styles/LastFMSearch.css` import
- [ ] T038 [P] [US1] Migrate `frontend/src/components/search/SearchResultContextMenu.tsx` to Tailwind with dark variants

### G8 — Jobs / Notifications

- [ ] T039 [P] [US1] Migrate `frontend/src/components/job/JobsPanel.tsx` to Tailwind with dark variants
- [ ] T040 [P] [US1] Migrate `frontend/src/components/job/JobTrackerDrawer.tsx` to Tailwind with dark variants
- [ ] T041 [P] [US1] Migrate `frontend/src/components/job/JobTrackerFab.tsx` to Tailwind with dark variants
- [ ] T042 [P] [US1] Migrate `frontend/src/components/job/JobNotifications.tsx` to Tailwind with dark variants
- [ ] T043 [P] [US1] Migrate `frontend/src/components/job/JobActionsMenu.tsx` to Tailwind with dark variants

### G9 — Small / Shared

- [ ] T044 [P] [US1] Migrate `frontend/src/components/Snackbar.tsx` to Tailwind with dark variants
- [ ] T045 [P] [US1] Migrate `frontend/src/components/common/ContextMenu.tsx` to Tailwind with dark variants
- [ ] T046 [P] [US1] Migrate `frontend/src/components/common/SimilarTracksPopup.tsx` to Tailwind with dark variants

### US1 Validation

- [ ] T047 [US1] Audit all screens in dark mode: open each route and visually confirm no raw-white/raw-black elements remain; fix any outliers found

**Checkpoint**: US1 complete — dark mode works on all screens. OS preference is respected. Toggle switches theme. Preference persists across refresh.

---

## Phase 4: User Story 2 — Responsive Layout (Priority: P1)

**Goal**: All screens adapt cleanly to 320 px, 375 px, 768 px, 1024 px, and 1440 px viewports with no horizontal overflow.

**Independent Test**: Open Chrome DevTools responsive mode; set viewport to 375 px; navigate to playlist view, search panel, and settings; confirm no horizontal scrollbar and all controls are reachable. Repeat at 768 px and 320 px.

- [ ] T048 [US2] Add responsive grid column collapse to `frontend/src/components/playlist/PlaylistGrid.tsx` — on narrow viewports (`sm:` breakpoint) reduce visible columns to title + artist only; hide lower-priority columns
- [ ] T049 [US2] Implement mobile drawer behaviour for `frontend/src/components/nav/PlaylistSidebar.tsx` — on `sm:` breakpoints the sidebar renders as a full-width slide-over overlay triggered by a hamburger button; on `md:+` it renders as a fixed side panel
- [ ] T050 [P] [US2] Add `max-h-[90vh] overflow-y-auto` and responsive width/padding to all modal components (T019–T035 outputs) so modals fit and scroll on small viewports — update `frontend/src/components/common/Modal.jsx` base and verify all modals inherit it
- [ ] T051 [P] [US2] Ensure `frontend/src/components/search/SearchResultsGrid.tsx` collapses columns responsively on narrow viewports (matching PlaylistGrid pattern in T048)
- [ ] T052 [P] [US2] Audit `frontend/src/App.jsx` root layout — ensure it uses `flex-col sm:flex-row` or equivalent so sidebar and content stack vertically on mobile
- [ ] T053 [US2] Responsive audit: test every screen at 320 px, 375 px, 768 px, 1024 px, and 1440 px in Chrome DevTools; fix any overflow or misalignment found

**Checkpoint**: US2 complete — app is fully responsive with no horizontal overflow at any target viewport width.

---

## Phase 5: User Story 3 — Visual Consistency (Priority: P2)

**Goal**: Buttons, inputs, and typography look identical across all screens in both colour schemes.

**Independent Test**: Open playlist view and search panel side by side; compare primary buttons, text inputs, and heading typography — they must be visually identical.

- [ ] T054 [US3] Create reusable Tailwind component class groups in `frontend/tailwind.config.js` (or a `frontend/src/styles/components.css` `@layer components` block): `btn-primary`, `btn-secondary`, `btn-icon`, `input-base`, `label-base` — apply these class groups to replace any remaining ad-hoc button/input styling across all migrated components
- [ ] T055 [P] [US3] Audit all button elements across all component files for inconsistent padding, border-radius, or colour — normalise to `btn-primary` / `btn-secondary` / `btn-icon` as appropriate
- [ ] T056 [P] [US3] Audit all text input elements across all component files — normalise to `input-base`
- [ ] T057 [P] [US3] Audit typography across all screens (headings, body text, labels, placeholder text) — normalise font-size, weight, and line-height to design token values
- [ ] T058 [US3] Verify WCAG AA contrast for all foreground/background colour pairs in both light and dark schemes; fix any failing pairs by adjusting tokens in `tailwind.config.js`

**Checkpoint**: US3 complete — all common UI elements are visually consistent; WCAG AA passes in both schemes.

---

## Phase 6: User Story 4 — Developer Workflow (Priority: P2)

**Goal**: A developer can add a new component using only Tailwind classes with no new CSS files needed.

**Independent Test**: Build a minimal new badge component using only Tailwind utility classes; confirm the build succeeds, no CSS file was created, and dark mode applies automatically.

- [ ] T059 [US4] Confirm all design tokens in `frontend/tailwind.config.js` are self-documenting (add inline comments for each token group: colours, spacing, typography, radii)
- [ ] T060 [P] [US4] Update `CONTRIBUTING.md` (repo root) with a "Frontend Styling" section documenting: how to use Tailwind classes, how to use the `btn-primary` / `input-base` component class groups, how dark mode works, and what to do with runtime dynamic styles
- [ ] T061 [P] [US4] Ensure `frontend/src/contexts/ThemeContext.tsx` is exported from a barrel file or clearly documented so new components can access `useTheme()` without hunting for the import path

**Checkpoint**: US4 complete — `CONTRIBUTING.md` documents the styling workflow; no new CSS file is needed for a new component.

---

## Phase 7: User Story 5 — Legacy CSS Elimination (Priority: P3)

**Goal**: All 17 pre-migration CSS files are deleted and no component imports a bespoke stylesheet.

**Independent Test**: Run `grep -r "import.*\.css" frontend/src/` — the only result should be `main.jsx` importing `styles/index.css`.

- [ ] T062 [US5] Verify all CSS imports have been removed from component files (grep check); fix any remaining imports missed in Phase 3
- [ ] T063 [US5] Delete all 17 legacy CSS files:
  - `frontend/src/App.css`
  - `frontend/src/components/playlist/SyncConfig.css`
  - `frontend/src/components/playlist/SyncLogModal.css`
  - `frontend/src/styles/AlbumArtGrid.css`
  - `frontend/src/styles/AnniversaryTimeline.css`
  - `frontend/src/styles/DuplicateSelectionModal.css`
  - `frontend/src/styles/EditItemModal.css`
  - `frontend/src/styles/LastFMSearch.css`
  - `frontend/src/styles/Modal.css`
  - `frontend/src/styles/PlaylistGrid.css`
  - `frontend/src/styles/PlaylistModal.css`
  - `frontend/src/styles/Playlists.css`
  - `frontend/src/styles/PlaylistSidebar.css`
  - `frontend/src/styles/SearchResultsGrid.css`
  - `frontend/src/styles/SelectPlaylistModal.css`
  - `frontend/src/styles/TrackDetailsModal.css`
  - (retain `frontend/src/styles/index.css` — now contains only Tailwind directives)
- [ ] T064 [US5] Run `npm run build` in `frontend/`; confirm zero errors and zero warnings about missing CSS files
- [ ] T065 [US5] Measure final production CSS bundle size; compare to pre-migration baseline recorded in T004; confirm it is equal or smaller; record result in `specs/005-tailwind-migration/plan.md`
- [ ] T066 [US5] Run all existing frontend tests (`npm test` in `frontend/`); confirm zero regressions

**Checkpoint**: US5 complete — all 17 legacy CSS files deleted, build passes, bundle size at or below baseline, all tests green.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T067 [P] Final dark mode smoke test across all routes — record any edge cases found and fix
- [ ] T068 [P] Final responsive smoke test at 375 px across all routes — record any edge cases found and fix
- [ ] T069 Run `npm run lint` in `frontend/`; fix any ESLint issues introduced during migration
- [ ] T070 [P] Review `frontend/tailwind.config.js` for unused token values and prune any not referenced in component files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (Tailwind must be installed)
- **Phase 3 (US1 — Dark Mode)**: Depends on Phase 2 — ThemeProvider must exist before components use `dark:` variants
- **Phase 4 (US2 — Responsive)**: Depends on Phase 3 — components must be on Tailwind before adding responsive breakpoint variants
- **Phase 5 (US3 — Visual Consistency)**: Depends on Phase 3 — component-class groups can only be applied after base migration
- **Phase 6 (US4 — Developer Workflow)**: Depends on Phases 2–5 — docs written after the system is complete
- **Phase 7 (US5 — Legacy Cleanup)**: Depends on Phases 3–5 — CSS files deleted only after all components are migrated
- **Phase 8 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1 Dark Mode)**: Can start after Phase 2 — no dependencies on US2-5
- **US2 (P1 Responsive)**: Can start during US1 for same components (add `sm:` variants at the same time as `dark:` variants) — fully independent of US3–5
- **US3 (P2 Visual Consistency)**: Can start after US1 components are migrated — independent of US2
- **US4 (P2 Developer Workflow)**: Can start once design tokens stabilise (after US3 audit)
- **US5 (P3 Legacy Cleanup)**: Must come last — deletes files

### Parallel Opportunities

Within each component group (G2–G9), all `[P]`-marked tasks can be worked on simultaneously by different developers. The groups themselves can also pipeline: while one developer works on G3 (PlaylistGrid), another can work on G4 (Modal components).

### Parallel Example: US1 Component Groups

```bash
# After completing Phase 2, these groups can run in parallel:
Developer A: T012-T013 (G2 nav)     Developer B: T014-T018 (G3 playlist)
             ↓                                    ↓
Developer A: T019-T021 (G4 modals)  Developer B: T022-T029 (G5 playlist modals)
             ↓                                    ↓
Developer A: T036-T038 (G7 search)  Developer B: T039-T046 (G8+G9 jobs/shared)
             ↓                                    ↓
                          T047 (US1 audit — sequential)
```

---

## Implementation Strategy

**MVP Scope (Phases 1–3 only)**: Install Tailwind, establish design tokens, wire dark mode, and migrate all components with `dark:` variants. Delivers User Story 1 (dark mode) fully and produces a near-complete migration baseline. The remaining phases (US2–5) are incremental enhancements on top.

**Recommended Sprint Order**:
1. Phase 1 + Phase 2 (setup takes ~1 day)
2. Phase 3, G1–G3 (app shell + core playlist — highest visibility)
3. Phase 3, G4–G9 (remaining components)
4. Phase 4 (responsive pass) in parallel with Phase 5 (consistency)
5. Phase 6 (developer docs)
6. Phase 7 (delete files) + Phase 8 (final smoke tests)
