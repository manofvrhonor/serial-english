# Бэкенд Serial English (FastAPI). Используется Dockploy/Docker на сервере (занятие 7).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Зависимости отдельным слоем — кэшируется при неизменном requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# При старте: применяем миграции (если есть), затем поднимаем сервер.
# Если миграций ещё нет, init_db() в lifespan создаст таблицы сам.
CMD ["sh", "-c", "alembic upgrade head 2>/dev/null || true; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
