# Serial English — Backend (FastAPI)

Серверная часть для Пути B: аккаунты, облачная синхронизация прогресса, серверная
библиотека сериалов. Полное ТЗ — `../docs/backend-spec.md`. Деплой — `../docs/deploy-runbook.md`.

## Локальный запуск (SQLite)

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env        # Windows  (Linux/mac: cp .env.example .env)
# впишите JWT_SECRET (python -c "import secrets; print(secrets.token_urlsafe(48))")

uvicorn app.main:app --reload --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Health: http://localhost:8000/health
- OpenAPI (для мобилки/агента): http://localhost:8000/openapi.json

При первом старте таблицы создаются автоматически (`init_db`). SQLite-файл — `backend/app.db`.

## Эндпоинты (кратко)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/register` | регистрация → JWT |
| POST | `/api/auth/login` | логин → JWT |
| GET | `/api/auth/me` | текущий пользователь (Bearer) |
| GET | `/api/progress` | получить снимок состояния (Bearer); 204 если пусто |
| PUT | `/api/progress` | сохранить снимок состояния (Bearer) |
| GET | `/api/library` | индекс серверной библиотеки |
| GET | `/api/library/{id}` | данные сериала (формат `data/library/<id>.json`) |
| POST | `/api/library/{id}` | загрузить/обновить сериал (Bearer + admin) |
| GET | `/health` | healthcheck |

Авторизация в Swagger: вызовите `/api/auth/login`, скопируйте `access_token`,
нажмите **Authorize** и вставьте токен.

## Миграции (для PostgreSQL на сервере)

```bash
# создать первую миграцию из текущих моделей
alembic revision --autogenerate -m "init"
# применить
alembic upgrade head
```

Локально на SQLite можно без Alembic — таблицы создаёт `init_db()`.

## Docker (прод-подобный запуск)

```bash
cd backend
docker compose up --build
```

Поднимет PostgreSQL + API на http://localhost:8000.

## Перенести текущую библиотеку (Gravity Falls) на сервер

Содержимое `data/library/gravity-falls.json` можно загрузить через
`POST /api/library/gravity-falls` (нужен админский аккаунт — впишите email в `ADMIN_EMAILS`).
