# 📗 Спецификация бэкенда «Serial English» (Путь B)

Документ для перехода с оффлайн-статики на серверную версию: аккаунты, облачная
синхронизация прогресса, серверная библиотека сериалов/словарей. Соответствует
плану `serial_english_path_b` и методике занятий 2-7.

> Принцип «offline-first сохраняем»: фронтенд продолжает работать локально на
> IndexedDB; сервер — источник истины для аккаунта. Синхронизация — по запросу
> и при логине. Без сети приложение работает как раньше.

---

## 1. Стек

- **Python + FastAPI** (как занятие 2: много обучающих данных у моделей, низкий порог).
- **SQLAlchemy** ORM, **Pydantic** схемы.
- БД: **SQLite** на старте (`app.db`) → **PostgreSQL** при деплое (занятия 3, 6, 7).
- Миграции структуры БД: **Alembic** (занятие 7).
- Авторизация: **email + пароль**, хэш **bcrypt** (passlib), токен **JWT** (HS256).
- Секреты — в **`.env`** (в `.gitignore`); на сервере — в Environment Dockploy.

Почему не Node: фронт — vanilla JS без сборки, но бэкенд изолирован, и для него
важнее «понятность для агента и уроков», поэтому берём FastAPI (как у преподавателя).

---

## 2. Модель данных

### `users`
| поле | тип | примечание |
|------|-----|------------|
| id | int PK | |
| email | str unique | логин |
| password_hash | str | bcrypt |
| created_at | datetime | |

### `progress` (снимок всего состояния приложения)
| поле | тип | примечание |
|------|-----|------------|
| user_id | int FK PK | один снимок на пользователя |
| data | JSON | целиком объект `state` из `js/db/database.js` (`emptyState()`-совместимый) |
| updated_at | datetime | для разрешения конфликтов (last-write-wins) |
| device | str | необязательная метка устройства последней записи |

Хранение всего состояния одним JSON-блобом выбрано осознанно: фронтенд уже
оперирует единым объектом `state` (`loadState`/`saveState`, экспорт/импорт .json),
поэтому синхронизация = обмен этим объектом. Это проще и надёжнее, чем дробить
на таблицы words/phrases/srs на старте.

### `shows` (серверная библиотека — каталог)
| поле | тип | примечание |
|------|-----|------------|
| id | str PK | slug, напр. `gravity-falls` |
| title | str | |
| seasons | int | для карточки |
| episodes | int | для карточки |
| data | JSON | формат `data/library/<id>.json` (seasons[].episodes[].words/phrases + translations) |
| updated_at | datetime | |

Формат `data` идентичен текущим файлам `data/library/*.json`, чтобы фронтенд-загрузчик
`js/import/library.js` работал без изменения формата — меняется только источник
(сервер вместо статических файлов).

---

## 3. API (эндпоинты)

Базовый префикс: `/api`. CORS — разрешить домены фронтенда (GitHub Pages + dev).

### Аутентификация
- `POST /api/auth/register` — `{ email, password }` → `{ access_token, token_type }`.
- `POST /api/auth/login` — `{ email, password }` → `{ access_token, token_type }`.
- `GET  /api/auth/me` — (Bearer) → `{ id, email, created_at }`.

### Синхронизация прогресса (Bearer)
- `GET /api/progress` → `{ data, updated_at, device }` или `204`, если ещё нет.
- `PUT /api/progress` — `{ data, updated_at, device }` → сохранить снимок; вернуть актуальный `updated_at`.
  - Конфликты: **last-write-wins** по `updated_at` (клиент сравнивает свой и серверный
    `updated_at`, грузит более свежий; см. `js/sync/sync.js`).

### Серверная библиотека
- `GET /api/library` → `{ shows: [{ id, title, file, seasons, episodes }] }` (совместимо с `index.json`).
- `GET /api/library/{id}` → объект сериала (формат `data/library/<id>.json`).
- `POST /api/library/{id}` — (Bearer, admin) загрузить/обновить набор сериала (из админ-курирования).

> Роль admin на MVP — простейшая (флаг в конфиге `ADMIN_EMAILS` или поле в БД позже).

### Служебное
- `GET /health` → `{ status: "ok" }` (для мониторинга/healthcheck в Docker/Dockploy).
- `GET /docs` — Swagger UI (FastAPI авто), `GET /openapi.json` — для агента/мобилки.

---

## 4. Синхронизация на фронтенде (схема)

```
Логин → токен в localStorage
"Синхронизировать":
  1. GET /api/progress (серверный updated_at)
  2. сравнить с локальным state.updatedAt
  3. свежее серверное → импортировать в IndexedDB (saveState)
     свежее локальное  → PUT /api/progress (выгрузить)
  4. обновить локальный updatedAt
```

- Локальный `updatedAt` хранится рядом со `state` (в самом объекте `state.updatedAt`,
  выставляется при каждом `saveState` через обёртку в `js/sync/sync.js`).
- Авто-синхронизация (опция): при старте приложения и после изменений — позже.

---

## 5. Что переносим со статической версии

- Библиотека: сейчас `data/library/*.json` + админ-экспорт в git. На сервере —
  те же JSON в таблице `shows`; админ-курирование делает `POST /api/library/{id}`.
- Прогресс: сейчас только IndexedDB + ручной экспорт/импорт. Добавляется облачный
  снимок per-user.
- Словари переводов (`dictionary.json.gz`) пока остаются статикой на фронте
  (большие, оффлайн-lookup). На сервер их выносить не обязательно; при желании —
  отдавать как файлы из S3 (занятие 7).

---

## 6. Безопасность и 152-ФЗ

- Пароли — только хэш (bcrypt), никогда не возвращаются.
- JWT-секрет, креды БД — в `.env` / Environment Dockploy, не в git.
- email — персональные данные граждан РФ → бэкенд+БД **в РФ** (Timeweb), занятие 7.
- HTTPS обязателен (Let's Encrypt через Dockploy/Traefik).
