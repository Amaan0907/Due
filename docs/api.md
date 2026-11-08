# Due API Contract (v1)

This is the agreement between the React client and the Express API. Every request and response shape, status code, and error code the client can rely on is listed here. The Zod validators in `server/src/validators/` and the integration tests in `server/tests/integration/` must match this document. If behaviour changes, update this file in the same commit.

Items marked **⚑ Decision** are product choices made while writing the contract. Change them here first if you disagree.

---

## Contents

1. [Conventions](#1-conventions)
2. [Authentication & sessions](#2-authentication--sessions)
3. [Errors](#3-errors)
4. [Resource shapes](#4-resource-shapes)
5. [Endpoints](#5-endpoints)
   - [Auth](#51-auth)
   - [Groups](#52-groups)
   - [Members](#53-members)
   - [Expenses](#54-expenses)
   - [Balances & simplification](#55-balances--simplification)
   - [Settlements](#56-settlements)
   - [Activity](#57-activity)
   - [Summary](#58-summary)
   - [Analytics & export](#59-analytics--export)
   - [Notifications](#510-notifications)
   - [Health](#511-health)
6. [Real-time events (Socket.IO)](#6-real-time-events-socketio)
7. [Permissions matrix](#7-permissions-matrix)
8. [Decisions log](#8-decisions-log)

### Endpoint index

| Method | Path | Auth | Section |
|--------|------|------|---------|
| POST | `/api/auth/register` | — | [5.1](#post-apiauthregister) |
| POST | `/api/auth/login` | — | [5.1](#post-apiauthlogin) |
| POST | `/api/auth/logout` | user | [5.1](#post-apiauthlogout) |
| GET | `/api/auth/me` | user | [5.1](#get-apiauthme) |
| PATCH | `/api/auth/me` | user | [5.1](#patch-apiauthme) |
| GET | `/api/groups` | user | [5.2](#get-apigroups) |
| POST | `/api/groups` | user | [5.2](#post-apigroups) |
| GET | `/api/groups/:id` | member | [5.2](#get-apigroupsid) |
| PATCH | `/api/groups/:id` | admin | [5.2](#patch-apigroupsid) |
| DELETE | `/api/groups/:id` | admin | [5.2](#delete-apigroupsid) |
| POST | `/api/groups/:id/members` | member | [5.3](#post-apigroupsidmembers) |
| DELETE | `/api/groups/:id/members/:userId` | admin or self | [5.3](#delete-apigroupsidmembersuserid) |
| GET | `/api/groups/:id/expenses` | member | [5.4](#get-apigroupsidexpenses) |
| POST | `/api/groups/:id/expenses` | member | [5.4](#post-apigroupsidexpenses) |
| GET | `/api/expenses/:id` | member | [5.4](#get-apiexpensesid) |
| PATCH | `/api/expenses/:id` | creator, payer, or admin | [5.4](#patch-apiexpensesid) |
| DELETE | `/api/expenses/:id` | creator, payer, or admin | [5.4](#delete-apiexpensesid) |
| GET | `/api/groups/:id/balances` | member | [5.5](#get-apigroupsidbalances) |
| GET | `/api/groups/:id/simplify` | member | [5.5](#get-apigroupsidsimplify) |
| GET | `/api/groups/:id/settlements` | member | [5.6](#get-apigroupsidsettlements) |
| POST | `/api/groups/:id/settlements` | member | [5.6](#post-apigroupsidsettlements) |
| DELETE | `/api/settlements/:id` | creator, payer, payee, or admin | [5.6](#delete-apisettlementsid) |
| GET | `/api/groups/:id/activity` | member | [5.7](#get-apigroupsidactivity) |
| GET | `/api/me/summary` | user | [5.8](#get-apimesummary) |
| GET | `/api/groups/:id/analytics` | member | [5.9](#get-apigroupsidanalytics) |
| GET | `/api/groups/:id/export` | member | [5.9](#get-apigroupsidexport) |
| GET | `/api/notifications` | user | [5.10](#get-apinotifications) |
| PATCH | `/api/notifications` | user | [5.10](#patch-apinotifications) |
| GET | `/api/health` | — | [5.11](#get-apihealth) |

"user" = any logged-in user · "member" = logged-in member of the group in the path (or of the group the expense or settlement belongs to) · "admin" = member with role `admin`.

---

## 1. Conventions

| Topic | Rule |
|-------|------|
| Base URL | `/api` (dev: `http://localhost:4000/api`, prod: `https://<api-host>/api`) |
| Format | JSON request and response bodies, `Content-Type: application/json`. The only exception is [export](#get-apigroupsidexport), which returns a file. |
| Field names | camelCase in JSON (`amountCents`, `paidBy`). The database uses snake_case; repositories map between them. |
| IDs | Positive integers |
| Money | **Integer minor units**, always named `...Cents` (for INR these are paise). `₹100.00` is sent as `10000`. Never send decimals or strings. Maximum single amount: `1000000000` (₹1 crore). |
| Currency | One currency per group, ISO 4217 code (`"INR"`), fixed when the group is created. |
| Dates | Calendar dates as `YYYY-MM-DD` (`expenseDate`); timestamps as ISO 8601 UTC (`"2026-11-02T14:30:00.000Z"`). |
| Strings | Trimmed by the server. Empty strings for optional fields are stored as `null`. |
| Booleans | JSON `true` / `false` |
| Unknown fields | Rejected with `400 VALIDATION_ERROR` (Zod `.strict()`), so typos surface immediately. |
| Pagination | Cursor-based. Request: `?limit=20&cursor=<opaque>`; `limit` is 1–100 with a default of 20. Response: `{ "items": [...], "nextCursor": "<opaque>" \| null }`. `null` means there are no more pages. Treat cursors as opaque strings. |
| Sorting | Lists are newest first unless an endpoint says otherwise. |
| Empty success | `204 No Content` with no body |

**Split `value` meaning by split type**

| `splitType` | `value` per participant | Rule |
|-------------|-------------------------|------|
| `equal` | omitted | Each participant gets `floor(total / n)`; leftover cents go one each to participants in ascending user-id order |
| `exact` | share in cents (integer ≥ 0) | Values must add up to `amountCents` |
| `percent` | basis points (integer 0–10000; 33.33% → `3333`) | Values must add up to `10000` |
| `shares` | share count (integer ≥ 1) | Any positive total; amounts are proportional |

For `percent` and `shares`, each participant gets the floor of their exact share, and leftover cents go to the largest fractional parts, ties broken by user id (largest remainder method; see `DSA_CONCEPTS.md`). The server always computes and returns the final `shareCents`. The client's live preview is only a preview.

---

## 2. Authentication & sessions

- Login and register set a cookie named `token` containing a signed JWT (HS256, payload `{ sub: userId }`, expires after **7 days**).
- Cookie flags: `HttpOnly`, `Path=/`, `Max-Age=604800`. In production also `Secure` and `SameSite=None`; in development `SameSite=Lax`.
  - **Why `SameSite=None` in production:** the client (Vercel) and the API (Render/Railway) are on different sites, so the browser drops a `Lax` cookie on API requests. The alternative is to proxy `/api` through a Vercel rewrite so that both are same-site, and then keep `Lax`.
- The client must send cookies with every request: `fetch(url, { credentials: 'include' })`.
- CORS: the API allows exactly one origin (`CLIENT_ORIGIN`) with `credentials: true`.
- A missing, invalid, or expired token on a protected route returns `401 UNAUTHENTICATED`. The client should then clear its cached user and redirect to `/login`.
- **Rate limit:** `POST /auth/register` and `POST /auth/login` allow **10 requests per 15 minutes per IP**. Further requests get `429 RATE_LIMITED` with a `Retry-After` header in seconds.

---

## 3. Errors

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Splits must add up to the expense total",
    "details": [
      { "path": "splits", "message": "Sum is 9900 but amountCents is 10000" }
    ]
  }
}
```

- `code`: stable, machine-readable. The client switches on this.
- `message`: human-readable and safe to show in a toast.
- `details`: optional, only for validation errors. `path` is the dotted field path (`splits.1.value`).

### Error codes

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION_ERROR` | Body, query, or params fail validation, including split rules |
| 401 | `UNAUTHENTICATED` | No valid session cookie |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password on login (same message for both, to avoid revealing which emails exist) |
| 403 | `NOT_A_MEMBER` | Caller is not a member of the group |
| 403 | `FORBIDDEN` | Caller is a member but lacks permission (e.g. not admin) |
| 404 | `NOT_FOUND` | Resource doesn't exist or is soft-deleted; `message` names the resource |
| 404 | `USER_NOT_FOUND` | Adding a member by an email that has no account |
| 409 | `EMAIL_TAKEN` | Registering with an email that is already used |
| 409 | `ALREADY_MEMBER` | Adding a user who is already in the group |
| 409 | `BALANCE_NOT_ZERO` | Removing a member, or deleting a group, while balances are non-zero |
| 409 | `LAST_ADMIN` | The only admin tries to leave or be removed |
| 429 | `RATE_LIMITED` | Too many auth attempts |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details are logged, never returned) |

**Check order** for group-scoped routes: authentication (401) → group exists (404) → membership (403) → validation (400) → business rules (409).

---

## 4. Resource shapes

These objects are returned by the endpoints below. Fields are never omitted; missing values are `null`.

### User
```json
{ "id": 1, "name": "Aisha", "email": "aisha@example.com", "createdAt": "2026-10-26T09:00:00.000Z" }
```
`passwordHash` is never returned.

### UserRef
A compact user, embedded in other objects.
```json
{ "id": 1, "name": "Aisha" }
```

### Group
```json
{
  "id": 7,
  "name": "Goa Trip",
  "description": "Dec 2026",
  "currency": "INR",
  "createdBy": { "id": 1, "name": "Aisha" },
  "createdAt": "2026-10-26T09:05:00.000Z",
  "memberCount": 4,
  "myRole": "admin",
  "myNetCents": 20000
}
```
`myNetCents` is the caller's net balance in this group: positive means they are owed money, negative means they owe.

### Member
```json
{ "user": { "id": 2, "name": "Rahul", "email": "rahul@example.com" }, "role": "member", "joinedAt": "2026-10-26T09:06:00.000Z" }
```

### Expense
```json
{
  "id": 42,
  "groupId": 7,
  "description": "Dinner at Thalassa",
  "amountCents": 300000,
  "paidBy": { "id": 1, "name": "Aisha" },
  "splitType": "equal",
  "category": "food",
  "expenseDate": "2026-11-02",
  "splits": [
    { "user": { "id": 1, "name": "Aisha" }, "value": null, "shareCents": 100000 },
    { "user": { "id": 2, "name": "Rahul" }, "value": null, "shareCents": 100000 },
    { "user": { "id": 3, "name": "Meera" }, "value": null, "shareCents": 100000 }
  ],
  "createdBy": { "id": 1, "name": "Aisha" },
  "createdAt": "2026-11-02T18:00:00.000Z",
  "updatedAt": "2026-11-02T18:00:00.000Z"
}
```
- `value` echoes what the user entered (`null` for equal, cents for exact, basis points for percent, a count for shares). It is stored as `expense_splits.raw_value`.
- `category` is one of: `food`, `transport`, `stay`, `groceries`, `utilities`, `entertainment`, `shopping`, `other`, or `null`.
- **Invariant:** the `shareCents` values always add up to `amountCents`.

### Settlement
```json
{
  "id": 15,
  "groupId": 7,
  "from": { "id": 3, "name": "Meera" },
  "to": { "id": 1, "name": "Aisha" },
  "amountCents": 175000,
  "note": "UPI",
  "settledAt": "2026-11-05T10:00:00.000Z",
  "createdBy": { "id": 3, "name": "Meera" }
}
```
`from` paid `to` outside the app. Due only records the payment.

### Activity
```json
{
  "id": 301,
  "groupId": 7,
  "actor": { "id": 1, "name": "Aisha" },
  "action": "expense.updated",
  "entityType": "expense",
  "entityId": 42,
  "payload": { "description": "Dinner at Thalassa", "amountCents": 300000, "previousAmountCents": 280000 },
  "createdAt": "2026-11-02T18:10:00.000Z"
}
```
`action` is one of: `group.created`, `group.updated`, `member.added`, `member.removed`, `expense.created`, `expense.updated`, `expense.deleted`, `settlement.created`, `settlement.deleted`.

### Notification
```json
{ "id": 88, "type": "expense.created", "message": "Aisha added \"Dinner at Thalassa\" (₹3,000.00) in Goa Trip", "groupId": 7, "isRead": false, "createdAt": "2026-11-02T18:00:01.000Z" }
```
`type` is one of: `expense.created`, `expense.updated`, `expense.deleted`, `settlement.created`, `member.added`.

### Transfer
Used by balances and simplify.
```json
{ "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 175000 }
```

---

## 5. Endpoints

### 5.1 Auth

#### POST /api/auth/register
Creates an account and logs the user in.

**Auth:** none · **Rate limited**

Request:
```json
{ "name": "Aisha", "email": "aisha@example.com", "password": "correct-horse-battery" }
```
| Field | Rules |
|-------|-------|
| `name` | string, 1–50 chars |
| `email` | valid email, max 254 chars, stored lowercase |
| `password` | string, 8–72 chars (bcrypt ignores bytes after 72) |

**201 Created:** sets the `token` cookie and returns `{ "user": User }`.

Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED`.

---

#### POST /api/auth/login
**Auth:** none · **Rate limited**

Request:
```json
{ "email": "aisha@example.com", "password": "correct-horse-battery" }
```

**200 OK:** sets the `token` cookie and returns `{ "user": User }`.

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`.

---

#### POST /api/auth/logout
Clears the cookie. Succeeds even if the session has already expired.

**Auth:** user (does not fail with 401)

**204 No Content**

---

#### GET /api/auth/me
Returns the logged-in user. The client calls this on startup to restore the session.

**200 OK:** `{ "user": User }`

Errors: `401 UNAUTHENTICATED`.

---

#### PATCH /api/auth/me
Updates the profile (Settings screen). Send only the fields that change.

**Auth:** user

Request:
```json
{ "name": "Aisha K", "currentPassword": "correct-horse-battery", "newPassword": "even-better-passphrase" }
```
| Field | Rules |
|-------|-------|
| `name` | optional, 1–50 chars |
| `newPassword` | optional, 8–72 chars; requires `currentPassword` |
| `currentPassword` | required only when `newPassword` is sent |

Email changes are out of scope for v1.

**200 OK:** `{ "user": User }`

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `401 INVALID_CREDENTIALS` (wrong `currentPassword`).

---

### 5.2 Groups

#### GET /api/groups
Lists groups the caller belongs to, with the caller's balance in each. This feeds the Dashboard.

**Auth:** user

**200 OK:**
```json
{ "items": [Group, ...] }
```
Not paginated (a user belongs to few groups). Sorted by most recent activity.

---

#### POST /api/groups
Creates a group. The creator becomes its first member with role `admin`.

**Auth:** user

Request:
```json
{ "name": "Goa Trip", "description": "Dec 2026", "currency": "INR" }
```
| Field | Rules |
|-------|-------|
| `name` | 1–60 chars |
| `description` | optional, max 200 chars |
| `currency` | optional, 3 uppercase letters, defaults to `"INR"` |

**201 Created:** `{ "group": Group }`

Errors: `400 VALIDATION_ERROR`.

---

#### GET /api/groups/:id
Returns the group and its members.

**Auth:** member

**200 OK:**
```json
{ "group": Group, "members": [Member, ...] }
```
Members are sorted by `joinedAt`.

Errors: `404 NOT_FOUND`, `403 NOT_A_MEMBER`.

---

#### PATCH /api/groups/:id
**Auth:** admin

Request (any subset):
```json
{ "name": "Goa Trip 2026", "description": "Dec 20–27" }
```
`currency` cannot be changed after creation; sending it returns `400`.

**200 OK:** `{ "group": Group }`

Errors: `400`, `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

---

#### DELETE /api/groups/:id
Permanently deletes the group and everything in it: expenses, splits, settlements, activity, and memberships.

**Auth:** admin

**⚑ Decision:** a group can only be deleted when every member's balance is zero. This stops someone from wiping out unpaid debts.

**204 No Content**

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`, `409 BALANCE_NOT_ZERO`.

---

### 5.3 Members

#### POST /api/groups/:id/members
Adds an existing user to the group by email.

**Auth:** member

**⚑ Decision:** any member can add people, not only admins, which matches how friend groups use Splitwise. Inviting people who don't have an account yet is out of scope for v1.

Request:
```json
{ "email": "rahul@example.com" }
```
New members always join with role `member`.

**201 Created:** `{ "member": Member }`

Side effects: an activity entry (`member.added`) and a notification for the added user.

Errors: `400`, `403 NOT_A_MEMBER`, `404 NOT_FOUND` (group), `404 USER_NOT_FOUND`, `409 ALREADY_MEMBER`.

---

#### DELETE /api/groups/:id/members/:userId
Removes a member. When `:userId` is the caller, this means "leave the group".

**Auth:** admin (to remove anyone) or the member themselves

Rules:
- The member's net balance in the group must be zero → otherwise `409 BALANCE_NOT_ZERO`.
- The only admin cannot leave or be removed → `409 LAST_ADMIN`.
- Their past expenses, splits, and settlements stay in the ledger, so history and other members' balances don't change.

**204 No Content**

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`, `409 BALANCE_NOT_ZERO`, `409 LAST_ADMIN`.

---

### 5.4 Expenses

#### GET /api/groups/:id/expenses
Paginated list of the group's expenses, excluding soft-deleted ones.

**Auth:** member

Query:
| Param | Type | Notes |
|-------|------|-------|
| `limit` | int 1–100 | default 20 |
| `cursor` | string | from the previous page's `nextCursor` |
| `category` | category | optional filter |
| `paidBy` | user id | optional filter |
| `involving` | user id | optional: expenses this user paid for or has a share in |
| `from`, `to` | `YYYY-MM-DD` | optional, inclusive `expenseDate` range |
| `q` | string | optional, case-insensitive match on `description` |

Sorted by `expenseDate` descending, then `id` descending.

**200 OK:**
```json
{ "items": [Expense, ...], "nextCursor": "eyJkIjoiMjAyNi0xMS0wMiIsImkiOjQyfQ" }
```

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

#### POST /api/groups/:id/expenses
Creates an expense and its splits in **one transaction**.

**Auth:** member

Request:
```json
{
  "description": "Dinner at Thalassa",
  "amountCents": 300000,
  "paidBy": 1,
  "splitType": "equal",
  "category": "food",
  "expenseDate": "2026-11-02",
  "splits": [
    { "userId": 1 },
    { "userId": 2 },
    { "userId": 3 }
  ]
}
```

| Field | Rules |
|-------|-------|
| `description` | 1–100 chars |
| `amountCents` | integer, 1 – 1000000000 |
| `paidBy` | user id of a current group member (doesn't have to be the caller) |
| `splitType` | `equal` \| `exact` \| `percent` \| `shares` |
| `category` | optional, see [Expense](#expense) |
| `expenseDate` | optional `YYYY-MM-DD`, defaults to today (server time, UTC); cannot be in the future |
| `splits` | 1–50 entries; each `userId` must be a current member; no duplicate `userId`s. The payer does not have to be included. |
| `splits[].value` | see [split value rules](#1-conventions): omit for `equal`, required for the other types |

Examples of `splits` for the other types:
```json
// exact: values in cents, must add up to amountCents
[{ "userId": 1, "value": 150000 }, { "userId": 2, "value": 100000 }, { "userId": 3, "value": 50000 }]

// percent: values in basis points, must add up to 10000
[{ "userId": 1, "value": 5000 }, { "userId": 2, "value": 3000 }, { "userId": 3, "value": 2000 }]

// shares: positive counts
[{ "userId": 1, "value": 2 }, { "userId": 2, "value": 1 }, { "userId": 3, "value": 1 }]
```

**201 Created:** `{ "expense": Expense }`, with the computed `shareCents` for each split.

Side effects: an activity entry (`expense.created`), notifications for every participant except the caller, and a Socket.IO `expense:created` event to group members.

Errors:
| Status | Code | Example cause |
|--------|------|---------------|
| 400 | `VALIDATION_ERROR` | exact values don't add up to the total; percents ≠ 10000; `value` missing; duplicate `userId`; future date |
| 403 | `NOT_A_MEMBER` | caller isn't in the group |
| 400 | `VALIDATION_ERROR` | `paidBy` or a split `userId` isn't a group member (`details.path` points to the field) |
| 404 | `NOT_FOUND` | group doesn't exist |

---

#### GET /api/expenses/:id
**Auth:** member of the expense's group

**200 OK:** `{ "expense": Expense }`

Errors: `403 NOT_A_MEMBER`, `404 NOT_FOUND` (missing or soft-deleted).

---

#### PATCH /api/expenses/:id
Edits an expense in one transaction. If the amount or the split changes, all splits are recomputed and replaced.

**Auth:** the expense's creator, its payer, or a group admin

**⚑ Decision:** ordinary members cannot edit other people's expenses. This prevents accidental or malicious edits to someone else's spending.

Request: any subset of the [create](#post-apigroupsidexpenses) fields, with one rule: **`amountCents`, `splitType`, and `splits` must be sent together or not at all.** A split only makes sense for a specific total and type.

```json
{ "description": "Dinner + dessert", "amountCents": 330000, "splitType": "equal", "splits": [{ "userId": 1 }, { "userId": 2 }, { "userId": 3 }] }
```

**200 OK:** `{ "expense": Expense }`

Side effects: an activity entry (`expense.updated`, with the previous values in `payload`), notifications, and an `expense:updated` event.

Errors: `400`, `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

---

#### DELETE /api/expenses/:id
**Soft delete:** sets `deleted_at`. The expense disappears from lists and balances but stays in the activity history.

**Auth:** the expense's creator, its payer, or a group admin

**204 No Content**

Side effects: an activity entry (`expense.deleted`), notifications, and an `expense:deleted` event.

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404` (including an expense that is already deleted).

---

### 5.5 Balances & simplification

#### GET /api/groups/:id/balances
Net balance for every member, plus the raw (unsimplified) pairwise debts. Both are computed from the ledger on every request.

**Auth:** member

**200 OK:**
```json
{
  "currency": "INR",
  "members": [
    { "user": { "id": 1, "name": "Aisha" }, "netCents": 20000 },
    { "user": { "id": 2, "name": "Rahul" }, "netCents": -2500 },
    { "user": { "id": 3, "name": "Meera" }, "netCents": -17500 }
  ],
  "pairwise": [
    { "from": { "id": 2, "name": "Rahul" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 10000 },
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 10000 },
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 2, "name": "Rahul" }, "amountCents": 7500 }
  ]
}
```
- `members` includes every current member (even at `0`), plus any former member whose balance is not zero. Sorted by `netCents` descending.
- `netCents > 0`: the member is owed money. `netCents < 0`: the member owes money.
- **Invariant:** the `netCents` values always add up to `0`.
- `pairwise` contains one entry per pair with a non-zero debt (A→B and B→A already netted), sorted by `amountCents` descending.

Errors: `403 NOT_A_MEMBER`, `404`.

---

#### GET /api/groups/:id/simplify
Suggested transfers that settle the whole group (greedy min-cash-flow). This is a read-only suggestion; nothing is recorded.

**Auth:** member

**200 OK:**
```json
{
  "currency": "INR",
  "transfers": [
    { "from": { "id": 3, "name": "Meera" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 17500 },
    { "from": { "id": 2, "name": "Rahul" }, "to": { "id": 1, "name": "Aisha" }, "amountCents": 2500 }
  ],
  "pairwiseCount": 3,
  "simplifiedCount": 2
}
```
Guarantees: at most `n − 1` transfers for `n` members with a non-zero balance; every `amountCents > 0`; making all the transfers brings every balance to zero; the same ledger always gives the same output. An empty `transfers` array means the group is settled.

Errors: `403 NOT_A_MEMBER`, `404`.

---

### 5.6 Settlements

#### GET /api/groups/:id/settlements
**Auth:** member

Query: `limit`, `cursor`, and an optional `involving` (user id). Sorted by `settledAt` descending.

**200 OK:** `{ "items": [Settlement, ...], "nextCursor": "..." | null }`

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

#### POST /api/groups/:id/settlements
Records a payment made outside the app. Balances update immediately.

**Auth:** member

Request:
```json
{ "fromUserId": 3, "toUserId": 1, "amountCents": 17500, "note": "UPI", "settledAt": "2026-11-05T10:00:00.000Z" }
```
| Field | Rules |
|-------|-------|
| `fromUserId` | current group member (the payer) |
| `toUserId` | current group member, different from `fromUserId` |
| `amountCents` | integer, 1 – 1000000000 |
| `note` | optional, max 100 chars |
| `settledAt` | optional ISO timestamp, defaults to now; cannot be in the future |

**⚑ Decision:** a settlement **may be larger than what is owed**. It records a real payment, and the API shouldn't refuse to record something that happened; the debt simply flips direction. To catch typos, the client shows a confirmation when `amountCents` is more than the suggested transfer.

**⚑ Decision:** any member can record a settlement between any two members (for example, the group's organiser logging payments for everyone). Every settlement appears in the activity log with its creator.

**201 Created:** `{ "settlement": Settlement }`

Side effects: an activity entry (`settlement.created`), a notification for `toUserId` (and for `fromUserId` if they didn't record it), and a `settlement:created` event.

Errors: `400 VALIDATION_ERROR` (including `fromUserId === toUserId` or a non-member user), `403 NOT_A_MEMBER`, `404`.

---

#### DELETE /api/settlements/:id
Undoes a settlement by deleting it permanently. The deletion is kept in the activity log with the full settlement in `payload`.

**Auth:** the settlement's creator, its payer (`from`), its payee (`to`), or a group admin

**204 No Content**

Errors: `403 NOT_A_MEMBER`, `403 FORBIDDEN`, `404`.

---

### 5.7 Activity

#### GET /api/groups/:id/activity
Group history for the Activity tab.

**Auth:** member

Query: `limit`, `cursor`. Sorted by `createdAt` descending.

**200 OK:** `{ "items": [Activity, ...], "nextCursor": "..." | null }`

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

### 5.8 Summary

#### GET /api/me/summary
"You owe / you are owed" across all of the caller's groups, for the Dashboard header. Totals are **grouped by currency**, because amounts in different currencies can't be added together.

**Auth:** user

**200 OK:**
```json
{
  "totals": [
    { "currency": "INR", "owedToYouCents": 20000, "youOweCents": 4500, "netCents": 15500 }
  ],
  "groups": [
    { "groupId": 7, "name": "Goa Trip", "currency": "INR", "netCents": 20000 },
    { "groupId": 9, "name": "Flat 302", "currency": "INR", "netCents": -4500 }
  ]
}
```
- `owedToYouCents` is the sum of the caller's positive group balances in that currency; `youOweCents` is the sum of the negative ones as a positive number.
- `groups` includes only groups where the caller's balance is not zero.

---

### 5.9 Analytics & export

#### GET /api/groups/:id/analytics
Data for the Analytics tab charts. Soft-deleted expenses are excluded, and settlements are not counted as spending.

**Auth:** member

Query: optional `from`, `to` (`YYYY-MM-DD`, inclusive). By default it covers the group's whole history.

**200 OK:**
```json
{
  "currency": "INR",
  "totalSpentCents": 450000,
  "byCategory": [
    { "category": "food", "totalCents": 300000 },
    { "category": "transport", "totalCents": 150000 }
  ],
  "byMember": [
    { "user": { "id": 1, "name": "Aisha" }, "paidCents": 300000, "shareCents": 100000 },
    { "user": { "id": 2, "name": "Rahul" }, "paidCents": 150000, "shareCents": 175000 },
    { "user": { "id": 3, "name": "Meera" }, "paidCents": 0, "shareCents": 175000 }
  ],
  "byMonth": [
    { "month": "2026-11", "totalCents": 450000 }
  ]
}
```
- `byCategory`: sorted by `totalCents` descending; uncategorised expenses appear as `"category": null`.
- `byMember`: `paidCents` = what they paid for; `shareCents` = what they consumed.
- `byMonth`: ascending; months with no expenses are included with `0` so the chart has no gaps.

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

#### GET /api/groups/:id/export
Downloads a report file.

**Auth:** member

Query:
| Param | Values |
|-------|--------|
| `format` | `csv` (default) \| `pdf` (stretch goal; returns `400` until implemented) |
| `from`, `to` | optional `YYYY-MM-DD` |

**200 OK:** a file body, not JSON.
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="goa-trip-2026-11-25.csv"`

CSV columns, one row per expense or settlement in date order:
```
date,type,description,category,paid_by,amount,currency,split_type,participants
2026-11-02,expense,Dinner at Thalassa,food,Aisha,3000.00,INR,equal,"Aisha: 1000.00; Rahul: 1000.00; Meera: 1000.00"
2026-11-05,settlement,UPI,,Meera,1750.00,INR,,"Meera → Aisha"
```
Amounts in the CSV are formatted in major units (`3000.00`) for spreadsheet use. This is the **only** place where the API outputs non-cent amounts.

Errors: `400`, `403 NOT_A_MEMBER`, `404`.

---

### 5.10 Notifications

#### GET /api/notifications
**Auth:** user

Query: `limit`, `cursor`, and `unread=true` to return only unread items.

**200 OK:**
```json
{ "items": [Notification, ...], "nextCursor": null, "unreadCount": 3 }
```

---

#### PATCH /api/notifications
Marks notifications as read.

**Auth:** user

Request: either a list of IDs or all of them:
```json
{ "ids": [88, 89] }
```
```json
{ "all": true }
```
IDs that don't belong to the caller are ignored (no error, to avoid revealing other users' IDs).

**200 OK:** `{ "unreadCount": 0 }`

Errors: `400 VALIDATION_ERROR` (neither `ids` nor `all`, or both).

---

### 5.11 Health

#### GET /api/health
Used by the hosting platform's health check (and by Docker, if the Docker stretch goal is done).

**Auth:** none

**200 OK:** `{ "status": "ok", "db": "ok" }`
**503 Service Unavailable:** `{ "status": "error", "db": "unreachable" }`

---

## 6. Real-time events (Socket.IO)

- **Connect:** `io(API_ORIGIN, { withCredentials: true })`. The server authenticates using the same `token` cookie and rejects the connection if the cookie is missing or invalid.
- **Rooms:** on connect, the server joins the socket to `user:<id>` and to `group:<id>` for each group the user belongs to. The server also updates these rooms when members are added or removed.
- **Direction:** server → client only. All changes go through the REST API.
- **Client behaviour:** on any event, invalidate the matching TanStack Query keys (`['group', groupId]`, `['expenses', groupId]`, `['balances', groupId]`, `['summary']`, `['notifications']`) instead of patching the cache by hand.

| Event | Room | Payload |
|-------|------|---------|
| `expense:created` | `group:<id>` | `{ "groupId": 7, "expense": Expense, "actorId": 1 }` |
| `expense:updated` | `group:<id>` | `{ "groupId": 7, "expense": Expense, "actorId": 1 }` |
| `expense:deleted` | `group:<id>` | `{ "groupId": 7, "expenseId": 42, "actorId": 1 }` |
| `settlement:created` | `group:<id>` | `{ "groupId": 7, "settlement": Settlement, "actorId": 3 }` |
| `settlement:deleted` | `group:<id>` | `{ "groupId": 7, "settlementId": 15, "actorId": 3 }` |
| `member:added` | `group:<id>` | `{ "groupId": 7, "member": Member, "actorId": 1 }` |
| `member:removed` | `group:<id>` | `{ "groupId": 7, "userId": 2, "actorId": 1 }` |
| `notification:new` | `user:<id>` | `{ "notification": Notification }` |

Clients should ignore events where `actorId` is their own user id, because they already updated after their own request.

---

## 7. Permissions matrix

| Action | Any user | Member | Expense/settlement creator | Payer / payee | Admin |
|--------|:-:|:-:|:-:|:-:|:-:|
| Create group | ✓ | | | | |
| View group, expenses, balances, activity, analytics, export | | ✓ | | | ✓ |
| Edit group / delete group (balances zero) | | | | | ✓ |
| Add member | | ✓ | | | ✓ |
| Remove another member | | | | | ✓ |
| Leave group (own balance zero) | | ✓ | | | ✓ (unless last admin) |
| Create expense | | ✓ | | | ✓ |
| Edit / delete expense | | | ✓ | ✓ (payer) | ✓ |
| Record settlement | | ✓ | | | ✓ |
| Undo settlement | | | ✓ | ✓ (payer or payee) | ✓ |

A member who is removed from a group immediately loses access to it (`403 NOT_A_MEMBER`).

---

## 8. Decisions log

These were left open in `PROJECT_PLAN.md` and are decided here. Each one needs a matching integration test.

| # | Question | Decision | Test |
|---|----------|----------|------|
| D1 | Settlement larger than the debt? | **Allowed**; the balance flips direction. The client asks for confirmation. | Record 200 against a 100 debt → payer's balance becomes +100 |
| D2 | Remove a member with a non-zero balance? | **Rejected** with `409 BALANCE_NOT_ZERO` | Remove a member who owes → 409; settle up → remove → 204 |
| D3 | Who can edit or delete an expense? | **Creator, payer, or admin** | Another member gets `403 FORBIDDEN` on PATCH and DELETE |
| D4 | Delete a group with outstanding balances? | **Rejected** with `409 BALANCE_NOT_ZERO`; otherwise permanent delete | Delete an unsettled group → 409 |
| D5 | Who can add members? | **Any member** | A non-admin member adds by email → 201 |
| D6 | Who can record a settlement? | **Any member, for any two members** | A third member records A→B → 201 |
| D7 | Can the only admin leave? | **No:** `409 LAST_ADMIN`. A future endpoint can promote another member first. | The sole admin leaves → 409 |
| D8 | Expense or settlement dates in the future? | **Rejected** with `400` | Tomorrow's date → 400 |
| D9 | Non-member requests: 403 or 404? | **403 `NOT_A_MEMBER`** for groups that exist (as the plan's tests expect); 404 only for missing IDs | A non-member GETs a group → 403 |

### Additions beyond `PROJECT_PLAN.md` Section 7
- `PATCH /api/auth/me`: needed by the Settings screen (profile, password)
- `GET /api/groups/:id/activity`: needed by the Activity tab
- `GET /api/health`: needed by the hosting platform's health check (Phase 5)
- `PATCH /api/notifications`: request body defined as `{ ids }` or `{ all: true }`
