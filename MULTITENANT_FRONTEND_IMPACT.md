# Multitenant Frontend Impact

## Goal

List the frontend and app-layer changes required to make the current system tenant-aware without breaking the operational flows already verified in local.

## Guiding rule

The frontend should never be the only place that enforces tenant isolation.
It may help with UX, but the DB must remain the source of truth.

## Shared app concerns

### Tenant resolution

Every authenticated session must know:

- active tenant id
- active tenant slug
- active tenant role
- active tenant settings

### Required behavior

- resolve tenant on login/session restore;
- persist active tenant in session-safe storage;
- block data loading until tenant is known;
- include tenant_id in all reads/writes where relevant;
- make switching tenants explicit and authorized.

## File-by-file impact map

### `web-next/lib/types.ts`

Changes needed:

- add `tenant_id` to core operational types;
- add tenant metadata types;
- add settings and subscription types;
- add inventory-related types;
- add cash-session types later.

### `web-next/lib/supabase/auth.ts`

Changes needed:

- resolve tenant membership alongside session/profile;
- return a richer auth context including tenant data;
- distinguish platform admin from tenant roles;
- keep customer and staff sessions separate.

### `web-next/lib/pin-auth.ts`

Changes needed:

- store tenant identity with the PIN session;
- include tenant context in `verify_staff_pin` flow;
- clear tenant data on logout;
- avoid assuming role alone is enough.

### `web-next/app/api/portal/auth/route.ts`

Changes needed:

- return tenant context with the portal session;
- validate that the PIN belongs to an active tenant member;
- rate limit by IP and by PIN attempt;
- log tenant-aware auth events.

### `web-next/app/portal/*`

Files:

- `PinPad.tsx`
- `KitchenPortalClient.tsx`
- `DeliveryPortalClient.tsx`
- `WaiterPortalClient.tsx`

Changes needed:

- load tenant settings before rendering the portal shell;
- scope realtime channels to tenant-aware data;
- ensure the portal cannot load another tenant's orders;
- display tenant name/branding in header;
- keep local session state tied to tenant.

### `web-next/app/admin/AdminContext.tsx`

Changes needed:

- include active tenant and role in context;
- differentiate platform admin vs tenant admin;
- expose helper to check access by tenant and role.

### `web-next/app/admin/(protected)/*`

High impact pages:

- `dashboard`
- `orders`
- `kitchen`
- `delivery`
- `tables`
- `payments`
- `menu-management`
- `reservations`
- `reports`
- `customers`
- `finance`
- `expense-tracker`
- future inventory/cash pages

Changes needed:

- every query must use the tenant id;
- dashboards must aggregate only within the tenant;
- staff and customer searches must be tenant-scoped;
- exports and receipts must include the tenant identity.

### `web-next/app/order/*` and `web-next/app/table-order/*`

Changes needed:

- resolve tenant from QR/table URL or domain;
- load tenant-specific menu/settings;
- prevent cross-tenant table or order access;
- keep customer flows simple and mobile-friendly.

### `web-next/app/profile/*` and `web-next/app/mis-pedidos/*`

Changes needed:

- query only current customer's data within the active tenant;
- keep customer order history tenant-scoped;
- avoid leaking historical data across businesses.

## Database query impact

Any query that currently uses:

- `profiles`
- `orders`
- `order_items`
- `restaurant_tables`
- `menu_items`
- `categories`
- `payments`
- `reservations`
- `expenses`
- `staff_members`
- `drivers`
- `delivery_zones`

must be reviewed for tenant scope.

## Realtime impact

Realtime channels must be scoped by tenant in one of two ways:

1. filter queries by tenant after event delivery; or
2. use tenant-aware payload resolution in the callback.

Preferred behavior:

- listen only to the tables needed by the portal;
- filter events by tenant before touching state;
- avoid broad global channels where possible.

## Step order for implementation

### Step 1

- Update types and auth context.

### Step 2

- Add tenant settings resolution to portal/admin shell.

### Step 3

- Update read queries for tenant scope.

### Step 4

- Update writes to include tenant_id.

### Step 5

- Update realtime subscriptions.

### Step 6

- Add onboarding and tenant management UI.

### Step 7

- Add subscription, cash and inventory pages.

## Acceptance checklist

- a tenant-aware session can render the correct branding;
- admin pages query only one tenant;
- portal pages cannot see another business's orders;
- QR flow resolves the correct tenant;
- reports are tenant-specific;
- new tenant creation has a clear UI path.

