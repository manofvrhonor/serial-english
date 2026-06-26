# 🧭 Путь B — команды для запуска (то, что нужно выполнить вручную)

Эти шаги требуют терминала/git (в сессии агента терминал был недоступен, поэтому
вынесено сюда). Выполняйте из корня проекта `D:\VIBECODING\SERIAL ENGLISH`.

---

## 1. Ветка `dev` (Фаза 0)

Сейчас вы коммитите прямо в `main`, а прод (GitHub Pages) тянется из `main`.
Заводим `dev` для разработки:

```bash
git checkout -b dev
git push -u origin dev
```

Дальнейший цикл работы:
```bash
# работаем в dev, коммитим рабочие фичи
git add -A
git commit -m "feat: ..."
git push

# когда фича готова и протестирована — вливаем в прод:
git checkout main
git merge dev
git push          # GitHub Pages обновится автоматически
git checkout dev  # вернуться к разработке
```

> Изменения этой сессии (бэкенд + интеграция фронта) лучше сначала влить в `dev`,
> протестировать, и только потом мержить в `main`.

---

## 2. Файл `.cursorignore` (Фаза 0)

Файл защищён от записи агентом — **создайте его сами** в корне проекта с таким
содержимым (прячет тяжёлые данные от индексации ИИ; на пользователей не влияет):

```gitignore
# Зависимости
node_modules/
backend/.venv/
**/__pycache__/

# Тяжёлые оффлайн-словари
data/*.gz
data/dictionary.json
data/forms.json

# Большие наборы библиотеки
data/library/*.json

# Сборки/временное
dist/
.next/
*.log
```

---

## 3. Запуск бэкенда локально (Фаза 2)

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows PowerShell
pip install -r requirements.txt
copy .env.example .env            # затем впишите JWT_SECRET
python -c "import secrets; print(secrets.token_urlsafe(48))"   # сгенерировать секрет
uvicorn app.main:app --reload --port 8000
```
- Swagger: http://localhost:8000/docs · Health: http://localhost:8000/health

---

## 4. Запуск фронтенда локально (Фаза 3)

В отдельном терминале из корня проекта:
```bash
python -m http.server 8081
```
Откройте http://localhost:8081 → раздел **Настройки** → секция
**«Аккаунт и синхронизация»**:
1. Адрес сервера: `http://localhost:8000` → Сохранить.
2. Зарегистрируйтесь (email + пароль ≥6 симв.).
3. Нажмите «Синхронизировать» / «Выгрузить» — проверьте, что прогресс уходит на сервер.
4. Откройте сайт в другом браузере/устройстве, войдите тем же аккаунтом → «Загрузить».

> Если фронт на `https://...github.io`, а бэкенд на `http://localhost` — браузер
> заблокирует mixed-content. Для теста используйте локальный фронт (8081) с локальным
> бэкендом (8000), либо оба по HTTPS на сервере.

---

## 5. Что меняли в этой сессии

**Бэкенд (новое, `backend/`):** FastAPI + SQLAlchemy + JWT, эндпоинты
`/api/auth/*`, `/api/progress`, `/api/library/*`, `/health`; Docker + Alembic + S3-ready.

**Фронтенд (аддитивно):**
- новые модули: `js/api/config.js`, `js/api/client.js`, `js/sync/sync.js`, `js/views/account-ui.js`;
- `js/views/settings.js` — добавлена секция «Аккаунт и синхронизация»;
- `js/import/library.js` — опционально грузит библиотеку с сервера (fallback на локальные файлы);
- bump `ASSET_VERSION` → `20260674` (и `?v=` у изменённых файлов).

**Без сервера приложение работает как раньше** (оффлайн). Серверные функции
включаются только после ввода адреса сервера в Настройках.

---

## 6. Перед мержем в `main` (прод)

- Протестировать на `dev` + локальном бэкенде.
- При желании прогнать полный bump `?v=` (сейчас обновлены только изменённые файлы).
- Бэкенд деплоить отдельно по `docs/deploy-runbook.md` (Timeweb + Dockploy).
