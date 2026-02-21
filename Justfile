set shell := ["bash", "-uc"]

clean:
    # clean up orphaned frontend/backend
    fuser -k 3009/tcp || true
    fuser -k 3007/tcp || true

[working-directory: 'backend']
@test_backend:
    python3 -m venv .venv && . .venv/bin/activate && pytest

[working-directory: 'frontend']
@test_frontend:
    npm test

test:
    just test_backend
    just test_frontend
