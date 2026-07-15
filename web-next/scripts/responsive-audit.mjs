import { chromium } from 'playwright'

const fakeUserId = '11111111-1111-1111-1111-111111111111'
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
const jwtPayload = Buffer.from(JSON.stringify({ sub: fakeUserId, email: 'test@test.local', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
const fakeJwt = `${header}.${jwtPayload}.fakesig`
const sessionObj = {
  access_token: fakeJwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fake-refresh', user: { id: fakeUserId, email: 'test@test.local', aud: 'authenticated', role: 'authenticated' },
}
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(sessionObj)).toString('base64')

const LONG_NAME = 'María Fernanda Hernández Castillo de los Ángeles'
const LONG_ADDR = 'Residencial Las Magnolias, Pasaje 7, Casa número 42-B, cerca del parque, San Salvador'
const LONG_ITEM = 'Combo Familiar Extra Grande de Alitas BBQ con Papas Fritas y Ensalada César'
const LONG_NOTE = 'Cliente pidió que se le llame antes de llegar, portón azul al fondo del pasaje, cuidado con el perro'

const table = new Date().toISOString()

const mockByTable = {
  restaurant_tables: [
    { id: 't1', number: 1, capacity: 4, location: 'Salón Principal', status: 'occupied', tenant_id: null },
    { id: 't2', number: 2, capacity: 6, location: 'Zona VIP', status: 'available', tenant_id: null },
    { id: 't3', number: 3, capacity: 2, location: 'Exterior', status: 'reserved', tenant_id: null },
  ],
  categories: [{ id: 'c1', name: 'Comidas Rápidas Especiales de la Casa', icon: '🍗', display_order: 1, active: true, tenant_id: null }],
  menu_items: [
    { id: 'm1', category_id: 'c1', name: LONG_ITEM, description: 'Descripción larga del platillo con muchos ingredientes y detalles adicionales', price: 15.99, cost: 6.5, image_url: null, available: true, is_featured: true, tenant_id: null, categories: { name: 'Comidas' } },
    { id: 'm2', category_id: 'c1', name: 'Limonada', description: null, price: 2.5, cost: 0.5, image_url: null, available: true, is_featured: false, tenant_id: null, categories: { name: 'Bebidas' } },
  ],
  orders: [
    { id: 'o1', table_id: 't1', customer_id: null, waiter_id: null, status: 'paid', order_type: 'dine_in', subtotal: 45, tax: 0, total: 45, notes: LONG_NOTE, created_at: table, updated_at: table, delivery_name: null, delivery_phone: null, delivery_address: null, delivery_status: null, delivery_fee: 0, payment_method: 'cash', driver_id: null, pickup_staff_id: null, restaurant_tables: { number: 1 }, order_items: [{ id:'oi1', item_name: LONG_ITEM, item_price: 15.99, quantity: 2, order_item_modifiers: [] }] },
    { id: 'o2', table_id: null, customer_id: null, waiter_id: null, status: 'delivered', order_type: 'delivery', subtotal: 30, tax: 0, total: 34, notes: null, created_at: table, updated_at: table, delivery_name: LONG_NAME, delivery_phone: '7311-8276', delivery_address: LONG_ADDR, delivery_status: 'delivered', delivery_fee: 4, payment_method: 'card', driver_id: 'd1', pickup_staff_id: null, restaurant_tables: null, order_items: [{ id:'oi2', item_name: 'Pollo Entero', item_price: 30, quantity: 1, order_item_modifiers: [] }] },
  ],
  order_items: [
    { id: 'oi1', order_id: 'o1', item_name: LONG_ITEM, item_price: 15.99, quantity: 2, menu_item_id: 'm1', created_at: table },
  ],
  payments: [
    { id: 'p1', order_id: 'o1', processed_by: fakeUserId, amount: 45, method: 'cash', receipt_number: 'REC-1', change_amount: 5, created_at: table, cash_session_id: null, orders: { restaurant_tables: { number: 1 }, order_items: [{ id:'oi1', item_name: LONG_ITEM, item_price: 15.99, quantity: 2, order_item_modifiers: [] }] }, profiles: { full_name: LONG_NAME } },
  ],
  expenses: [
    { id: 'e1', category: 'insumos', description: 'Compra semanal de pollo, verduras, especias y otros insumos de cocina para toda la semana', amount: 250, payment_method: 'cash', expense_date: table.slice(0,10), is_recurring: false, recurrence: null, registered_by: fakeUserId, profiles: { full_name: LONG_NAME } },
  ],
  drivers: [{ id: 'd1', full_name: LONG_NAME, phone: '7311-8276', active: true, tenant_id: null }],
  delivery_zones: [{ id: 'z1', name: 'Zona Norte - Colonia Escalón y alrededores', fee: 3.5, active: true, display_order: 1, tenant_id: null }],
  reservations: [
    { id: 'r1', reservation_date: table.slice(0,10), reservation_time: '19:00', party_size: 6, notes: LONG_NOTE, status: 'confirmed', table_id: 't1', created_at: table, customer_id: fakeUserId, profiles: { full_name: LONG_NAME, phone: '7311-8276', loyalty_points: 120 }, restaurant_tables: { number: 1, location: 'Salón Principal', capacity: 6 } },
  ],
  staff_members: [{ id: 's1', full_name: LONG_NAME, role: 'waiter', pin: '123456', active: true, last_login: table, created_at: table }],
  order_events: [],
  profiles: [{ id: fakeUserId, full_name: 'Test Admin', phone: null, role: 'admin', loyalty_points: 0, name: 'Test Admin' }],
  customer_notes: [],
  loyalty_transactions: [],
  cash_sessions: [{ id: 'cs1', tenant_id: null, status: 'open', opening_amount: 20, opened_by: fakeUserId, opened_at: table, expected_amount: null, counted_amount: null, difference: null, closed_by: null, closed_at: null, notes: null, created_at: table }],
  cash_session_movements: [],
  customer_credit_accounts: [{ id: 'cc1', customer_id: fakeUserId, credit_limit: 50, balance: 22.5, profiles: { full_name: LONG_NAME, phone: '7311-8276' } }],
  customer_credit_transactions: [],
  inventory_items: [{ id: 'inv1', name: 'Pechuga de pollo deshuesada premium', sku: 'SKU-001', unit: 'lb', cost: 2.5, stock_on_hand: 5, reorder_point: 10, active: true }],
  low_stock_items: [{ id: 'inv1', name: 'Pechuga de pollo deshuesada premium', unit: 'lb', stock_on_hand: 5, reorder_point: 10 }],
  recipe_items: [],
  modifier_groups: [{ id: 'g1', name: 'Nivel de picante y extras especiales', selection_type: 'single', required: false, max_select: null, modifier_options: [{ id:'go1', name:'Extra picante', price_delta:0.5, is_default:false, display_order:1 }] }],
  modifier_options: [],
  menu_item_modifier_groups: [],
  tenants: [{ id: 'tn1', slug: 'crunchies-root', name: 'Crunchies Mi Rancho', status: 'active', plan: 'starter', timezone: 'America/El_Salvador', currency: 'USD', created_at: table }],
  tenant_settings: [{ tenant_id: 'tn1', brand_name: 'Crunchies', tax_enabled: false, tax_rate: 0.13, invoice_mode: 'manual' }],
  tenant_members: [],
}

function mockFor(url) {
  const m = url.match(/\/rest\/v1\/([a-z_]+)/)
  const t = m?.[1]
  return mockByTable[t] ?? []
}

const routes = [
  '/admin/dashboard',
  '/admin/orders',
  '/admin/reservations',
  '/admin/delivery',
  '/admin/payments',
  '/admin/expense-tracker',
  '/admin/finance',
  '/admin/menu-management',
  '/admin/reports',
  '/admin/customers',
  '/admin/tables',
  '/admin/staff',
  '/admin/cash',
  '/admin/credit',
  '/admin/inventory',
  '/admin/fiscal-export',
  '/admin/platform',
]

const browser = await chromium.launch()

for (const width of [375, 768]) {
  const context = await browser.newContext({ viewport: { width, height: 800 } })
  await context.addCookies([{ name: 'sb-gnjwwhuuzwcxcuqzevyn-auth-token', value: cookieValue, domain: 'localhost', path: '/' }])

  for (const route of routes) {
    const page = await context.newPage()
    await page.route('**/rest/v1/**', (r) => {
      const url = r.request().url()
      if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      const data = mockFor(url)
      const single = /select=.*$/.test(url) && r.request().headers()['accept']?.includes('vnd.pgrst.object')
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (data[0] ?? null) : data) })
    })
    await page.route('**/rpc/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

    let errMsg = ''
    try {
      await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle', timeout: 15000 })
      await page.waitForTimeout(900)
    } catch (e) { errMsg = e.message.split('\n')[0] }

    const finalUrl = page.url()
    const redirected = !finalUrl.includes(route)
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    })).catch(() => ({ scrollWidth: -1, clientWidth: -1 }))
    const bad = overflow.scrollWidth > overflow.clientWidth + 1

    const tag = errMsg ? 'ERROR' : redirected ? 'REDIR' : bad ? 'OVERFLOW' : 'ok'
    console.log(`${tag.padEnd(9)} w=${width} ${route} -> ${JSON.stringify(overflow)} ${errMsg} ${redirected ? '(-> ' + finalUrl + ')' : ''}`)
    if (bad) {
      await page.screenshot({ path: `../scratch_screens/admin-${route.replace(/\//g, '_')}-${width}.png`, fullPage: true })
    }
    await page.close()
  }
  await context.close()
}

await browser.close()
