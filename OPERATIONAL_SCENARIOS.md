# Operational Scenarios

## Goal

Document the real-world restaurant and SaaS scenarios that this platform must survive in El Salvador without becoming too expensive to maintain for 2 developers.

## Scenario 1: Small street stall, 1 owner, 1 helper

### Context

- One tablet or phone.
- No formal kitchen display initially.
- Minimal stock control.
- Low ticket volume.

### Must work

- open POS quickly;
- place order in under 30 seconds;
- print or show order details clearly;
- accept cash and transfer;
- keep a simple daily total.

### Risk

If onboarding takes more than one sitting, the product is too complex for this segment.

## Scenario 2: Small restaurant, 1 cashier, 1 kitchen, 1 delivery runner

### Context

- QR table ordering active.
- Kitchen display in realtime.
- Staff PINs used daily.
- One owner checks reports at end of day.

### Must work

- table QR creates correct order;
- kitchen sees modifiers and notes;
- cashier sees status changes in POS;
- delivery sees ready orders in order of waiting time;
- payments and receipts are consistent.

### Risk

If the waiter must jump between too many screens, the system loses value during service.

## Scenario 3: Business with 2 branches

### Context

- same owner, two locations;
- separate staff by branch;
- separate mesas, QR, menus or pricing variations;
- one business owner wants consolidated reporting.

### Must work

- branch isolation by tenant/location;
- branch-specific menus or availability;
- branch-specific cash and reports;
- owner sees cross-branch view if permitted.

### Risk

Without tenant-aware architecture, reports will mix data and destroy trust.

## Scenario 4: Tenant onboarding from zero

### Context

- new client signs monthly plan;
- staff is created;
- menu is loaded;
- QR codes are printed;
- first day begins with no manual SQL.

### Must work

- create tenant;
- create owner;
- seed defaults;
- configure brand and tax mode;
- activate modules by plan.

### Risk

If onboarding requires a developer to touch production SQL, SaaS economics fail.

## Scenario 5: Delivery-heavy business

### Context

- many takeout and delivery orders;
- limited dining room;
- driver assignment matters;
- route order is more important than table logic.

### Must work

- delivery board sorted by wait time;
- address and phone visible;
- driver assignment tracked;
- status transitions auditable.

### Risk

If delivery shares the same assumptions as dine-in, the workflow becomes brittle.

## Scenario 6: Inventory-sensitive business

### Context

- menu costs matter;
- ingredients must be tracked;
- owner wants stock alerts;
- waste and adjustments must be recorded.

### Must work

- stock in/out movements;
- reorder thresholds;
- recipe consumption by sale;
- waste adjustments;
- daily stock view.

### Risk

A fake inventory module with only “current stock” becomes unreliable within days.

## Scenario 7: Cash-heavy end-of-day close

### Context

- lots of cash transactions;
- owner wants to know if drawer matches;
- waiter/cashier may shift during the day.

### Must work

- open cash session;
- register inflows/outflows;
- close cash session with counted amount;
- difference logged and explained.

### Risk

If cash close is not explicit, money leakage becomes invisible.

## Scenario 8: Multi-tenant SaaS support load

### Context

- 5 clients;
- different menus and plans;
- one developer on support;
- clients expect same uptime as bigger apps.

### Must work

- isolate tenants in DB;
- prevent cross-tenant reads;
- standardize onboarding;
- keep a single deploy pipeline;
- minimize per-client custom code.

### Risk

If every client needs a branch or manual fix, the product becomes unmaintainable.

## Real operational gaps still present

- tenant-aware database is not yet applied;
- inventory model is still draft only;
- cash session workflow is not built;
- onboarding flow is not implemented;
- branch/location handling is not tenant-aware yet;
- fiscal export/facturation is not production-ready.

## Priority order

1. Tenant isolation.
2. Cash close.
3. Inventory movements.
4. Onboarding automation.
5. Fiscal exports.
6. Multi-branch reporting.

## Success criteria

The product is viable for this market only when:

- a small merchant can use it without training overload;
- a restaurant can run service without missing orders;
- an owner can trust end-of-day totals;
- a new tenant can be created without code changes;
- 2 developers can maintain the platform without firefighting every deployment.

