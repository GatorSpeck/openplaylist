# Feature Specification: Playlist Editing Panel

**Feature Branch**: `002-playlist-editing-panel`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "Add specification for playlist editing panel with rich grid, customizable columns, filtering, and ordering"

## Clarifications

### Session 2026-03-21

- Q: What scope should saved column preferences use? → A: Per-user, per-playlist column configuration.
- Q: How should manual reordering persistence work? → A: Auto-save each reorder operation immediately for now; an explicit Save mode may be added later as an optional behavior.
- Q: Should filtering/sorting be client-side or server-side authoritative? → A: Server-side filtering and sorting are authoritative behavior.
- Q: How should the panel behave when playlist data changes externally while open? → A: Auto-refresh and discard in-progress transient panel state.
- Q: On panel reopen, what state should persist? → A: Persist columns, filters, and sort state; always clear row selection.

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Browse and Edit Playlist Entries in a Rich Grid (Priority: P1)

A user opens a playlist and edits it through a table-like panel that displays key
track fields in rows and columns. The user can inspect entries quickly, select
tracks, and perform editing actions without leaving the panel.

**Why this priority**: This is the core workflow for playlist management. If the
grid is not usable, filtering and ordering features have no practical value.

**Independent Test**: Open a large playlist, verify row rendering, select one or
more tracks, apply an edit action, and confirm the playlist reflects the change.

**Acceptance Scenarios**:

1. **Given** a playlist with track entries, **When** the user opens the editing
  panel, **Then** entries are shown in a grid with one row per entry.
2. **Given** visible rows in the grid, **When** the user selects rows and
  applies an edit operation, **Then** only selected rows are changed.
3. **Given** a playlist with mixed local and requested entries, **When** the
  panel is opened, **Then** both entry types are represented consistently.

---

### User Story 2 - Customize Visible Columns (Priority: P1)

A user chooses which columns are visible in the playlist grid so the panel can
be tailored to their workflow, such as showing artist, title, album, duration,
service links, and requested status.

**Why this priority**: Customizable columns are part of the explicit request and
are essential for different user preferences and metadata-heavy workflows.

**Independent Test**: Hide two default columns, add two optional columns, reload
the playlist panel, and verify the chosen column set is preserved.

**Acceptance Scenarios**:

1. **Given** the grid is open, **When** the user toggles column visibility,
  **Then** the grid updates without losing current row selection.
2. **Given** a saved column configuration, **When** the user reopens the same
  playlist panel, **Then** the same column configuration is restored.
3. **Given** a column required for row identity, **When** the user attempts to
  hide all identifying columns, **Then** the system prevents an unusable view.

---

### User Story 3 - Filter Playlist Entries Quickly (Priority: P1)

A user applies one or more filters in the editing panel to narrow large
playlists down to relevant rows, such as artist contains, album equals,
requested-only, or unmatched-only.

**Why this priority**: Filtering is required to manage large playlists and to
support metadata curation without manual scanning.

**Independent Test**: Apply a text filter and a status filter together, verify
the resulting rows match both conditions, then clear filters and confirm full
list restoration.

**Acceptance Scenarios**:

1. **Given** a populated grid, **When** the user applies a single filter,
  **Then** only rows matching that filter remain visible.
2. **Given** multiple active filters, **When** the user applies an additional
  filter, **Then** visible rows satisfy all active filters.
3. **Given** filters are active, **When** the user clears filters, **Then** the
  full playlist view is restored.

---

### User Story 4 - Order Entries by Sort and Manual Reordering (Priority: P2)

A user needs predictable ordering controls: quick sort by one or more columns
for review tasks, and explicit manual reordering for final playlist sequence.

**Why this priority**: Ordering directly affects playback behavior and must be
controllable beyond simple display convenience.

**Independent Test**: Sort by artist then title, confirm deterministic order,
switch to manual reordering mode, move a row, and confirm saved playlist order
matches user intent.

**Acceptance Scenarios**:

1. **Given** the grid has visible rows, **When** the user sorts by a column,
  **Then** rows are displayed in the selected direction.
2. **Given** a secondary sort is applied, **When** rows share the same primary
  value, **Then** ties are resolved by the secondary sort.
3. **Given** manual reordering mode is active, **When** the user moves one or
  more entries, **Then** the persisted playlist sequence reflects the new order.
4. **Given** a filtered view, **When** manual reordering occurs, **Then** final
  persisted order is unambiguous and stable after filters are cleared.

---

### User Story 5 - Keep Performance Usable on Large Playlists (Priority: P2)

A user with a very large playlist expects the editing panel to remain responsive
while loading, filtering, sorting, and editing entries.

**Why this priority**: Performance is a key project value and directly affects
trust when managing tens of thousands of entries.

**Independent Test**: Open a large playlist, execute filter and sort actions,
and confirm interactive operations complete within target thresholds.

**Acceptance Scenarios**:

1. **Given** a playlist with 50,000 entries, **When** the panel opens,
  **Then** first visible rows are rendered within the performance target.
