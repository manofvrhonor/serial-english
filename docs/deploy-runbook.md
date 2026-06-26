# 🚀 Деплой бэкенда «Serial English» (Timeweb + Dockploy)

Пошаговый сценарий по занятиям 6-7. Принцип: **не настраивать руками — давать
задачи агенту в Cursor**, понимая, *зачем* каждый шаг. Фронтенд остаётся на
GitHub Pages; на сервер в РФ выносим только бэкенд + БД (персональные данные,
152-ФЗ).

Артефакты уже в репозитории: `backend/Dockerfile`, `backend/docker-compose.yml`,
`backend/alembic/*`, `backend/.env.example`.

---

## Шаг 0. Локальная проверка перед деплоем (Docker)

```bash
cd backend
docker compose up --build
```
Откройте http://localhost:8000/health и http://localhost:8000/docs. Это связка
app + PostgreSQL, как на сервере. Если работает локально — деплоим.

---

## Шаг 1. VPS на Timeweb + базовая безопасность

1. Timeweb → **Облачные серверы** → тариф **Cloud MSK 40** (2 GB / 40 GB) или аналог;
   Ubuntu, регион РФ (Москва/СПб). **Текущий инстанс (2026-06-26):** IP `45.93.201.28`.
2. **Облачный Firewall** (Сети → Firewall): режим «Разрешить трафик» → ingress **TCP 22, 80, 443**
   «для всех адресов» → привязать к VPS. Без порта 22 — `ssh` даёт `Connection timed out`.
   Если правила есть, а SSH не идёт — **VNC-консоль** в карточке сервера (вход без SSH).
3. Безопасность — через агента в Cursor (по SSH), промпты:
   - «сгенерируй SSH-ключ для VPS и подключись по нему»;
   - «отключи вход под root, создай пользователя для деплоя, вход только по ключу»;
   - «настрой UFW: открой порты 22, 80, 443, 3000; включи Fail2ban; включи автообновления».
4. Установить Dockploy: на сервере выполнить официальный установщик
   (`curl -sSL https://dokploy.com/install.sh | sh` — уточните актуальную команду
   на dokploy.com), панель поднимется на `http://IP:3000`.

> Зачем: изоляция окружения и защита сервера до того, как на нём появятся данные.

---

## Шаг 2. Домены и DNS (Timeweb)

1. Timeweb → Домены → купить (или перенести). Привязать к облачному серверу.
2. Записи:
   - **A** основного домена `app.ru` → IP сервера (прод-фронт/бэкенд);
   - **поддомен** `api.app.ru` → IP (бэкенд API);
   - **поддомен** `dev.api.app.ru` → IP (dev-бэкенд);
   - **поддомен** `deploy.app.ru` → IP (панель Dockploy — не на основном домене!).
3. SSL **не покупать** — бесплатно через Let's Encrypt в Dockploy.

> DNS обновляется до ~1 часа.

---

## Шаг 3. Настройка Dockploy

1. **Settings → Web Server:** домен панели `deploy.app.ru`, порт 3000, email;
   включить **HTTPS / Let's Encrypt**; перезапустить **Traefik** (сертификат ~10-15 мин).
2. **Settings → Git → GitHub:** OAuth-авторизация, дать доступ к репозиторию
   `manofvrhonor/serial-english`.
3. **Settings → Registry:** добавить **Docker Hub** (Sign Up → username/password →
   Test → Create) — иначе лимиты на образы.
4. **S3 (Timeweb → Хранилище S3):** приватный bucket, холодное хранение →
   **Dockploy → Settings → S3 Destinations**: Access/Secret Key, region `ru-1`,
   endpoint Timeweb. Для бэкапов БД и (позже) файлов пользователей.
5. (Опц.) **Requests / Monitoring** — логи и нагрузка.

---

## Шаг 4. PostgreSQL

1. Dockploy → **Create Service → Database → PostgreSQL**: имя, user, пароль
   (автоген), версия (см. tags на Docker Hub, по умолчанию ~18). **Deploy**.
2. Создать **две** БД: для **prod** и для **dev** (или два сервиса).
3. Скопировать **Internal Connection URL** — он пойдёт в переменную `DATABASE_URL`
   приложения (формат `postgresql+psycopg2://user:pass@host:5432/dbname`).
4. **Backups** в сервисе БД → S3 destination, расписание **ежедневно**, хранить ~**31**,
   проверить **Manual Backup**.

> Секреты БД — только в Environment Dockploy, **не** в GitHub.

---

## Шаг 5. Приложение: окружения dev/main + деплой через Cursor

1. Убедиться, что код в **GitHub** (ветки `dev` и `main`, см. `path-b-runbook.md`).
2. Dockploy → **Profile → API Keys → Generate** — скопировать ключ; скопировать
   Swagger-ссылку Dockploy API.
3. В Cursor дать агенту задачу (передав URL Dockploy + Swagger + API key):
   > «Создай в Dockploy проект serial-english с двумя окружениями:
   > Production (ветка `main`, домен `api.app.ru`) и Development (ветка `dev`,
   > домен `dev.api.app.ru`). Источник — GitHub-репозиторий, build из папки
   > `backend/` по `backend/Dockerfile`. Триггер деплоя — push в ветку.
   > Пропиши Environment: `DATABASE_URL` (prod/dev — свои), `JWT_SECRET`,
   > `CORS_ORIGINS` (домены фронта: `https://manofvrhonor.github.io`),
   > `ADMIN_EMAILS`. Задеплой оба окружения.»
4. Healthcheck: `GET https://api.app.ru/health` → `{ "status": "ok" }`.
5. Swagger прод: `https://api.app.ru/docs`.

> Зачем dev/main: пушим в `dev` → автодеплой на dev-домен → тест → PR `dev`→`main`
> → автодеплой прод. Пользователи не видят поломок.

---

## Шаг 6. Миграции БД (Alembic)

На сервере БД — PostgreSQL, структуру ведём миграциями (не `create_all`):
```bash
# локально/в контейнере, при изменении моделей:
cd backend
alembic revision --autogenerate -m "init"   # первый раз
alembic upgrade head
```
`backend/Dockerfile` при старте сам выполняет `alembic upgrade head`. Первую
миграцию нужно один раз сгенерировать и закоммитить (папка `backend/alembic/versions/`).

> На прод переносится **структура**, не данные dev. Копию данных prod→dev делают
> через dump (можно попросить агента).

---

## Шаг 7. Подключить фронтенд

1. В приложении: Настройки → «Аккаунт и синхронизация» → задать адрес сервера
   `https://api.app.ru` → Сохранить.
2. Зарегистрироваться/войти → «Синхронизировать».
3. (Опц.) включить «Брать библиотеку сериалов с сервера».
4. Перенести библиотеку: залогиниться админом (email в `ADMIN_EMAILS`) и
   `POST /api/library/gravity-falls` содержимым `data/library/gravity-falls.json`.

---

## Чего НЕ делаем сейчас (по урокам)

- Кастомный CI/CD (GitHub Actions/GitLab CI) — уровень 3, избыточно на старте.
- Несколько серверов / горизонтальное масштабирование.
- Тяжёлый Supabase на маленьком VPS (риск 100% CPU/RAM).
- Отдельные уведомления Dockploy — хватает webhook GitHub → автодеплой.
