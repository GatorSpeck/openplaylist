# Feature Specification: Last.fm Metadata Fetching

**Feature Branch**: `004-lastfm-metadata-fetching`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "Specify metadata fetching powered by Last.fm for enrichment, caching, and reliable fallback behavior"

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

### User Story 1 - Enrich Track Metadata From Last.fm (Priority: P1)

A user views a local track or playlist entry and wants enriched metadata sourced
from Last.fm, such as album art, normalized tags/genres, and popularity context,
to improve browsing and curation quality.

**Why this priority**: Metadata enrichment is the primary value of this feature
and unlocks better search, filtering, and playlist management workflows.

**Independent Test**: Open a track that has minimal local metadata, trigger
enrichment, and confirm new Last.fm-derived metadata appears without modifying
immutable file metadata.

**Acceptance Scenarios**:

1. **Given** a track with artist/title metadata, **When** enrichment is
  requested, **Then** Last.fm metadata is fetched and attached to the editable
  track representation.
2. **Given** Last.fm returns album art and tags, **When** enrichment completes,
  **Then** the user can view those fields in the app.
3. **Given** immutable file metadata exists, **When** enrichment is applied,
  **Then** only editable metadata fields are updated.

---

### User Story 2 - Use Cached Metadata for Fast Repeat Access (Priority: P1)

A user repeatedly opens tracks and playlists and expects metadata to appear
quickly without waiting on repeated Last.fm requests for the same items.

**Why this priority**: Caching is required to keep the UI responsive and to
avoid avoidable Last.fm rate-limit pressure.

**Independent Test**: Request enrichment for the same track twice and confirm
the second request is served from cache with significantly lower latency.

**Acceptance Scenarios**:

1. **Given** metadata was fetched recently, **When** enrichment is requested
  again, **Then** cached data is used instead of a new Last.fm call.
2. **Given** cached metadata is expired, **When** enrichment is requested,
  **Then** fresh metadata is fetched and cache is refreshed.
3. **Given** Last.fm is temporarily unavailable, **When** a cached value exists,
  **Then** stale-but-usable metadata is shown with clear freshness status.

---

### User Story 3 - Handle Missing/Uncertain Matches Gracefully (Priority: P2)

A user enriches tracks with ambiguous names and expects the system to avoid
incorrect metadata attachments when Last.fm confidence is low.

**Why this priority**: Incorrect enrichment degrades trust and can corrupt user
curation decisions more than missing enrichment.

**Independent Test**: Enrich ambiguous tracks with similar artist/title variants
and confirm low-confidence matches are flagged rather than auto-applied.

**Acceptance Scenarios**:

1. **Given** multiple plausible Last.fm matches, **When** confidence is below
  threshold, **Then** metadata is not auto-applied and result is flagged.
2. **Given** no Last.fm match exists, **When** enrichment is requested,
  **Then** the user sees a non-fatal "no metadata found" status.
3. **Given** a high-confidence match exists, **When** enrichment runs,
  **Then** metadata is applied automatically.

---

### User Story 4 - Enrich in Bulk Without Blocking Core Workflows (Priority: P2)

A user runs enrichment across many tracks and expects progress tracking and
non-blocking behavior so playlist editing and browsing remain usable.

**Why this priority**: Real-world libraries are large; bulk enrichment must be
operationally safe and user-friendly.

**Independent Test**: Start enrichment for a large set of tracks, verify progress
updates, and confirm other app operations remain responsive.

**Acceptance Scenarios**:

1. **Given** a bulk enrichment request, **When** processing starts,
  **Then** a trackable job/status is returned.
2. **Given** enrichment is running, **When** user navigates playlists/search,
  **Then** primary workflows remain responsive.
3. **Given** some tracks fail enrichment, **When** the job completes,
  **Then** successes and failures are reported separately.

---

### User Story 5 - Control Last.fm Usage and Visibility (Priority: P3)

A user/admin wants clear controls over Last.fm integration status and metadata
freshness so they can manage API usage and diagnose enrichment behavior.

**Why this priority**: Operational transparency reduces confusion when metadata
appears stale or incomplete and supports supportability.

**Independent Test**: Verify settings/status views show Last.fm enabled state,
cache freshness indicators, and recent enrichment outcomes.

**Acceptance Scenarios**:

