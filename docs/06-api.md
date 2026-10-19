# 06 — API

Base URL: `http://localhost:4000/api/v1` · JSON · `Authorization: Bearer <jwt>` · Rate limit 300/min (عام) وأقل للمسارات الحساسة. الأخطاء: `{ error: CODE, message?, issues? }`.

## Health
`GET /health` → `{ ok, uptime, engineVersion, scoringVersion, providers[], ai }`

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password(≥8), displayName }` | `{ token, user }` — أول مستخدم = admin |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` 🔒 | — | `{ user }` |

## Market
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/instruments` | — | `{ instruments[], timeframes[] }` |
| GET | `/modules` | — | `{ modules[] }` (الـ60 وحدة) |
| GET | `/candles` | `symbol, timeframe, limit≤5000, to?` | `{ candles[], provider, status }` |
| GET | `/analysis` | `symbol, timeframe, limit, includeLowQuality, includeInvalidated, locale` | `AnalysisResult` (انظر أدناه). `includeInvalidated=true` يُبقي المناطق المبطلة خلال آخر 120 شمعة بحالة `INVALIDATED` للتعلم منها |
| GET | `/overview` | `symbols=A,B,C` | `{ rows[] }` لكل رمز: price/regime/volatility/htfBias/zones/topZone |
| POST | `/ai/chat` | `{ symbol, timeframe, question, locale, zoneId? }` | `{ answer, provider: "anthropic"|"deterministic", grounded: true }` |

### `AnalysisResult` (مختصر)
```ts
{
  engineVersion, scoringVersion, symbol, timeframe, generatedAt, lastPrice, lastCandleTime,
  base: { bias, structure{events[]}, fvgs[], orderBlocks[], displacements[], liquidity[], sweeps[], regime, atr },
  htf: [{ timeframe, bars, bias, regime, keyLevels[] }], htfBias,
  keyLevels[], session: { current, overlap, sessionHigh, sessionLow, ... },
  zones: [{ id, name, nameAr, origin, direction, top, bottom, score, quality, status, tests,
            factors: [{ key, present, weight, contribution, label{ar,en}, evidence?{ar,en} }],
            invalidation{price,ar,en}, explanation{summary,reasons[],weaknesses[],invalidation}, htfContext[] }],
  hiddenLowQuality, narrative{ar,en}, disclaimer{ar,en}
}
```

## User 🔒
| Method | Path | Body |
|---|---|---|
| GET/PUT | `/watchlist` | `{ symbols[] }` |
| GET/POST/DELETE | `/alerts`, `/alerts/:id` | `{ symbol, kind: price_above|price_below|zone_enter, price?, zoneId?, note? }` |
| GET/POST/PATCH/DELETE | `/journal`, `/journal/:id` | `{ symbol, direction, entry, stopLoss, takeProfit?, exitPrice?, size, openedAt, setup?, strategy?, reason?, emotion?, notes?, zoneId? }` → يحسب `rMultiple` |
| PATCH | `/settings` | أي JSON يُدمج في `user.settings` |

## Admin 🔒 (role ≥ admin)
`GET /admin/overview` · `GET /admin/users` · `PATCH /admin/users/:id/role {role}` · `GET /admin/zones?limit` · `GET /admin/audit` · `GET /admin/research/factors`

## WebSocket `/ws`
Client → `{"type":"subscribe","symbol":"XAUUSD","timeframe":"5m","includeLowQuality":false,"includeInvalidated":false}` | `{"type":"unsubscribe"}` | `{"type":"ping"}`
Server →
- `{"type":"status","provider":{id,live,message}}`
- `{"type":"candle","update":{symbol,timeframe,candle,closed,receivedAt}}` (كل tick)
- `{"type":"analysis","result":AnalysisResult}` (عند إغلاق شمعة أو كل 15s)
- `{"type":"alert","event":{alert,price,message{ar,en},at}}`
- `{"type":"error","message"}`

## مخطط (P2+)
`/strategies` · `/setups` · `/scenarios` · `/snapshots` · `/notes` · `/goals` · `/routine` · `/calendar` · `/news` · `/scanner` · `/zones/:id/feedback` · `/backtests` · `/community/*` · `/plans` · `/notifications`
