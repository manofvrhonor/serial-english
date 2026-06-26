"""Pydantic-схемы запросов/ответов."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Progress ----------
class ProgressIn(BaseModel):
    data: dict[str, Any]
    updated_at: datetime | None = None
    device: str = ""


class ProgressOut(BaseModel):
    data: dict[str, Any]
    updated_at: datetime
    device: str = ""

    model_config = {"from_attributes": True}


# ---------- Library ----------
class LibraryShowMeta(BaseModel):
    id: str
    title: str
    file: str
    seasons: int = 0
    episodes: int = 0


class LibraryIndexOut(BaseModel):
    shows: list[LibraryShowMeta]


class LibraryShowIn(BaseModel):
    title: str
    seasons: int = 0
    episodes: int = 0
    data: dict[str, Any]
