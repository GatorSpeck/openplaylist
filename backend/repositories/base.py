from sqlalchemy.orm import Session
from typing import TypeVar, Generic, Type

T = TypeVar('T')

class BaseRepository(Generic[T]):
    def __init__(self, session: Session, model: Type[T]):
        self.session = session
        self.model = model

    def get_all(self):
        return self.session.query(self.model).all()

    def get_by_id(self, id: int):
        return self.session.query(self.model).filter(self.model.id == id).first()

    def create(self, entity: T):
        self.session.add(entity)
        self.session.commit()
        return entity

    def update(self, entity: T):
        self.session.merge(entity)
        self.session.commit()
        return entity

    def delete(self, id: int):
        entity = self.get_by_id(id)
        self.session.delete(entity)
        self.session.commit()