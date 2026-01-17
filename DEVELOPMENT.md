# OpenPlaylist Development Guide

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 18+
- npm or yarn
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/GatorSpeck/openplaylist.git
cd openplaylist

# Set up backend
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For development dependencies

# Set up frontend
cd ../frontend
npm install

# Return to project root
cd ..
```

## 🔧 Development Workflow

### Backend Development

#### Activate Virtual Environment
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Run Development Server
```bash
# With virtual environment activated
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Database Migrations
```bash
# Generate new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Downgrade migrations (if needed)
alembic downgrade -1
```

#### Run Backend Tests
```bash
# Install pytest if not in requirements-dev.txt
pip install pytest pytest-asyncio

# Run all tests
python -m pytest

# Run specific test file
python -m pytest tests/test_playlist_repository.py

# Run with verbose output
python -m pytest -v

# Run with coverage
pip install pytest-cov
python -m pytest --cov=. --cov-report=html
```

#### Code Quality Checks
```bash
# Install development tools
pip install black flake8 mypy

# Format code
black .

# Lint code
flake8 .

# Type checking
mypy .
```

### Frontend Development

#### Run Development Server
```bash
cd frontend
npm run dev
```

#### Build for Production
```bash
cd frontend
npm run build
```

#### Run Frontend Tests
```bash
cd frontend
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

#### Code Quality Checks
```bash
cd frontend
npm run lint          # ESLint
npm run type-check    # TypeScript checking (if configured)
```

## 🐳 Docker Development

### Using Docker Compose
```bash
# Build and start all services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Individual Docker Commands
```bash
# Build backend image
docker build -f Dockerfile -t openplaylist-backend .

# Run backend container
docker run -p 8000:8000 openplaylist-backend
```

## 🧪 Testing

### Backend Testing
```bash
cd backend
source venv/bin/activate

# Run all tests
python -m pytest

# Run specific test patterns
python -m pytest -k "test_playlist"
python -m pytest tests/test_remote_playlist_repository.py::TestRemotePlaylistRepository::test_sync_playlist

# Run with different verbosity levels
python -m pytest -v     # verbose
python -m pytest -vv    # extra verbose
python -m pytest -q     # quiet

# Generate coverage report
python -m pytest --cov=repositories --cov=routes --cov-report=term-missing
```

### Frontend Testing
```bash
cd frontend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --run src/components/playlist/PlaylistGrid.test.tsx
```

### Integration Testing
```bash
# Start backend in test mode
cd backend
source venv/bin/activate
TESTING=true uvicorn main:app --host 0.0.0.0 --port 8001

# In another terminal, run frontend against test backend
cd frontend
VITE_API_BASE_URL=http://localhost:8001 npm run dev
```

## 🗄️ Database Management

### SQLite (Development)
```bash
cd backend
source venv/bin/activate

# View database schema
sqlite3 database.db ".schema"

# Run SQL queries
sqlite3 database.db "SELECT name FROM sqlite_master WHERE type='table';"
```

### MySQL/MariaDB (Production)
```bash
# Connect to database
mysql -h localhost -u username -p database_name

# Import/Export
mysqldump -u username -p database_name > backup.sql
mysql -u username -p database_name < backup.sql
```

## 🔧 Configuration

### Environment Variables

Create `.env` files for different environments:

#### Backend `.env`
```env
DATABASE_URL=sqlite:///./database.db
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# External APIs
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
LASTFM_API_KEY=your_lastfm_api_key
OPENAI_API_KEY=your_openai_api_key

# Plex
PLEX_URL=http://your-plex-server:32400
PLEX_TOKEN=your_plex_token

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

#### Frontend `.env`
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=OpenPlaylist
VITE_VERSION=1.0.0
```

## 📝 Common Development Tasks

### Adding a New API Endpoint
1. Add route function in `backend/routes/`
2. Update models in `backend/models.py` if needed
3. Add response models in `backend/response_models.py`
4. Create/update repository methods
5. Add tests in `backend/tests/`
6. Update frontend repository in `frontend/src/repositories/`

