import pytest
from fastapi.testclient import TestClient
from database import Database
from models import Base
from main import app


@pytest.fixture(scope="function")
def test_db():
    # Use SQLite for testing - Database class will auto-detect test environment
    # This ensures consistent, fast testing without MariaDB dependency
    
    # Store original Database state
    original_sessionmaker = Database._sessionmaker
    original_engine = Database._engine
    original_instance = Database._instance
    
    # Reset Database singleton to force re-initialization with test detection
    Database._instance = None
    Database._engine = None
    Database._sessionmaker = None
    
    # Initialize Database (will use SQLite due to pytest detection)
    db = Database()
    engine = Database.get_engine()
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create test session
    test_session = Database.get_session()

    yield test_session

    # Cleanup and restore original Database state
    test_session.close()
    Base.metadata.drop_all(bind=engine)
    
    Database._sessionmaker = original_sessionmaker
    Database._engine = original_engine
    Database._instance = original_instance


@pytest.fixture
def client(test_db):
    return TestClient(app)
