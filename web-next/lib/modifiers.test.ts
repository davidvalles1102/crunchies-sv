import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modifiersExtraPrice, modifiersSummary, buildLineKey } from './modifiers.ts'

test('modifiersExtraPrice: suma los price_delta de todas las selecciones', () => {
  const total = modifiersExtraPrice([
    { option_name: 'Grande', price_delta: 1.5 },
    { option_name: 'Con queso', price_delta: 0.75 },
  ])
  assert.equal(total, 2.25)
})

test('modifiersExtraPrice: lista vacia o undefined no rompe', () => {
  assert.equal(modifiersExtraPrice([]), 0)
  // @ts-expect-error verificando robustez ante input undefined desde el caller
  assert.equal(modifiersExtraPrice(undefined), 0)
})

test('modifiersSummary: junta los nombres en orden de seleccion', () => {
  const summary = modifiersSummary([
    { option_name: 'Sin cebolla', price_delta: 0 },
    { option_name: 'Extra papas', price_delta: 1 },
  ])
  assert.equal(summary, 'Sin cebolla, Extra papas')
})

test('buildLineKey: mismo item + mismos modificadores en distinto orden -> misma key', () => {
  const keyA = buildLineKey('item-1', [
    { option_name: 'Grande', price_delta: 1 },
    { option_name: 'Sin hielo', price_delta: 0 },
  ])
  const keyB = buildLineKey('item-1', [
    { option_name: 'Sin hielo', price_delta: 0 },
    { option_name: 'Grande', price_delta: 1 },
  ])
  assert.equal(keyA, keyB) // el orden de seleccion no debe crear lineas de carrito distintas
})

test('buildLineKey: mismo item con modificadores distintos -> keys distintas', () => {
  const keyA = buildLineKey('item-1', [{ option_name: 'Grande', price_delta: 1 }])
  const keyB = buildLineKey('item-1', [{ option_name: 'Mediano', price_delta: 0 }])
  assert.notEqual(keyA, keyB)
})

test('buildLineKey: sin modificadores es estable', () => {
  assert.equal(buildLineKey('item-1', []), 'item-1::')
})