### Adding a New Frontend Component
1. Create component in `frontend/src/components/`
2. Add corresponding CSS in `frontend/src/styles/` or component directory
3. Update parent components to use new component
4. Add tests in `frontend/src/tests/` or component directory
5. Update TypeScript types if needed

### Database Schema Changes
1. Modify models in `backend/models.py`
2. Generate migration: `alembic revision --autogenerate -m "Description"`
3. Review generated migration file
4. Apply migration: `alembic upgrade head`
5. Update any affected repository methods
6. Add tests for new functionality

## 🚨 Troubleshooting

### Common Issues

#### Backend Issues
```bash
# Module not found errors
source venv/bin/activate
pip install -r requirements.txt

# Database migration issues
alembic stamp head  # Mark current state as up-to-date
alembic upgrade head

# Port already in use
lsof -ti:8000 | xargs kill -9  # Kill process on port 8000
```

#### Frontend Issues
```bash
# Dependency issues
rm -rf node_modules package-lock.json
npm install

# Build issues
rm -rf dist
npm run build

# Type errors
npm run type-check
```

#### Docker Issues
```bash
# Clean up Docker
docker-compose down -v  # Remove volumes
docker system prune -a  # Clean up everything

# Rebuild from scratch
docker-compose build --no-cache
```

### Debug Mode

#### Backend Debug Mode
```bash
cd backend
source venv/bin/activate
DEBUG=true uvicorn main:app --reload --log-level debug
```

#### Frontend Debug Mode
```bash
cd frontend
npm run dev -- --debug
```

## 📚 Useful Scripts

### Create Development Script
Create `scripts/dev.sh`:
```bash
#!/bin/bash
# Start development environment

# Start backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
```

### Create Test Script
Create `scripts/test.sh`:
```bash
#!/bin/bash
# Run all tests

echo "Running backend tests..."
cd backend
source venv/bin/activate
python -m pytest -v

echo "Running frontend tests..."
cd ../frontend
npm test

echo "All tests completed!"
```

### Create Lint Script
Create `scripts/lint.sh`:
```bash
#!/bin/bash
# Run linting on all code

echo "Linting backend..."
cd backend
source venv/bin/activate
black . --check
flake8 .

echo "Linting frontend..."
cd ../frontend
npm run lint

echo "Linting completed!"
```

## 🔄 CI/CD

### GitHub Actions
The project uses GitHub Actions for CI/CD. Check `.github/workflows/` for:
- `ci.yml` - Frontend testing and linting
- Add backend CI workflow as needed

### Local CI Simulation
```bash
# Run the same checks as CI
./scripts/test.sh
./scripts/lint.sh
npm run build  # Frontend build check
```

## 📖 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/new-feature`
2. Make changes and test thoroughly
3. Run linting and tests: `./scripts/lint.sh && ./scripts/test.sh`
4. Commit with clear messages: `git commit -m "feat: add new sync feature"`
5. Push and create a pull request

## 📋 Project Structure

```
openplaylist/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── models.py            # Database models
│   ├── response_models.py   # API response models
│   ├── database.py          # Database configuration
│   ├── routes/              # API route handlers
│   ├── repositories/        # Data access layer
│   ├── lib/                 # Shared utilities
│   ├── migrations/          # Alembic migrations
│   ├── tests/               # Backend tests
│   ├── requirements.txt     # Python dependencies
│   └── requirements-dev.txt # Development dependencies
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── repositories/    # API client code
│   │   ├── lib/             # Shared utilities
│   │   ├── styles/          # CSS files
│   │   └── tests/           # Frontend tests
│   ├── package.json         # Node.js dependencies
│   └── vite.config.js       # Vite configuration
├── config/                  # Configuration files
├── scripts/                 # Development scripts
├── .github/workflows/       # CI/CD workflows
├── docker-compose.yml       # Docker Compose configuration
├── Dockerfile               # Docker configuration
└── README.md                # Project overview
```

---

*This guide should be updated as the project evolves. Keep it current with any new tools, processes, or requirements.*