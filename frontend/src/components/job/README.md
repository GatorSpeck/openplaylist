# Jobs And Background Task Monitoring

This folder documents the UI for monitoring long-running background work.

## Scope

These components surface background progress and outcomes for operations such as:

- library scans
- playlist sync jobs
- other server-side background tasks exposed through the job tracker

## Main Responsibilities

- show active and completed jobs
- surface errors and completion states
- connect user-triggered operations with async backend work

## Editing Guidelines

- Keep job state labels consistent with backend job tracker statuses.
- Prefer polling or refresh behavior that is narrow and inexpensive.
- Make sure notifications in the playlist screen and settings screen still point users here when appropriate.
