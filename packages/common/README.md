# @domio/common

> Common TypeScript utilities — IDs, time, money, errors, idempotency,
> types. Used by every app, service, and worker via the
> `@domio/common` import alias.

## Layout

```
src/
├── ids.ts          # ResourceId, newId, newToken
├── time.ts         # now, nowMs, nowIso, toIso, fromIso
├── money.ts        # Money, money(), addMoney(), formatMoney()
├── errors.ts       # DomioError class + ErrorCode type
├── idempotency.ts  # isValidIdempotencyKey, clientIdempotencyKey
├── types.ts        # DeepPartial, Brand, AuditActor, TenantKind
└── index.ts
```

## Usage

```typescript
import { newId, money, DomioError, isValidIdempotencyKey } from '@domio/common';

const id = newId();
const price = money('USD', 19.99);
throw new DomioError({ code: 'not_found', message: 'Deck not found' });
```
