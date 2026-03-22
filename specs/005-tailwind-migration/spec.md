# Feature Specification: Tailwind CSS Migration

**Feature Branch**: `005-tailwind-migration`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "Convert the frontend to use the Tailwind CSS framework for better composition, deduplication, dark mode support, and improved responsiveness."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dark Mode Support (Priority: P1)

A user opens the application at night and the UI renders in a dark colour scheme that is easy on the eyes. They can also explicitly toggle the mode from within the app, and their preference is remembered the next time they visit.

**Why this priority**: Dark mode is a direct, user-visible outcome of the migration and one of the primary motivations listed for undertaking it. Delivering dark mode independently demonstrates the migration has produced a tangible benefit.

**Independent Test**: Can be fully tested by opening the app with a system dark-mode preference active and verifying all screens render with dark backgrounds, readable text, and no raw-white or raw-black elements leaking through. The user-controlled toggle can be tested separately by switching it and refreshing.

**Acceptance Scenarios**:

1. **Given** the user's operating system is set to dark mode, **When** they open the application, **Then** all screens immediately display in the dark colour scheme without any white flash.
2. **Given** the app is open, **When** the user activates the light/dark toggle, **Then** the entire UI switches scheme instantly without a page reload.
3. **Given** the user previously selected dark mode via the toggle, **When** they return to the app in a later session, **Then** their preference is applied automatically.
4. **Given** dark mode is active, **When** the user navigates between the playlist view, search panel, and settings, **Then** all screens remain styled consistently in the dark scheme.

---

### User Story 2 - Responsive Layout on Mobile and Tablet (Priority: P1)

A user accesses the music library from a phone or tablet. All key screens — the playlist grid, search panel, and sidebar — adjust to fit the smaller screen without horizontal scrolling or overlapping elements.

**Why this priority**: Responsiveness is explicitly listed alongside dark mode as a primary motivation. Broken layouts on smaller screens are a usability blocker, so this is P1.

**Independent Test**: Can be fully tested by resizing the browser window or using mobile emulation to viewport widths from 320px to 768px and confirming all interactive elements are reachable and readable.

**Acceptance Scenarios**:

1. **Given** a screen width of 375px, **When** the playlist view loads, **Then** the grid columns collapse to fit the screen with no horizontal overflow.
2. **Given** a screen width of 375px, **When** the user opens the sidebar navigation, **Then** it displays as a full-width overlay or drawer rather than a side panel.
3. **Given** a screen width of 768px, **When** the user interacts with modals (edit item, match track, etc.), **Then** the modals fit within the viewport with scrollable content if needed.
4. **Given** a large desktop screen (1440px+), **When** the user views the app, **Then** the layout makes full use of the available width without the content area being artificially constrained.

---

### User Story 3 - Visual Consistency Across All Screens (Priority: P2)

A developer or designer reviews the application and observes that spacing, typography, colours, and interactive-state styling are consistent across every screen. Elements of the same type (buttons, inputs, labels) look and behave the same regardless of which screen they appear on.

**Why this priority**: Currently, duplicated and divergent CSS rules produce inconsistent visuals. This story delivers the composition and deduplication goals. It is P2 because the app remains functional without it, but it is essential for long-term quality.

**Independent Test**: Can be tested by comparing button appearance, input appearance, and spacing across the playlist view, search panel, settings page, and modals without auditing CSS files.

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When** common interactive elements (primary buttons, text inputs, icon buttons) appear on multiple different screens, **Then** they are visually identical in both light and dark modes.
2. **Given** the migration is complete, **When** any page is loaded, **Then** there are no styling artefacts such as unstyled fallback colours, misaligned text, or layout shifts that were absent before migration.
3. **Given** the app is viewed in both light and dark mode, **When** comparing the same screen side by side, **Then** all foreground/background colour pairs meet accessible contrast ratios.

---

### User Story 4 - Developer Adds New UI Feature Without Writing Custom CSS (Priority: P2)

A developer building a new screen or component is able to fully style it using only design-system utility classes available from the styling framework. They do not need to create a new CSS file or append rules to an existing one to achieve the desired look.

**Why this priority**: This captures the composition and deduplication goals at the developer workflow level. It is P2 because existing users are unaffected, but it is critical for the long-term maintainability motivation.

**Independent Test**: Can be demonstrated by having a developer build a small new UI element (e.g., a new modal or a status badge) and verifying no new CSS file was created and no existing CSS file was modified.

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When** a developer needs a new button variant, **Then** it can be assembled from existing utility classes without writing custom stylesheet rules.
2. **Given** the migration is complete, **When** the project's style configuration is reviewed, **Then** the design tokens (colours, spacing scale, typography scale, border radii) are defined in a single central configuration, not scattered across multiple CSS files.
3. **Given** dark mode is enabled, **When** a developer adds a new component using standard utility classes, **Then** the component inherits dark mode styling automatically without any additional dark-mode-specific code.

---

### User Story 5 - Legacy CSS Files Are Eliminated (Priority: P3)

A developer auditing the project's frontend source finds that the 17 hand-crafted CSS files that existed prior to the migration have been removed (or reduced to only framework configuration). No component imports a bespoke stylesheet that duplicates or overrides the design system.

**Why this priority**: This is the clean-up outcome of the migration. The app works correctly before this is complete (P1/P2 stories suffice), but retaining legacy files negates the deduplication benefit over time.

**Independent Test**: Can be verified by searching the project for `.css` imports in component files and confirming the only CSS entry point is the global Tailwind base import.

**Acceptance Scenarios**:

