# Alembic Migrations

This folder holds Alembic migration infrastructure and versioned schema changes.

## Structure

- `env.py`: migration environment setup
- `script.py.mako`: migration file template
- `versions/`: generated migration revisions
- `README`: legacy Alembic readme file

## Workflow

Create migration:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
```

Apply migrations:

```bash
cd backend
alembic upgrade head
```

## Notes

- Keep migrations idempotent when practical.
- Prefer compatibility with SQLite and MySQL/MariaDB unless a change requires otherwise.
