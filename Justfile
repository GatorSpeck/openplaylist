set shell := ["bash", "-uc"]

clean:
    # clean up orphaned frontend/backend
    sudo fuser -k 3009/tcp || true
    sudo fuser -k 3007/tcp || true

[working-directory: 'backend']
@test_backend:
    pytest

[working-directory: 'frontend']
@test_frontend:
    npm test

test:
    just test_backend
    just test_frontend
