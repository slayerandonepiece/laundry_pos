# Express Laundry — Mobile & Client HTTP API Specification (`/api/v1`)

This document is the endpoint reference for frontend and mobile clients
(Flutter "MyShop", etc.) consuming the Express Laundry backend API — paths,
methods, request and response shapes.

> **For outlet scoping and payment-method resolution, `.agents/MOBILE-API-CONTRACT.md`
> is authoritative.** It is generated from the route handlers with `file:line`
> citations and states which calls *require* an outlet and why. This file
> summarises those rules; where the two differ, the contract file wins.

---

## Global Conventions

### 1. Base URL

- **Local Development (Android Emulator)**: `http://10.0.2.2:3000`
- **Local Development (iOS Simulator / Desktop / Web)**: `http://127.0.0.1:3000` (or `http://localhost:3000`)
- **Remote Staging**: `https://express-laundry-staging.vercel.app`

### 2. Authentication & Tenant Headers

Except for `POST /api/v1/auth/login`, all endpoints require:

- **Authorization Header**: `Authorization: Bearer <token>`
  - Session token received upon successful login (`session.token`, 43-character base64url string).
- **Store Context Header**: `X-Store-Id: <storeId>`
  - Identifies which tenant store is being operated on.
  - **Mandatory** for multi-store owners.
  - **Optional** for single-store owners and employees (auto-resolves if omitted).
- **Outlet Context Header**: `X-Outlet-Id: <outletId>`
  - Identifies which physical outlet of the organization is being operated on.
    Also accepted as an `?outletId=` query parameter.
  - **Mandatory for `EMPLOYEE`** on `GET|POST /api/v1/orders`,
    `GET /api/v1/orders/sync`, `POST /api/v1/orders/bulk-sync` and
    `GET /api/v1/dashboard/rollups` — those calls return `403 Forbidden`
    without it. The server deliberately never falls back to a default outlet
    for an employee.
  - **Optional for `OWNER`**: omitting it means "the whole organization".
    Never send an empty string — absence is meaningful.
  - **Ignored** on the per-order routes (`/orders/[orderCode]/**`), which
    derive the outlet from the order itself.
  - **`GET /api/v1/dashboard` reads `?outletId=` only** and ignores the header.
  - `POST /api/v1/orders` returns `400` if the header and `body.outletId`
    disagree.
- **Content-Type Header**: `Content-Type: application/json` for requests with JSON body.

### 3. Response Headers

All API responses include:

- `Content-Type: application/json` (or `application/pdf` for PDF downloads)
- `Cache-Control: private, no-store` (prevents caching of private multi-tenant data)

### 4. Standard Error Response Shapes

- **401 Unauthorized**:
  ```json
  {
    "error": "Unauthorized"
  }
  ```
- **403 Forbidden** (Role mismatch or tenant lock):
  ```json
  {
    "error": "Forbidden",
    "reason": "store_locked" // Optional: "membership_inactive" | "store_locked" | "store_archived" | "payment_lapsed" | "billing_pending"
  }
  ```
- **400 Bad Request** (Validation or business rule error):
  ```json
  {
    "error": "Payment must be no more than the outstanding balance."
  }
  ```
  _(Or for schema issues: `{ "error": "...", "issues": [...] }`)_
- **404 Not Found**:
  ```json
  {
    "error": "Order not found."
  }
  ```
- **429 Too Many Requests** (Login rate-limited):
  ```json
  {
    "error": "Too many failed attempts. Try again in 900 seconds."
  }
  ```
- **500 Internal Server Error**:
  ```json
  {
    "error": "Internal server error"
  }
  ```

---

## 1. Authentication

### `POST /api/v1/auth/login`

Authenticates an owner or employee by username and password. Issues a 30-day session token and returns caller info with assigned store memberships.

- **Auth**: Public (Rate-limited: 5 failed attempts per 15 minutes per IP/username).
- **Request Body**:
  ```json
  {
    "username": "john_doe",
    "password": "SecretPassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "token": "43_character_base64url_session_token",
    "user": {
      "id": "usr_cuid123",
      "name": "John Doe",
      "username": "john_doe",
      "isSuperAdmin": false,
      "mustChangePassword": false
    },
    "stores": [
      {
        "storeId": "store_cuid456",
        "storeName": "RK Laundry",
        "role": "EMPLOYEE",
        "status": "ACTIVE",
        "isLocked": false,
        "blockedReason": null,
        "paidThroughDate": "2027-09-08"
      }
    ]
  }
  ```

---

