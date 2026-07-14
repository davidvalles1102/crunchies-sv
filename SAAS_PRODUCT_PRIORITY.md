# SaaS Product Priority

## Goal

Define what to build first so the product becomes rentable for 2 developers and useful for small businesses in El Salvador.

## Build order

### 1. Tenant foundation

Must have:

- `tenants`
- `tenant_members`
- `tenant_settings`
- tenant-aware RLS
- tenant resolution in frontend

Reason:

Without this, the product is not SaaS.

### 2. Core operations

Must have:

- POS
- QR ordering
- kitchen realtime
- delivery board
- payments
- staff PIN

Reason:

This is the daily operational value.

### 3. Business controls

Must have:

- cash sessions
- end-of-day close
- basic reporting
- receipts / exports
- audit logs

Reason:

This is what makes the software trustworthy.

### 4. Inventory

Must have:

- items
- stock movements
- recipe consumption
- waste
- reorder points

Reason:

This is the first premium module with real commercial value.

### 5. Subscription / billing

Must have:

- plan status
- monthly billing cycle
- grace periods
- suspension rules

Reason:

This is how the product stays profitable.

### 6. Fiscal / export layer

Must have:

- tax mode configuration
- invoice export compatibility
- government-ready audit trail

Reason:

This is market-specific value for El Salvador.

## What not to do first

- multi-branch analytics before tenancy;
- fancy dashboards before cash close;
- per-client custom forks;
- microservices;
- advanced automation without audit logs;
- inventory without movements;
- fiscal features without basic trust in totals.

## Pricing logic

### Entry price

Low enough to replace manual notebooks or a simple app.

### Upsell

- inventory
- cash close
- extra staff
- extra branch
- fiscal exports
- CRM / loyalty

### Rule

Charge for business value, not for activity volume alone.

## Practical target

For 2 developers, the first version should optimize for:

- fast onboarding;
- low support overhead;
- low DB complexity;
- reusable UI;
- tenant isolation;
- strong defaults.

## Final acceptance

The product is commercially viable when:

- a new tenant can be onboarded without code;
- service flows work in a real store;
- reports are trusted by the owner;
- support does not depend on constant manual SQL;
- monthly pricing covers maintenance and leaves margin.

