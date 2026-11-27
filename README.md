⁹⁸i# Генератор WireMock-моков из OpenAPI/Swagger

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

Если в проекте ещё нет нужных пакетов — выполните в корне проекта:

```bash
npm install @apidevtools/swagger-parser fs-extra
```

### 3. Добавить npm-скрипт (опционально)

Выполните в корне проекта:

```bash
npm pkg set scripts.wiremock:generate="node wiremock/generate-wiremock.js"
```

Или вручную добавьте в `package.json` в блок `"scripts"`:

```json
"wiremock:generate": "node wiremock/generate-wiremock.js"
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


//

{
  "planOperationClient": {
    "operation": [
      {
        "periodFrom": "2024-09-13",
        "periodDue": "2024-09-25",
        "loanBalance": 500000,
        "paymentNumber": 1,
        "paymentSum": 3737.7,
        "maxPayDate": "2024-09-25",
        "payments": [
          {
            "amount": 0,
            "currency": "RUB",
            "subRegistersGroup": "Loan",
            "direction": "Decrease"
          },
          {
            "amount": 3737.7,
            "currency": "RUB",
            "subRegistersGroup": "Interest",
            "direction": "Decrease"
          },
          {
            "amount": 0,
            "currency": "RUB",
            "subRegistersGroup": "PenaltyHoliday",
            "direction": "Decrease"
          }
        ]
      }
    ],
    "totalPaymentsSum": 652762.4,
    "totalLoanSum": 500000,
    "totalInterestSum": 152762.4,
    "totalPenaltyHolidaySum": 0
  },
  "retailLoanProductInstance": {
    "arrangements": {
      "retailLoanProductInstancePlanConditionArrangement": [
        {
          "lifeSpan": {
            "effectiveTime": "2024-09-13 00:00:00"
          },
          "productSubAccountType": "Основной долг",
          "amount": {
            "value": 23191.55,
            "currency": "RUB"
          },
          "typeCalcDate": "PayPeriod",
          "typeCalcSum": "Annuity",
          "dayEndCalc": 25,
          "dayPay": 25,
          "countPeriodDelay": 1,
          "firstPayDate": "2024-09-25",
          "shiftDayEndCalc": "NotShift",
          "shiftDayPay": "ShiftToFirstWorkingDay"
        }
      ],
      "retailLoanProductInstancePlanOperationArrangement": {
        "operation": [
          {
            "period": {
              "from": "2024-09-13",
              "due": "2024-09-25"
            },
            "maxPayDate": "2024-09-25",
            "paymentNumber": 1,
            "paymentSum": 3737.7,
            "loanBalance": 500000,
            "businessProcess": "PlanPay",
            "amount": {
              "value": 0,
              "currency": "RUB"
            },
            "direction": "Decrease",
            "executedAmount": 0,
            "productSubAccount": {
              "type": "<не найдено>"
            }
          },
          {
            "period": {
              "from": "2024-09-13",
              "due": "2024-09-25"
            },
            "maxPayDate": "2024-09-25",
            "paymentNumber": 1,
            "paymentSum": 3737.7,
            "loanBalance": 500000,
            "businessProcess": "PlanPay",
            "amount": {
              "value": 3737.7,
              "currency": "RUB"
            },
            "direction": "Decrease",
            "executedAmount": 0,
            "productSubAccount": {
              "type": "Проценты на основной долг",
              "internalId": 5
            }
          }
        ]
      }
    }
  }
}

