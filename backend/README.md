# Backend

## Creating new migrations
```
export DATABASE_URL=sqlite:///./path/to/your/sqlite
export DATABASE_URL=mysql+pymysql://aaron:aaron@openplaylist_db:3306/openplaylist
alembic revision --autogenerate -m "your message"
```

## Applying new migrations
```
alembic upgrade head
```