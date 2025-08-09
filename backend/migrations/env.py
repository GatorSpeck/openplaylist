from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Import your models to access the metadata
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models import Base

from dotenv import load_dotenv
load_dotenv()

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Update target_metadata to point to your SQLAlchemy Base metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()
    url = None
    if DB_TYPE == "mariadb" or DB_TYPE == "mysql":
        # MariaDB configuration
        db_host = os.getenv("DB_HOST", "openplaylist_db")
        db_port = os.getenv("DB_PORT", "3306")
        db_user = os.getenv("DB_USER", "openplaylist")
        db_pass = os.getenv("DB_PASSWORD", None)
        db_name = os.getenv("DB_NAME", "openplaylist")

        # Build connection URL for MariaDB
        url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    else:
        # Default to SQLite
        url = os.getenv("DATABASE_URL", "sqlite:////data/playlists.db")
    
    config.set_main_option("sqlalchemy.url", url)

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
