"""Облачная синхронизация прогресса (снимок всего state одним JSON)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Progress, User
from ..schemas import ProgressIn, ProgressOut

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("", response_model=ProgressOut, responses={204: {"description": "Нет сохранённого прогресса"}})
def get_progress(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.get(Progress, user.id)
    if not row:
        # Возврат Response напрямую минует валидацию response_model.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return row


@router.put("", response_model=ProgressOut)
def put_progress(
    payload: ProgressIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Progress:
    row = db.get(Progress, user.id)
    updated_at = payload.updated_at or datetime.now(timezone.utc)
    if row is None:
        row = Progress(user_id=user.id, data=payload.data, device=payload.device)
        row.updated_at = updated_at
        db.add(row)
    else:
        row.data = payload.data
        row.device = payload.device
        row.updated_at = updated_at
    db.commit()
    db.refresh(row)
    return row
