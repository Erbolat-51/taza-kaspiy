# API — curl-примеры

База: `http://localhost:3000`. Админские запросы требуют `authorization: Bearer <token>`.

> На Windows curl передаёт кириллицу из аргументов в ANSI-кодировке. Комментарий лучше
> передавать из UTF-8 файла: `-F "comment=<comment.txt"`.

```bash
A=http://localhost:3000

# Создать репорт (публично, 10/мин с IP)
curl -F photo=@beach.jpg -F lat=43.662 -F lng=51.137 -F "comment=пластик" $A/api/reports

# Список: фильтры status, category (через запятую), zoneId, days | from/to, includeDuplicates, limit, offset
curl "$A/api/reports?status=NEW,ASSIGNED&category=PLASTIC,TRASH&days=30"

# Детали с историей и дубликатами
curl $A/api/reports/1

# Зоны с индексом чистоты и цветом; определение зоны по точке
curl $A/api/zones
curl "$A/api/zones/lookup?lat=43.662&lng=51.137"

# Сводка для карты
curl $A/api/stats/summary

# Вход в админку
TOKEN=$(curl -s -H 'content-type: application/json' \
  -d '{"email":"admin@taza.kz","password":"admin123"}' $A/api/auth/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
H="authorization: Bearer $TOKEN"

curl -H "$H" $A/api/executors
curl -H "$H" -H 'content-type: application/json' -d '{"executorId":1}' $A/api/reports/1/assign
curl -H "$H" -H 'content-type: application/json' -X PATCH -d '{"status":"IN_PROGRESS"}' $A/api/reports/1/status
curl -H "$H" -H 'content-type: application/json' -X PATCH -d '{"status":"REJECTED","reason":"Не побережье"}' $A/api/reports/1/status
curl -H "$H" -F photo=@after.jpg $A/api/reports/1/after-photo   # → RESOLVED
```

## Socket.IO (`/socket.io`)

| Событие          | Payload                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `report:new`     | `{ report, duplicateOf }`                                                        |
| `report:updated` | `{ report, change: { type: status \| assigned \| afterPhoto \| duplicate, … } }` |
| `zone:updated`   | `{ zoneId, cleanIndex, color }`                                                  |

## Статусы

`NEW → CONFIRMED → ASSIGNED → IN_PROGRESS → RESOLVED`, либо `REJECTED` (нужна причина).
Закрытие корневого репорта закрывает его дубликаты.
