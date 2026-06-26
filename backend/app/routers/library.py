"""Серверная библиотека сериалов. Формат совместим с data/library/*.json."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Show, User
from ..schemas import LibraryIndexOut, LibraryShowIn, LibraryShowMeta

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("", response_model=LibraryIndexOut)
def library_index(db: Session = Depends(get_db)) -> LibraryIndexOut:
    rows = db.query(Show).order_by(Show.title).all()
    shows = [
        LibraryShowMeta(
            id=r.id, title=r.title, file=f"{r.id}.json", seasons=r.seasons, episodes=r.episodes
        )
        for r in rows
    ]
    return LibraryIndexOut(shows=shows)


@router.get("/{show_id}")
def library_show(show_id: str, db: Session = Depends(get_db)) -> dict:
    row = db.get(Show, show_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сериал не найден")
    # Возвращаем объект в формате data/library/<id>.json
    data = dict(row.data or {})
    data.setdefault("id", row.id)
    data.setdefault("title", row.title)
    return data


@router.post("/{show_id}", status_code=status.HTTP_200_OK)
def upsert_show(
    show_id: str,
    payload: LibraryShowIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    row = db.get(Show, show_id)
    if row is None:
        row = Show(id=show_id)
        db.add(row)
    row.title = payload.title
    row.seasons = payload.seasons
    row.episodes = payload.episodes
    data = dict(payload.data or {})
    data.setdefault("id", show_id)
    data.setdefault("title", payload.title)
    row.data = data
    db.commit()
    return {"status": "ok", "id": show_id}
