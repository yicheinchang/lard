from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

engine = create_engine(
    settings.DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_query(sql: str) -> list[dict]:
    """Execute a raw SQL query and return rows as dictionaries."""
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(sql))
        # result.mappings() returns a MappingResult in SQLAlchemy 1.4+ / 2.0
        return [dict(row) for row in result.mappings()]
