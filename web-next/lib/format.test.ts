import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcTotals } from './format.ts'

test('calcTotals: sin tasa (default) no cobra impuesto', () => {
  const r = calcTotals(100)
  assert.equal(r.subtotal, 100)
  assert.equal(r.tax, 0)
  assert.equal(r.total, 100)
})

test('calcTotals: 13% IVA calcula tax y total correctos', () => {
  const r = calcTotals(100, 0.13)
  assert.equal(r.subtotal, 100)
  assert.equal(r.tax, 13)
  assert.equal(r.total, 113)
})

test('calcTotals: redondea a 2 decimales sin arrastrar error de punto flotante', () => {
  const r = calcTotals(19.99, 0.13)
  assert.equal(r.tax, 2.6) // 19.99 * 0.13 = 2.5987 -> 2.60
  assert.equal(r.total, 22.59)
})

test('calcTotals: subtotal 0 no rompe (division/format)', () => {
  const r = calcTotals(0, 0.13)
  assert.equal(r.tax, 0)
  assert.equal(r.total, 0)
})

test('calcTotals: subtotal negativo (reembolso/ajuste) no lanza', () => {
  const r = calcTotals(-50, 0.13)
  assert.equal(r.subtotal, -50)
  assert.equal(r.tax, -6.5)
  assert.equal(r.total, -56.5)
})

test('calcTotals: tasa 0 explicita se comporta igual que sin pasar tasa', () => {
  const a = calcTotals(250)
  const b = calcTotals(250, 0)
  assert.deepEqual(a, b)
})
