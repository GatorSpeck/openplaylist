import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from database import Database
from models import Base
from main import app

@pytest.fixture(scope="function")
def test_db():
    # Create in-memory database for testing
    DATABASE_URL = "sqlite:///:memory:"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    
    # Create test session
    test_session = TestingSessionLocal()
    
    # Store original session
    original_session = Database._sessionmaker
    Database._sessionmaker = lambda: test_session
    
    yield test_session
    
    # Cleanup
    test_session.close()
    Base.metadata.drop_all(bind=engine)
    Database._sessionmaker = original_session

@pytest.fixture
def client(test_db):
    return TestClient(app)