### `POST /api/v1/auth/logout`

Revokes the caller's active session token.

- **Auth**: Bearer token required.
- **Request Body**: None.
- **Response `200 OK`**:
  ```json
  {
    "success": true
  }
  ```

---

### `GET /api/v1/auth/status`

Returns current session user details and accessible stores. Used for app startup / session revalidation.

- **Auth**: Bearer token required.
- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "usr_cuid123",
      "name": "John Doe",
      "username": "john_doe",
      "isSuperAdmin": false,
      "mustChangePassword": false
    },
    "stores": [
      {
        "storeId": "store_cuid456",
        "storeName": "RK Laundry",
        "role": "OWNER",
        "status": "ACTIVE",
        "isLocked": false,
        "blockedReason": null,
        "paidThroughDate": "2027-09-08"
      }
    ]
  }
  ```

---

### `POST /api/v1/auth/change-password`

Changes password for the logged-in user when current password is known. Clears `mustChangePassword` and revokes other sessions.

- **Auth**: Bearer token required.
- **Request Body**:
  ```json
  {
    "oldPassword": "CurrentPassword123!",
    "newPassword": "NewPassword456!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true
  }
  ```

---

### `POST /api/v1/auth/set-password`

Allows initial password setup when `user.mustChangePassword` is `true`. Does not require `oldPassword`.

- **Auth**: Bearer token required (user must have `mustChangePassword === true`).
- **Request Body**:
  ```json
  {
    "newPassword": "NewSecurePassword456!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true
  }
  ```

---

## 2. Store Memberships

### `GET /api/v1/memberships`

Returns all active store memberships for the authenticated user, including store lock/subscription status. Drives the mobile store-switcher.

- **Auth**: Bearer token required.
- **Response `200 OK`**:
  ```json
  [
    {
      "storeId": "store_cuid456",
      "storeName": "RK Laundry",
      "role": "OWNER",
      "status": "ACTIVE",
      "isLocked": false,
      "blockedReason": null,
      "paidThroughDate": "2027-09-08"
    }
  ]
  ```

---

## 3. Store Profile

### `GET /api/v1/profile`

Fetches store contact and identity details along with the caller's display name. Accessible to both **`OWNER` and `EMPLOYEE`**.

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**:
  ```json
  {
    "name": "Alex Johnson",
    "phone": "9876543210",
    "email": "store@example.com",
    "store": "RK Laundry",
    "address": "123 Main Street, Bangalore",
    "status": "ACTIVE",
    "isLocked": false
  }
  ```

---

### `PUT /api/v1/profile`

Updates store details and caller's name. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER` only).
- **Request Body**:
  ```json
  {
    "name": "Alex Johnson",
    "phone": "9876543210",
    "email": "store@example.com",
    "store": "RK Laundry Updated",
    "address": "456 New Street, Bangalore"
  }
  ```
- **Response `200 OK`**: Returns updated profile DTO.

---

## 4. Products

### `GET /api/v1/products`

Lists the active service catalog for the selected store.

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "prod_1",
      "name": "Shirt Wash & Iron",
      "category": "Laundry",
      "type": "item",
      "active": true,
      "price": 5000
    },
    {
      "id": "prod_2",
      "name": "Bed Sheets (Weight)",
      "category": "Dry Clean",
      "type": "weight",
      "active": true,
      "slabs": [
        { "limit": 5, "price": 20000 },
        { "limit": 10, "price": 35000 }
      ],
      "extra": 3500
    }
  ]
  ```
  _(Note: All monetary amounts are integers in **paise**, where 100 paise = ₹1.00)._

---

### `POST /api/v1/products`

Creates a new service product. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body (Item Product)**:
  ```json
  {
    "name": "T-Shirt Wash",
    "category": "Laundry",
    "type": "item",
    "price": 4000
  }
  ```
- **Request Body (Weight Product)**:
  ```json
  {
    "name": "Curtains",
    "category": "Household",
    "type": "weight",
    "slabs": [{ "limit": 5, "price": 30000 }],
    "extra": 6000
  }
  ```
- **Response `201 Created`**: Returns created product DTO.

---

## 5. Orders

### `GET /api/v1/orders`

Lists orders for the selected store, sorted newest first (`orderNumber` descending).

- **Auth**: Bearer token + `X-Store-Id`.
- **Query Parameters**:
  - `limit` _(optional)_: Positive integer clamped to `1–100` (e.g. `?limit=30`).
  - `sort` _(optional)_: `'recent'` (newest first) or `'default'`.
- **Example**: `GET /api/v1/orders?limit=20&sort=recent`
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "EL-104",
      "name": "Aarav Sharma",
      "phone": "9876543210",
      "date": "2026-09-11",
      "due": "2026-09-14",
      "completed": null,
      "status": "In Progress",
      "lines": [
        {
          "productId": "prod_1",
          "name": "Shirt Wash & Iron",
          "quantity": 3,
          "unit": "pcs",
          "amount": 15000
        }
      ],
      "payments": [
        {
          "id": "pay_1",
          "amount": 5000,
          "date": "2026-09-11",
          "method": "Cash"
        }
      ],
      "notes": "Handle with care",
      "history": [
        { "status": "Pending", "at": "2026-09-11T10:00:00.000Z", "by": "Alex" },
        {
          "status": "In Progress",
          "at": "2026-09-11T11:30:00.000Z",
          "by": "Alex"
        }
      ]
    }
  ]
  ```

