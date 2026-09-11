# Express Laundry — Mobile & Client HTTP API Specification (`/api/v1`)

This document is the authoritative contract for frontend and mobile clients (Flutter "MyShop", etc.) consuming the Express Laundry backend API.

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
    "reason": "store_locked" // Optional: "membership_inactive" | "store_locked" | "store_archived" | "payment_lapsed"
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

### `GET /api/v1/payment-methods`

Lists store-configured payment methods (e.g. Cash, UPI, Card).

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**:
  ```json
  [
    { "id": "pm_1", "name": "Cash", "active": true },
    { "id": "pm_2", "name": "UPI", "active": true }
  ]
  ```

---

### `POST /api/v1/payment-methods`

Creates a custom payment method. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**:
  ```json
  {
    "name": "Store QR Code"
  }
  ```
- **Response `201 Created`**: Returns created method `{ "id": "...", "name": "...", "active": true }`.

---

### `PATCH /api/v1/payment-methods/[id]`

Renames or toggles active status. **Restricted to `OWNER`**.

- **Auth**: Bearer token + `X-Store-Id` (Role: `OWNER`).
- **Request Body**:
  ```json
  {
    "name": "Updated Name",
    "active": false
  }
  ```
- **Response `200 OK`**: Returns updated method.

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
- **Request Body**: None (or `{ "paidDate": "2026-09-11" }`).
- **Response `200 OK`**: Returns updated expense.

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

Returns aggregated business KPIs for the active store (or cross-store aggregate if authorized).

- **Auth**: Bearer token + `X-Store-Id`.
- **Response `200 OK`**:
  ```json
  {
    "revenue": 1250000,
    "pendingOrders": 8,
    "completedOrders": 42,
    "activeEmployees": 3,
    "monthlyExpenses": 450000,
    "chartData": [
      { "date": "2026-09-05", "revenue": 150000, "orders": 6 },
      { "date": "2026-09-06", "revenue": 180000, "orders": 9 }
    ]
  }
  ```
