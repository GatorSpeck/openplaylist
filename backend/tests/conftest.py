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
        DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool,
        # echo = True
    )

    # Create tables
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    # Create test session
    test_session = TestingSessionLocal()

    # Store original Database state
    original_sessionmaker = Database._sessionmaker
    original_engine = Database._engine
    original_instance = Database._instance

    # Override Database singleton for testing
    Database._engine = engine
    Database._sessionmaker = TestingSessionLocal
    Database._instance = Database()

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
