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
    # Use MariaDB for testing - require proper configuration
    import os
    import dotenv
    
    dotenv.load_dotenv(override=True)
    
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "3306")
    db_user = os.getenv("DB_USER", "root")
    db_pass = os.getenv("DB_PASSWORD", "password")
    db_name = os.getenv("TEST_DB_NAME", "openplaylist_test")
    
    if not all([db_host, db_user, db_pass]):
        pytest.skip("MariaDB configuration required for testing (DB_HOST, DB_USER, DB_PASSWORD)")
    
    DATABASE_URL = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(
        DATABASE_URL, 
        connect_args={"charset": "utf8mb4"}
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
