# Генератор WireMock-моков из OpenAPI/Swagger

Скрипт читает `schema.yaml` и генерирует stub-файлы для WireMock: папки `mappings/` и `__files/`.  
При повторном запуске работает инкрементально — добавляет новые эндпоинты, обновляет изменившиеся, удаляет удалённые.

---

## Подключение к проекту

### 1. Скопировать скрипт

Скопируйте файл `wiremock/generate-wiremock.js` в любую папку вашего проекта.  
Рекомендуется класть его рядом с `schema.yaml` — например, в `wiremock/`.

```
your-project/
└── wiremock/
    ├── generate-wiremock.js   ← скрипт
    └── schema.yaml            ← ваша OpenAPI/Swagger спецификация
```

### 2. Установить зависимости

Если в проекте ещё нет нужных пакетов — установите их:

```bash
npm install --save-dev @apidevtools/swagger-parser fs-extra
```

### 3. Добавить npm-скрипт (опционально)

В `package.json`:

```json
"scripts": {
  "wiremock:generate": "node wiremock/generate-wiremock.js"
}
```

### 4. Подготовить схему

Положите файл `schema.yaml` (OpenAPI 3.x или Swagger 2.x) в ту же папку, что и скрипт.

---

## Запуск

```bash
# Через npm-скрипт
npm run wiremock:generate

# Или напрямую
node wiremock/generate-wiremock.js
```

После выполнения рядом со скриптом появятся:

```
wiremock/
├── generate-wiremock.js
├── schema.yaml
├── mappings/       ← stub-маппинги (по одному файлу на эндпоинт)
└── __files/        ← тела ответов в JSON
```

---

## Нестандартные пути

Скрипт принимает два опциональных аргумента:

```bash
node generate-wiremock.js [папка-со-schema.yaml] [папка-вывода]
```

Пример — схема в корне проекта, вывод в отдельную папку:

```bash
node wiremock/generate-wiremock.js . ./wiremock-output
```

---

## Поведение при повторном запуске

| Ситуация | Действие |
|---|---|
| Папка `mappings/` пуста или отсутствует | Полная генерация |
| Маппинги уже есть, схема не изменилась | Ничего не меняется |
| В схеме появился новый эндпоинт | Добавляется новый маппинг |
| Эндпоинт изменился (статус, тело ответа) | Маппинг перезаписывается |
| Эндпоинт удалён из схемы | Маппинг и файл тела удаляются |