---

### `POST /api/v1/orders`

Creates a new order. Order totals are recomputed server-side against live catalog pricing. Pass client idempotency key to prevent duplicates on retries.

- **Auth**: Bearer token + `X-Store-Id`.
- **Request Body**:
  ```json
  {
    "idempotencyKey": "uuid-v4-generated-by-client",
    "customerName": "Aarav Sharma",
    "phone": "9876543210",
    "dueDate": "2026-09-15",
    "notes": "Fast track",
    "entries": [
      {
        "productId": "prod_1",
        "quantity": 2
      }
    ],
    "initialPayment": {
      "amount": 5000,
      "method": "Cash"
    }
  }
  ```
- **Response `201 Created`**: Returns created order DTO. Resubmitting the same `idempotencyKey` returns `200/201` with the existing order without creating duplicate rows.

---

### `GET /api/v1/orders/[orderCode]`

Retrieves order detail along with customer invoice readiness.

- **Auth**: Bearer token + `X-Store-Id`.
- **Path Parameter**: `orderCode` (e.g. `EL-104`).
- **Response `200 OK`**:
  ```json
  {
    "id": "EL-104",
    "name": "Aarav Sharma",
    "phone": "9876543210",
    "date": "2026-09-11",
    "due": "2026-09-15",
    "completed": "2026-09-14",
    "status": "Delivered",
    "lines": [...],
    "payments": [...],
    "notes": "",
    "history": [...],
    "invoice": {
      "exists": true,
      "invoiceSeq": 12,
      "accessToken": "43_character_public_access_token",
      "canGenerate": true
    }
  }
  ```
  _(Note: `canGenerate` is `true` only when the order is **paid in full AND delivered**)._

---

### `PATCH /api/v1/orders/[orderCode]/status`

Transitions order status across the 4 work statuses: `'Pending'`, `'In Progress'`, `'Ready'`, `'Delivered'`.

- **Auth**: Bearer token + `X-Store-Id`.
- **Request Body**:
  ```json
  {
    "status": "Ready"
  }
  ```
- **Response `200 OK`**: Returns updated order DTO with new entry in `history`.
- **Rules**: status only moves forward (`Pending` → `In Progress` → `Ready` → `Delivered`); skipping ahead is allowed and re-sending the current status is a no-op. `Delivered` is final. A backward move or any change after `Delivered` returns `400` with a plain message. **`Delivered` is refused with `400` while a balance is due** (`"Collect the balance of ₹50 before marking this order delivered."`): use `POST /orders/{code}/deliver` to collect and deliver together.

---

### `POST /api/v1/orders/[orderCode]/cancel`

Cancels an order that has **not been delivered**. **Owner only.**

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**: `{ "reason": "Customer asked to cancel" }` (3 to 500 characters, kept in the audit trail).
- **Response `200 OK`**: `{ "ok": true }`. The order leaves `GET /orders`, `GET /orders/{code}` answers `404`, and `/orders/sync` returns it once with `deleted: true` so devices drop it.
- **Errors**: `400` for a missing or short reason or a delivered order (`Delivered orders are final and cannot be cancelled.`), `403` for an employee, `404` unknown order. Money already collected is not refunded by this call.

---

### `POST /api/v1/orders/[orderCode]/deliver`

Collects the outstanding balance (if any) and marks the order delivered in **one transaction**: if the payment is refused the order is not delivered, and if delivery fails no payment is kept. Allowed for `OWNER` and for an `EMPLOYEE` who holds the order's outlet.

