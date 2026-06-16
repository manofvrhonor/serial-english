# 📜 Журнал изменений — Serial English

История сессий и коммитов. Читать при разборе «когда и зачем сделали».
**Не дублировать** в `agent-plan.md` — дописывать сюда.

---

## Этапы 1–8 (MVP) — выполнены

| Этап | Статус | Ключевое |
|------|--------|----------|
| 1 Каркас | ✓ | Меню, IndexedDB, экспорт/импорт |
| 2 Модель данных | ✓ | json v2, shows/books, миграции |
| 3 Импорт | ✓ | .srt/.txt, лемматизация, подтверждение |
| 4 Слова/Выражения | ✓ | топ-3, выучено, поиск |
| 5 Тренировка+SRS | ✓ | 3 режима+МИКС, STEP_SIZE=10 |
| 6 Сериалы/Книги | ✓ | деревья, готовность, подготовка |
| 7 База знаний | ✓ | выученное, стоп-лист |
| 8 Полировка | ✓ | HARD RESET, настройки |

---

## Сессия 2026-06 — UI Lovable (этап 9)

- Дизайн-токены oklch; sidebar + mobile nav.
- Импорт: вкладки Слова/Фразы, Карточки/Список, swipe (`js/ui/swipe-card.js`).
- Тренировка: segment-кнопки, сетка режимов 2×2.
- Переводы-чипы (`js/ui/trans-chips.js`).
- Card-layout: Настройки, База знаний, Сериалы, Книги.

Референс: `D:\VIBECODING\word-weaver-offline` (manofvrhonor/word-weaver-offline).

---

## Сессия 2026-06 — UX / навигация

- **База знаний** — единый хаб: База / На изучении / Выучено / Стоп-лист.
- Панели: `study-words.js`, `study-phrases.js`.
- Из Настроек убраны стоп-лист и блок «База».
- HARD RESET: модальный попап (`#import-confirm-modal` в `index.html`).
- Импорт: попап ОК / Поправить; сброс формы после коммита.
- Cache-bust ES-модулей: `?v=…` в router и index.html.

---

## Сессия 2026-06 — тренировка, импорт, стоп-лист

- Карточка: badges режим/прогресс/направление; «4 варианта» — промпт в карточке.
- После «Разобрать»: статистика файла; в списке только **новые** (`analyzer.js`).
- Стоп-лист: пустой при старте; встроенный ~40 слов **удалён**; `normalizeStopList()`.
- «Знаю» при импорте → карточка с переводами (`addKnownWordFromImport`).
- UI: «Слово» вместо «Лемма».

---

## Сессия 2026-06 — UX полировка (закрытие этапа 9)

**Mobile:** 6 кнопок в nav (без «Ещё»/sheet); нет `mobile-header`; `h1` скрыт на mobile.

**Импорт:** Сезон+Серия в одну строку (`input-num`).

**Scroll:** `js/ui/scroll-top.js`; скролл в `.content`, не window (`100dvh` app-shell).

**Таблица «На изучении»:** без колонок SRS/Источники; 3 кнопки (✓/✕/≡); sources-modal.

**Сверка Lovable:** desktop + mobile 390px — все экраны пройдены.

---

## Сессия 2026-06 — пост-релиз

- **Prep fix:** `ctx.startPrepTraining()` в `initRouter`; views не импортируют router.
- **Стоп-лист:** `{ lemma, translations }`; `repairStopListTranslations()`.
- **Desktop shell:** убран `desktop-header`; toggle в `.sidebar-footer`.
- **Теги:** убраны изучаю/выучено/стоп из строк (контекст = вкладка).

---

## Сессия 2026-06 — публикация

| Среда | URL | Примечание |
|-------|-----|------------|
| GitHub Pages | https://manofvrhonor.github.io/serial-english/ | Основной, без VPN в РФ |
| Netlify | https://serialenglish.netlify.app/ | Запасной; из РФ нужен VPN |
| Локально | http://localhost:8081 | `python -m http.server 8081` |

- В Git обязательны `data/dictionary.json.gz`, `data/forms.json.gz`.
- `.nojekyll`, `.github/workflows/deploy-pages.yml`, `netlify.toml`.
- Данные пользователя — IndexedDB (не синхронизируются между устройствами).

---

## Сессия 2026-06 — рефакторинг документации

- Разделение: `agent-plan.md` (горячий) + `docs/agent-spec.md` + `docs/agent-changelog.md`.
- Цель: меньше токенов на старт сессии; сохранить архитектурные решения с обоснованием.

---

## Технический журнал (долгоживущие решения)

### Словарь (2025-06)

- Сборка: iuzhakov → spishniak; `translation-overrides.json` — финальный приоритет.
- Пересборка: `node scripts/build-dictionary.mjs`
- Плохие переводы: править overrides → пересобрать.

### SRS (этап 5)

- Формат: `{ level, checks, due }`; миграция из `{ box, due, history }`.
- Очередь строится один раз при «Начать»; `sessionHistory` — одна запись на шаг.

### HARD RESET

- `hardResetState()` сбрасывает words, phrases, shows, books, knowledge, sessionHistory, стоп-лист.
- Не трогает `data/*.json(.gz)`. Интервалы [1,3,7,16,30] остаются.

---

## Git — ключевые коммиты

| Hash | Описание |
|------|----------|
| `8b312ed` | Stage 9 UI: card layout |
| `f118ba5` | Stage 9 UX: knowledge hub, import, stop-list, training |
| `3822a0e` | mobile nav, scroll-top, study lists |
| `7a98562` | prep fix, stop-list translations, desktop shell |
| `f961cd2` | netlify.toml |
| `c9f4989` | GitHub Pages: .nojekyll + deploy-pages.yml |
