from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import dotenv

dotenv.load_dotenv(override=True)

Base = declarative_base()


class Database:
    _instance = None
    _engine = None
    _sessionmaker = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/playlists.db")
            cls._engine = create_engine(DATABASE_URL)
            cls._sessionmaker = sessionmaker(
                autocommit=False, autoflush=False, bind=cls._engine
            )
            Base.metadata.create_all(bind=cls._engine)
        return cls._instance

    @classmethod
    def get_session(cls):
        return cls._sessionmaker()

    @classmethod
    def get_engine(cls):
        if not cls._instance:
            cls()
        return cls._engine