- **Auth**: Bearer token + `X-Store-Id`.
- **Request Body** (every field optional when nothing is due):
  ```json
  { "method": "Cash", "amount": 5000, "clientActionId": "uuid" }
  ```
  `method` is required when a balance is due and must be a method that appears **after** the order (`stage` `POST_ORDER` or `BOTH`); Cash on delivery is refused. `amount`, if sent, must equal the balance exactly (omit it to pay the balance). `clientActionId` makes a retry a no-op: the same id returns the delivered order without a second payment.
- **Response `200 OK`**: the updated order DTO (`status: "Delivered"`, the new payment with its `receiptNumber`).
- **Errors**: `400` with the explanation (`Choose how the balance was paid.`, `Collect the full balance of ₹…`, a stage/COD rejection, or `Delivered orders are final…` when it was already delivered by a different request), `403` outlet, `404`.

---

### `GET /api/v1/orders/[orderCode]/message`

The customer message for the order's **current status**, built from the organization's template (set by the platform administrator).

- **Auth**: Bearer token + `X-Store-Id`; an employee needs the order's outlet.
- **Response `200 OK`**:
  ```json
  {
    "statusKey": "READY", "enabled": true,
    "text": "Hi Ravi, your laundry order 1000004314 at … Order details: {link}. Thank you.",
    "linkPath": "/o/<token>/view", "pdfPath": "/o/<token>", "pdfName": "Order 1000004314",
    "attachment": "ORDER_SLIP_PDF"
  }
  ```
  Every placeholder is filled except `{link}`: replace it with your origin + `linkPath` and attach the PDF at origin + `pdfPath` where the device can share files, otherwise send the text. `enabled: false` means no message is offered for this status. Delivered messages link to the invoice (`/i/<token>/view`); earlier statuses link to the order slip (`/o/<token>/view`). A template that asks for the invoice before one exists falls back to the slip.

### `GET /api/v1/orders/[orderCode]/slip/pdf[?download=1]`

The order slip PDF (order, items, total, paid, amount due; no invoice number). Staff-authenticated like the invoice PDF. The public customer link is `/o/<token>` (PDF) and `/o/<token>/view` (page), reached only by the opaque token.

---

### `POST /api/v1/orders/[orderCode]/payments`

Records an order payment. Transactionally locks the order row (`SELECT ... FOR UPDATE`) to prevent concurrent overpayment. Allowed for both **`OWNER` and `EMPLOYEE`**.

- **Auth**: Bearer token + `X-Store-Id`.
- **Request Body**:
  ```json
  {
    "amount": 5000,
    "method": "UPI"
  }
  ```
- **Response `201 Created`**: Returns updated order DTO.
- **Error**: Returns `400 Bad Request` if `amount > remaining balance`.

---

### `GET /api/v1/orders/[orderCode]/invoice`

Get-or-create customer invoice.

- **Auth**: Bearer token + `X-Store-Id`.
- **Behavior**: Refuses generation (`400 Bad Request`) unless the order is **paid in full AND status is 'Delivered'**.
- **Response `200 OK`**:
  ```json
  {
    "id": "inv_cuid789",
    "invoiceSeq": 15,
    "orderCode": "EL-104",
    "accessToken": "43_char_url_safe_token",
    "generatedAt": "2026-09-11T12:00:00.000Z"
  }
  ```

---

### `GET /api/v1/orders/[orderCode]/invoice/pdf`

Streams the rendered customer invoice PDF binary.

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**: Binary stream (`Content-Type: application/pdf`).

---

### `GET /api/v1/orders/customer-lookup`

Lookup customer name from previous orders by phone number.

- **Auth**: Bearer token + `X-Store-Id`.
- **Query Parameter**: `phone` (e.g. `?phone=9876543210`).
- **Response `200 OK`**:
  ```json
  {
    "name": "Aarav Sharma"
  }
  ```
  _(Returns `{ "name": null }` if customer has not ordered previously)._

---

### `GET /api/v1/orders/sync`

Incremental sync endpoint returning orders updated since a high-water cursor.

- **Auth**: Bearer token + `X-Store-Id`.
- **Query Parameters**:
  - `since` _(optional)_: Cursor string formatted as `<isoTimestamp>_<orderNumber>` (e.g. `2026-09-11T10:00:00.000Z_104`).
  - `limit` _(optional)_: Integer `1–200` (default: 50).
- **Response `200 OK`**:
  ```json
  {
    "orders": [...],
    "nextCursor": "2026-09-11T14:30:00.000Z_112",
    "hasMore": false
  }
  ```

---