1. **Given** all 17 existing CSS files, **When** migration is complete, **Then** each file has been audited and either deleted or consolidated into a central design-system configuration.
2. **Given** a component file that previously imported a local CSS file, **When** reviewed post-migration, **Then** the CSS import statement has been removed.
3. **Given** the project builds successfully post-migration, **When** a developer inspects the production CSS bundle, **Then** its size is not larger than the pre-migration bundle (and ideally smaller due to deduplication).

---

### Edge Cases

- How should dynamic inline styles that cannot be expressed as static utility classes (e.g., `gridTemplateColumns` calculated at runtime from user configuration) be handled?
- How should styles injected by third-party libraries (react-beautiful-dnd drag previews, react-window scroll containers) be handled when those libraries have their own hardcoded style attributes?
- What happens if a component requires a custom animation that is not available as a standard utility?
- How does the dark mode preference interact with components that embed external content (album art images, iframes)?
- How should print stylesheets, if any, be preserved or replicated?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All visual styling in the frontend MUST be expressed through utility-class-based styling sourced from a single, centrally-configured design system — not through bespoke per-component stylesheet files.
- **FR-002**: The design system MUST define a shared design token set covering: colour palette (including light and dark variants), typography scale, spacing scale, border radii, and shadow levels.
- **FR-003**: The frontend MUST support two colour schemes — light and dark — and MUST apply the active scheme consistently across every screen, modal, and overlay.
- **FR-004**: The system MUST detect the user's operating-system colour-scheme preference and apply it as the default scheme on first visit.
- **FR-005**: Users MUST be able to explicitly toggle between light and dark mode via a control within the application interface.
- **FR-006**: The user's colour-scheme preference MUST be persisted across browser sessions so it is automatically restored on subsequent visits.
- **FR-007**: All layouts MUST be responsive and MUST adapt without horizontal overflow at viewport widths of 320px, 375px, 768px, 1024px, and 1440px.
- **FR-008**: The sidebar navigation MUST collapse into a compact or drawer-style presentation on narrow viewports.
- **FR-009**: All modals MUST be scrollable on small viewports so that their content remains reachable regardless of screen height.
- **FR-010**: Every interactive element (buttons, inputs, checkboxes, links) MUST have explicitly styled hover, focus, active, and disabled states in both colour schemes.
- **FR-011**: All foreground/background colour pairs used for text and interactive controls MUST meet WCAG AA contrast requirements in both light and dark schemes.
- **FR-012**: Dynamic style values that cannot be expressed as static utility classes (e.g., grid column widths calculated from user configuration) MUST be handled via scoped inline styles or CSS custom properties, not by adding bespoke stylesheet rules.
- **FR-013**: Styles applied by third-party libraries MUST be overridden or augmented only through the design system's configuration layer, not through ad-hoc inline override rules within component markup.
- **FR-014**: The migration MUST preserve visual parity with the pre-migration light-mode design; intentional visual improvements are acceptable but a full visual redesign is out of scope.
- **FR-015**: All 17 pre-migration custom CSS files MUST be audited and either deleted or reduced to only framework configuration by the end of the migration.
- **FR-016**: Upon migration completion, no component file MUST import a bespoke per-component stylesheet.
- **FR-017**: The production CSS bundle size MUST NOT increase compared to the pre-migration baseline.
- **FR-018**: The migration MUST be executable incrementally, screen by screen, without breaking the production build at any intermediate step.

### Key Entities

- **Design Token Set**: The centrally-defined vocabulary of colours, spacing, typography, and radii used to style every component. Exists as a single source of truth replacing the dispersed per-file values in the 17 legacy CSS files.
- **Colour Scheme Preference**: A user-level setting that records whether the user prefers light mode, dark mode, or system default. Persisted across sessions and applied on load.
- **Component Style Contract**: The set of utility classes applied to a given UI element. Replaces the CSS class names and rules previously defined in separate stylesheet files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 17 pre-existing custom CSS files are deleted or replaced by design-system configuration, with zero bespoke per-component stylesheet imports remaining in the codebase.
- **SC-002**: Dark mode renders correctly on every screen with no unstyled (raw white or raw black) elements visible; verifiable by a manual screen-by-screen audit.
- **SC-003**: All major screens pass a WCAG AA colour contrast check in both light and dark modes with no failures.
- **SC-004**: The application layout at 375px viewport width has no horizontal scrollbar and all interactive controls are reachable, as confirmed by browser responsive-design tooling.
- **SC-005**: The production CSS bundle size is equal to or smaller than the pre-migration baseline measurement.

## Assumptions

- Tailwind CSS has been selected as the utility class framework; this selection is within scope for the implementation plan but the spec is agnostic to the exact version.
- The existing visual design (colours, spacing, typography) in light mode is the accepted baseline and does not require stakeholder sign-off before migration begins.
- No new screens or features will be added as part of this migration; scope is limited to restyling existing screens.
- "Near visual parity" is defined as: any differences in light mode are cosmetic improvements (better alignment, consistent spacing) rather than redesigns of individual screens.
- Browser support targets are the same as the existing frontend (modern evergreen browsers; no IE11).

## Out of Scope

- Rebuilding or redesigning any screen's information architecture or functionality.
- Migrating backend API styles or admin tooling.
- Adding new features (e.g., high-contrast accessibility mode, colour-blind theme) beyond light/dark mode.
- Introducing a component library (e.g., replacing existing custom components with a pre-built set).
- Automated visual regression testing infrastructure (manual audit is sufficient for this migration).
