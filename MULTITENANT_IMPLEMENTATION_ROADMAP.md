# Multitenant Implementation Roadmap

## Objective

Convert the current single-restaurant system into a tenant-aware SaaS that can safely serve 5+ businesses while keeping maintenance cost low for 2 developers.

## Working assumption

Use one shared Supabase project with `tenant_id` isolation, not one database per customer.

This keeps infrastructure cost and operational complexity under control.

## Phase 0: Freeze the current baseline

### Goal

Keep the current restaurant working while we prepare the migration.

### Tasks

- Keep the current build/lint green.
- Avoid feature work that adds new schemas without tenant awareness.
- Preserve the existing single-tenant data as the root tenant.

### Acceptance

- Single restaurant still works.
- No broken routes.
- No schema drift beyond the migration draft.

## Phase 1: Tenant foundation

### Goal

Introduce the core tenancy tables and the tenant membership model.

### Tasks

- Create `tenants`.
- Create `tenant_members`.
- Create `tenant_settings`.
- Create `tenant_plan_subscriptions`.
- Create a root tenant for the current business.
- Assign existing records to that tenant.

### Acceptance

- Existing records belong to one tenant.
- New tenant records can be created without schema changes.
- Tenant metadata is separated from operational data.

## Phase 2: Tenant-aware database enforcement

### Goal

Make cross-tenant access impossible by policy.

### Tasks

- Add `tenant_id` to all operational tables.
- Add foreign keys to `tenants`.
- Add helper functions for tenant membership checks.
- Rework RLS policies to use tenant membership, not only global roles.
- Ensure inserts/updates keep the same tenant.

### Acceptance

- A user from one tenant cannot read another tenant's rows.
- A user cannot insert a row with a foreign tenant_id.
- Root tenant continues to work.

## Phase 3: Frontend tenant resolution

### Goal

Make the UI resolve and persist the active tenant.

### Tasks

- Determine the tenant at login or session restore.
- Persist the active tenant in session state.
- Ensure all data queries include tenant context.
- Prevent tenant switching without permission.

### Acceptance

- The app opens with a valid tenant context.
- Every page loads tenant-scoped data.
- No tenant mixing in UI tables or reports.

## Phase 4: Operational onboarding

### Goal

Allow a new business to go live without developer intervention.

### Tasks

- Create onboarding flow for tenant creation.
- Seed default settings.
- Create staff members and PINs.
- Generate tables and QR codes.
- Load menu and modifiers.

### Acceptance

- A non-technical operator can activate a new client.
- No manual SQL is required for a standard onboarding.

## Phase 5: Cash close and auditability

### Goal

Make the system trustworthy for daily money handling.

### Tasks

- Add cash sessions.
- Track inflows and outflows.
- Track close amount vs expected amount.
- Store who opened and closed the session.
- Add audit event rows for sensitive actions.

### Acceptance

- Owner can close the day and see differences.
- Every cash adjustment is attributable.

## Phase 6: Inventory

### Goal

Turn inventory into a premium, business-critical feature.

### Tasks

- Add inventory items.
- Add movements in/out/adjustment/waste.
- Add reorder thresholds.
- Add recipe consumption mapping.
- Connect menu sales to stock decrement.

### Acceptance

- Stock changes are explainable.
- Waste and adjustment are visible.
- Low stock can be alerted.

## Phase 7: Billing and plans

### Goal

Support monthly billing and product packaging.

### Tasks

- Track plan status.
- Add trial periods and grace periods.
- Add suspension rules.
- Add subscription metadata per tenant.

### Acceptance

- Tenant access can be controlled by plan.
- Expired subscriptions can be paused safely.

## Phase 8: El Salvador business fit

### Goal

Make the product practical for real local operations.

### Tasks

- Add tax mode configuration.
- Add fiscal/export-ready audit data.
- Support cash, card, transfer, and mixed payment workflows.
- Keep receipts and reports consistent.
- Prepare data export formats for accounting.

### Acceptance

- A local owner can understand totals and closure.
- The platform fits a small store or small restaurant.

## Implementation rules

- Never add a business table without `tenant_id`.
- Never add a report without tenant filtering.
- Never ship a premium module that cannot be audited.
- Never let tenant isolation depend on the frontend only.
- Never require per-client code forks.

## Priority order for 2 developers

1. Tenant foundation.
2. Tenant-aware RLS.
3. Frontend tenant context.
4. Cash close.
5. Inventory.
6. Billing.
7. Fiscal exports.

## What to postpone

- Multi-branch analytics.
- Complex automation.
- Per-client custom theming beyond settings.
- Microservices.
- Advanced loyalty until the core is stable.

## Definition of done

The migration is done when:

- tenant isolation is enforced by DB;
- onboarding works without SQL edits;
- the root restaurant still operates;
- build and lint stay green;
- a second tenant can be added as a test without affecting the first.