### `POST /api/v1/orders/bulk-sync`

Bulk synchronizes offline-queued mutations (order creations, status changes, payments).

- **Auth**: Bearer token + `X-Store-Id`.
- **Request Body**:
  ```json
  {
    "actions": [
      {
        "type": "create_order",
        "payload": {
          "idempotencyKey": "offline-uuid-1",
          "customerName": "Customer One",
          "phone": "9876543210",
          "dueDate": "2026-09-15",
          "entries": [{ "productId": "prod_1", "quantity": 1 }]
        }
      },
      {
        "type": "update_status",
        "payload": {
          "orderCode": "EL-104",
          "status": "Delivered"
        }
      },
      {
        "type": "record_payment",
        "payload": {
          "orderCode": "EL-104",
          "amount": 5000,
          "method": "Cash"
        }
      }
    ]
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "results": [
      { "success": true, "order": { "id": "EL-105", ... } },
      { "success": true, "order": { "id": "EL-104", ... } },
      { "success": true, "order": { "id": "EL-104", ... } }
    ]
  }
  ```

---

## 6. Payment Methods

Payment methods are **organization-level**, drawn from a platform catalogue
that only Super Admin can add to. An owner enables or disables which of them
their organization accepts; nobody creates or renames one through this API.

This matters at checkout: an outlet-owned order is validated against an
**enabled** `OrganizationPaymentMethod`, matched by id, code or
case-insensitive name. A method that is not in this list will be rejected
with `400 "That payment method is no longer available."` Submit the `name`
exactly as returned.

An organization with no enabled methods can take no prepaid order and collect
no balance — its owner must enable one in the web workspace
(Profile → Payment methods). Clients should show that as an empty state, not
fall back to a hardcoded "Cash".

### `GET /api/v1/payment-methods`

Lists the organization's **enabled** payment methods.

- **Auth**: Bearer token + `X-Store-Id`.
- **Query**: `?all=true` also returns disabled methods, for an owner's
  settings screen.
- **Response `200 OK`**:
  ```json
  [
    { "id": "ppm_0", "code": "COD", "name": "Cash on delivery", "enabled": true, "stage": "PRE_ORDER" },
    { "id": "ppm_1", "code": "CASH", "name": "Cash", "enabled": true, "stage": "POST_ORDER" },
    { "id": "ppm_2", "code": "UPI", "name": "Upi", "enabled": true, "stage": "BOTH" }
  ]
  ```
  `id` is the **platform** method id. `stage` says where the method appears:
  `PRE_ORDER` (offered when an order is placed), `POST_ORDER` (offered when
  collecting a payment or delivering) or `BOTH`. Offer a method only in the
  matching place; the server rejects it elsewhere. Cash on delivery (`COD`) is a
  promise to pay, never money received: it is always `PRE_ORDER`, records no
  payment, and `POST /orders` with `initialPayment.method = COD` and an amount
  above zero is rejected.

---

### `POST /api/v1/payment-methods`

**Retired.** Always returns `410 Gone`. A store-local method could never pay
an outlet-owned order. The catalogue is managed by Super Admin; an owner only
toggles enablement.

---

### `PATCH /api/v1/payment-methods/[id]`

**Retired for the app.** Payment methods and where each appears are configured
per organization by the platform administrator (Super Admin), not by owners.
Any signed-in member gets `403` with
`{ "error": "...", "code": "payment_methods_managed_by_platform" }`; an
unauthenticated call still gets `401`. Read the configuration with
`GET /api/v1/payment-methods`.

---

> **Deprecated:** `GET /api/v1/payment-methods/platform` and
> `PATCH /api/v1/payment-methods/platform/[id]` are duplicates of the two
> routes above. They still exist but no client should use them.

---

## 7. Expenses

### `GET /api/v1/expenses`