2. **Given** a large playlist view, **When** a filter is applied,
  **Then** the filtered result is visible within the performance target.
3. **Given** a large playlist view, **When** sort is changed,
  **Then** sorted rows are visible within the performance target.

---

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- The user hides most columns, leaving only minimal identifying data visible.
- The user applies a filter that returns zero rows.
- The user performs rapid successive reorder operations while filters or sort are changing.
- Two rows have identical values across visible sort columns.
- Filtering or sorting is changed while bulk row selection is active.
- The playlist updates externally while the panel is open.
- A requested entry lacks metadata fields used in filters.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: The playlist editing panel MUST present playlist entries in a grid
  with one row per entry and support row selection.
- **FR-002**: Users MUST be able to configure visible columns from an available
  column set and reorder visible columns.
- **FR-003**: The system MUST persist each user's column visibility and column
  order preferences per playlist for the playlist editing panel.
- **FR-004**: The grid MUST support text-based filtering on common metadata
  fields including title, artist, and album, with server-side evaluation as the
  authoritative result.
- **FR-005**: The grid MUST support attribute-based filtering for entry status,
  including at minimum local vs requested and matched vs unmatched.
- **FR-006**: Multiple simultaneous filters MUST be supported and combined using
  logical AND semantics.
- **FR-007**: Users MUST be able to clear all active filters in one action.
- **FR-008**: The grid MUST support sorting by at least one column in ascending
  or descending order, with server-side evaluation as the authoritative result.
- **FR-009**: The system MUST support multi-column sorting with deterministic tie
  handling under server-side query execution.
- **FR-010**: Users MUST be able to manually reorder playlist entries, and each
  reorder operation MUST be persisted immediately as the playlist's playback
  order.
- **FR-011**: The system MUST preserve stable, unambiguous ordering when manual
  reordering is performed from a filtered or sorted view.
- **FR-012**: Bulk actions performed from the panel MUST only affect rows that
  are currently selected by the user.
- **FR-013**: The panel MUST display a clear empty-state message when filters
  produce zero results.
- **FR-014**: The panel MUST remain usable with playlists up to 50,000 entries
  and MUST continue to function beyond that size even if performance degrades.
- **FR-015**: Opening the panel for a 50,000-entry playlist MUST render the first
  visible rows within 3 seconds in typical operating conditions.
- **FR-016**: Applying a single filter to a 50,000-entry playlist MUST update the
  visible grid within 2 seconds in typical operating conditions.
- **FR-017**: Changing sort order on a 50,000-entry playlist MUST update the
  visible grid within 2 seconds in typical operating conditions.
- **FR-018**: If the playlist changes externally while the panel is open, the
  panel MUST auto-refresh to current server state.
- **FR-019**: On external refresh, transient in-progress panel state (including
  active drag/reorder interactions and row selection) MUST be cleared before the
  refreshed state is shown.
- **FR-020**: On panel reopen, column configuration, filter state, and sort
  state MUST be restored, while row selection MUST be cleared.

### Key Entities *(include if feature involves data)*

- **Playlist Grid View**: The editable table representation of a playlist,
  including visible rows, active columns, active filters, active sort state, and
  current selection.
- **Column Configuration**: User-defined settings describing which columns are
  visible and in what order, scoped per user and per playlist.
- **Filter State**: The currently active filter criteria and values applied to
  the grid.
- **Sort State**: Ordered sort criteria including column and direction.
- **Manual Order Changeset**: The sequence of row move operations applied during
  immediate persistence to define playlist playback order.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: 95% of panel opens for playlists with up to 50,000 entries render
  first visible rows within 3 seconds.
- **SC-002**: 95% of single-filter operations on playlists with up to 50,000
  entries update visible results within 2 seconds.
- **SC-003**: 95% of sort changes on playlists with up to 50,000 entries update
  visible results within 2 seconds.
- **SC-004**: 100% of manual reordering save operations persist exact final
  playback order as confirmed on immediate reload.
- **SC-005**: At least 90% of users complete a common curation task (find,
  select, and reorder target tracks) without leaving the panel.

## Assumptions

- The panel is intended for authenticated users who can already edit playlists.
- Existing playlist entry metadata remains the source for grid display values.
- Preference persistence for columns is scoped per user and per playlist.
- Filtering and sorting semantics are evaluated server-side as authoritative;
  client-side state mirrors returned results.
- External playlist updates trigger automatic panel refresh and reset transient
  interaction state.
- On panel reopen, layout/query state (columns, filters, sort) is restored, and
  row selection resets.
- 50,000 entries is a target performance envelope, not a hard operational cap.
- Explicit save mode for reordering is deferred; current behavior is immediate
  persistence per reorder operation.

## Out of Scope

- Redesigning global navigation outside the playlist editing panel.
- Adding new metadata providers or changing external sync workflows.
- Introducing spreadsheet-style formula fields or computed user scripts.
