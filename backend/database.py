from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import sys
import dotenv
import urllib.parse
import logging

dotenv.load_dotenv(override=True)

Base = declarative_base()

class Database:
    _instance = None
    _engine = None
    _sessionmaker = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            
            # Get database config from environment
            db_type = os.getenv("DB_TYPE", "sqlite").lower()
            
            if db_type == "mariadb" or db_type == "mysql":
                # MariaDB configuration
                db_host = os.getenv("DB_HOST", "localhost")
                db_port = os.getenv("DB_PORT", "3306")
                db_user = urllib.parse.quote_plus(os.getenv("DB_USER", "playlist"))
                db_pass = urllib.parse.quote_plus(os.getenv("DB_PASSWORD", "password"))
                db_name = os.getenv("DB_NAME", "playlists")
                
                # Build connection URL for MariaDB
                DATABASE_URL = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
                
                # MariaDB-specific connection arguments
                connect_args = {
                    "charset": "utf8mb4",
                }
                
                logging.info(f"Using MariaDB database at {db_host}:{db_port}/{db_name}")
            else:
                # Default to SQLite
                # Check if we're in a test environment
                is_testing = os.getenv("TESTING", "false").lower() == "true" or "pytest" in os.getenv("_", "")
                default_db = "sqlite:///:memory:" if is_testing else "sqlite:////data/playlists.db"
                db_path = os.getenv("DATABASE_URL", default_db)
                DATABASE_URL = db_path
                connect_args = {"check_same_thread": False} if db_path.startswith("sqlite") else {}
                
                logging.info(f"Using SQLite database at {db_path}")
            
            # Create the engine with appropriate configuration
            cls._engine = create_engine(
                DATABASE_URL, 
                echo=(os.getenv("LOG_LEVEL", "INFO") == "DEBUG"),
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            
            cls._sessionmaker = sessionmaker(
                autocommit=False, autoflush=False, bind=cls._engine
            )
            Base.metadata.create_all(bind=cls._engine)
        return cls._instance

    @classmethod
    def get_session(cls):
        if not cls._instance:
            cls()
        return cls._sessionmaker()

    @classmethod
    def get_engine(cls):
        if not cls._instance:
            cls()
        return cls._engine
