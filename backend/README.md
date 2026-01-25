# Backend

## Creating new migrations
```
# Configure MariaDB connection
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=your_user
export DB_PASSWORD=your_password
export DB_NAME=your_database
export DATABASE_URL=mysql+pymysql://your_user:your_user@openplaylist_db:3306/openplaylist
alembic revision --autogenerate -m "your message"
```

## Applying new migrations
```
alembic upgrade head
```