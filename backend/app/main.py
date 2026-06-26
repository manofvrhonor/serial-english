"""Точка входа FastAPI-приложения Serial English."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import auth, library, progress

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # MVP: создаём таблицы при старте. На сервере структуру ведём через Alembic.
    init_db()
    yield


app = FastAPI(title="Serial English API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Авторизация через Bearer-токен в заголовке, cookie не используем,
    # поэтому credentials не нужны (и безопасно при allow_origins=["*"]).
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(progress.router)
app.include_router(library.router)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok"}