1. **Given** Last.fm is configured, **When** user checks integration status,
  **Then** enabled/disabled and connectivity state are visible.
2. **Given** cached metadata exists, **When** user views metadata fields,
  **Then** freshness/last-updated information is available.
3. **Given** enrichment failures occurred, **When** user reviews job results,
  **Then** failure reasons are visible per affected track.

---

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- Last.fm returns no result for a valid local track.
- Last.fm returns multiple candidates with close similarity scores.
- Artist/title includes punctuation, featuring variants, or non-ASCII characters.
- Rate limiting or transient network errors occur during batch enrichment.
- Cached metadata exists but is partially missing some fields.
- Track metadata changes locally after enrichment was cached.
- Album art URL becomes invalid after initial fetch.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: The system MUST fetch metadata from Last.fm using available local
  identifiers/fields (at minimum artist and title).
- **FR-002**: Enriched metadata MUST be written only to editable track metadata
  fields and MUST NOT overwrite immutable file metadata.
- **FR-003**: The system MUST support enrichment for both single-track and bulk
  track requests.
- **FR-004**: Bulk enrichment MUST run asynchronously and provide progress/status
  visibility.
- **FR-005**: The system MUST cache Last.fm responses for repeat requests.
- **FR-006**: Cached metadata MUST include freshness metadata (last fetched
  timestamp) and a validity window.
- **FR-007**: The system MUST re-fetch metadata when cached values are expired.
- **FR-008**: If Last.fm is unavailable, the system MUST return cached metadata
  when available, with stale status indicated.
- **FR-009**: The system MUST detect low-confidence or ambiguous matches and
  avoid automatic metadata application in those cases.
- **FR-010**: The system MUST return explicit per-track enrichment outcomes:
  enriched, no-match, ambiguous, cached, stale-cached, or failed.
- **FR-011**: Enrichment failures for individual tracks MUST NOT fail an entire
  bulk request.
- **FR-012**: The system MUST provide album art retrieval through Last.fm where
  available.
- **FR-013**: The system MUST provide Last.fm-derived tags/genres where available.
- **FR-014**: The system MUST expose Last.fm integration status (configured,
  reachable/unreachable) to the user-facing settings/status view.
- **FR-015**: The system MUST allow manual re-enrichment of a track to refresh
  metadata even when cache exists.
- **FR-016**: For up to 50,000 library tracks, initiating a bulk enrichment job
  MUST return control to the user within 2 seconds in typical conditions.
- **FR-017**: For cached single-track enrichment requests, metadata response MUST
  be available within 1 second in 95% of requests.
- **FR-018**: For uncached single-track enrichment requests, metadata response
  MUST be available within 5 seconds in 95% of requests when Last.fm is healthy.

### Key Entities *(include if feature involves data)*

- **Enrichment Request**: User-initiated request describing one or many tracks
  to enrich and execution mode (single/bulk).
- **Enrichment Result**: Per-track outcome including status, confidence,
  metadata payload, and error reason when applicable.
- **Metadata Cache Entry**: Cached Last.fm response content plus freshness
  metadata and expiration policy context.
- **Last.fm Match Candidate**: Candidate mapping between local track fields and
  Last.fm result, including confidence score.
- **Enrichment Job**: Asynchronous bulk processing unit with progress,
  completion state, success/failure counts, and timestamps.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: 95% of cached single-track enrichment requests return visible
  metadata within 1 second.
- **SC-002**: 95% of uncached single-track enrichment requests return visible
  metadata within 5 seconds when Last.fm is healthy.
- **SC-003**: At least 90% of enrichable tracks in a representative library are
  enriched with at least one additional Last.fm field (art, tag, or normalized
  metadata).
- **SC-004**: 100% of bulk enrichment runs provide per-track outcome status and
  do not fail completely due to isolated per-track errors.
- **SC-005**: In repeated access scenarios, cache reuse reduces external Last.fm
  requests by at least 60% versus uncached baseline behavior.

## Assumptions

- Last.fm API credentials are configured through existing settings mechanisms.
- Existing caching infrastructure (Redis/session cache) is available.
- Metadata enrichment augments user-editable metadata only.
- 50,000 tracks is a target operating envelope, not a hard cap.

## Out of Scope

- Replacing local metadata as the system of record.
- Building a new third-party metadata provider abstraction in this feature.
- Full manual metadata editing UX redesign outside enrichment touchpoints.