Lists expenses recorded for the store.

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "exp_1",
      "title": "Detergent Liquid 20L",
      "category": "Supplies",
      "amount": 250000,
      "due": "2026-09-20",
      "paid": "2026-09-11",
      "monthly": false
    }
  ]
  ```

---

### `POST /api/v1/expenses`

Records a store expense. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**:
  ```json
  {
    "title": "Shop Rent",
    "category": "Rent",
    "amount": 1500000,
    "due": "2026-09-30",
    "paid": "2026-09-11",
    "monthly": true
  }
  ```
- **Response `201 Created`**: Returns created expense DTO.

---

### `POST /api/v1/expenses/[id]/pay`

Marks an existing expense as paid. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**: Optional `{ "paidDate": "2026-09-11" }`; omitted or `{}` uses today in IST. Future dates are rejected.
- **Response `200 OK`**: Returns updated expense.

---

### `PUT /api/v1/expenses/[id]`

Edits an expense. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**: `{ "title": "Shop Rent", "category": "Rent", "amount": 1500000, "due": "2026-09-30", "outletId": "optional-outlet-id" }`. Amount is integer paise. Omit `outletId` or pass `null` to make the expense organization-wide. `X-Outlet-Id` does not override the body.
- **Response `200 OK`**: Returns updated expense DTO. A recurring occurrence cannot move to another month: "Keep a monthly bill in its original month."

### `DELETE /api/v1/expenses/[id]`

Deletes an expense. **Restricted to `OWNER`**. Deleting a recurring occurrence stops the whole series.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Response `204 No Content`**: Empty body.

---

## 8. Employees

### `GET /api/v1/employees`

Lists store employees. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "emp_usr_1",
      "name": "Ramesh Kumar",
      "username": "ramesh",
      "phone": "9876543211",
      "active": true,
      "role": "EMPLOYEE",
      "createdAt": "2026-09-01T10:00:00.000Z"
    }
  ]
  ```

---

### `POST /api/v1/employees`

Creates a new employee account with `mustChangePassword = true`. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**:
  ```json
  {
    "name": "Suresh Patel",
    "username": "suresh",
    "password": "InitialTempPassword123!",
    "phone": "9876543212"
  }
  ```
- **Response `201 Created`**: Returns created employee DTO.

---

### `PUT /api/v1/employees/[id]`

Updates employee details or resets password. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**:
  ```json
  {
    "name": "Suresh K. Patel",
    "phone": "9876543299",
    "password": "NewAssignedPassword123!"
  }
  ```
- **Response `200 OK`**: Returns updated employee DTO.

---

### `POST /api/v1/employees/[id]/toggle-active`

Activates or deactivates an employee. Deactivating immediately deletes all active sessions for that employee. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**: None.
- **Response `200 OK`**:
  ```json
  {
    "id": "emp_usr_1",
    "active": false
  }
  ```

---

## 9. Dashboard Analytics

### `GET /api/v1/dashboard`

Returns aggregated business KPIs and chart intervals for the active store (or filtered to a specific outlet via `?outletId=`).

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Query Parameters**:
  - `outletId` (string, optional): Scopes metrics to a single physical outlet.
  - `period` (string, optional, default `"month"`): Standard time period (`"today"` | `"week"` | `"month"` | `"quarter"`).
  - `from`, `to` (string, optional): Custom date range (`YYYY-MM-DD`).
  - `granularity` (string, optional): Chart interval bucketing for `bars` and `cashRange` (`"day"` | `"week"` | `"month"`).
    - `"day"`: 1 bucket per day over the requested range.
    - `"week"`: Monday-start weeks clipped to the range (labels: `<from>–<to>` or single day).
    - `"month"`: Calendar months clipped to the range.
    - When present, returns `bars` bucketed with the requested granularity and adds `cashRange` (`{ label, income, expenses }[]`).
    - When absent, retains existing behavior byte for byte (`bars` up to 12 intervals, `cashRange` omitted).
    - Invalid value returns `400 Bad Request` (`{ "error": "Invalid granularity. Expected day, week, or month." }`).
- **Response `200 OK`**:
  ```json
  {
    "pendingCount": 2,
    "pendingAmount": 120100,
    "completedAmount": 50000,
    "commitments": [],
    "dueToday": 1,
    "overdue": 0,
    "todaySales": 176100,
    "todayCount": 4,
    "todo": 2,
    "completed": 1,
    "periodSales": 176100,
    "periodOrders": 4,
    "outstanding": 90100,
    "income": 86000,
    "expenses": 0,
    "bars": [
      { "label": "1 Aug 2026", "amount": 50000 }
    ],
    "cash": [
      { "label": "1 Sep 2026–7 Sep 2026", "income": 86000, "expenses": 0 }
    ],
    "cashRange": [
      { "label": "1 Aug 2026", "income": 50000, "expenses": 0 }
    ],
    "serviceMix": [
      { "label": "Wash & Fold", "amount": 176100 }
    ],
    "statuses": [
      { "label": "Pending", "amount": 1 },
      { "label": "In Progress", "amount": 1 },
      { "label": "Ready", "amount": 0 },
      { "label": "Delivered", "amount": 2 }
    ],
    "attention": [],
    "month": "September 2026"
  }
  ```
