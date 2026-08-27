# Backend Scripts

This folder contains backend-specific maintenance scripts.

## Files

- `migrate_sqlite_to_mysql.py`: migration utility to move data from SQLite into MySQL/MariaDB
- `music_files.db`: local data artifact used by migration/testing workflows

## Notes

- Treat scripts here as operational tools, not request-time application code.
- Validate DB connection settings before running migration utilities.
