'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

type InventoryItem = {
  id: string
  name: string
  sku: string | null
  unit: string
  cost: number
  stock_on_hand: number
  reorder_point: number
  active: boolean
}

type RecipeLine = {
  id: string
  menu_item_id: string
  inventory_item_id: string
  quantity_per_unit: number
}

type MenuItemOption = { id: string; name: string }

export default function InventoryClient() {
  useRequireRole(['admin'])
  const { tenant } = useAdmin()
  const supabase = createClient()
  const toast = useToast()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [lowStock, setLowStock] = useState<InventoryItem[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([])
  const [loading, setLoading] = useState(true)

  // Nuevo item
  const [itemName, setItemName] = useState('')
  const [itemUnit, setItemUnit] = useState('unit')
  const [itemCost, setItemCost] = useState('')
  const [itemReorder, setItemReorder] = useState('')
  const [itemStock, setItemStock] = useState('0')
  const [creatingItem, setCreatingItem] = useState(false)

  // Movimiento
  const [movItemId, setMovItemId] = useState('')
  const [movType, setMovType] = useState('in')
  const [movQty, setMovQty] = useState('')
  const [movReason, setMovReason] = useState('')
  const [recordingMov, setRecordingMov] = useState(false)

  // Receta
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('')
  const [recipeInventoryItemId, setRecipeInventoryItemId] = useState('')
  const [recipeQty, setRecipeQty] = useState('')
  const [savingRecipe, setSavingRecipe] = useState(false)

  const load = useCallback(async () => {
    const [{ data: inv }, { data: low }, { data: rec }, { data: menu }] = await Promise.all([
      supabase.from('inventory_items').select('*').order('name'),
      supabase.from('low_stock_items').select('*'),
      supabase.from('recipe_items').select('*'),
      supabase.from('menu_items').select('id, name').eq('tenant_id', tenant.tenant_id).order('name'),
    ])
    setItems((inv as InventoryItem[]) ?? [])
    setLowStock((low as InventoryItem[]) ?? [])
    setRecipes((rec as RecipeLine[]) ?? [])
    setMenuItems((menu as MenuItemOption[]) ?? [])
    setLoading(false)
  }, [supabase, tenant.tenant_id])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function createItem(e: React.FormEvent) {
    e.preventDefault()
    const name = itemName.trim()
    const cost = parseFloat(itemCost) || 0
    const reorder = parseFloat(itemReorder) || 0
    const stock = parseFloat(itemStock) || 0
    if (!name) { toast('Nombre requerido', 'warning'); return }
    setCreatingItem(true)
    const { error } = await supabase.from('inventory_items').insert({
      tenant_id: tenant.tenant_id,
      name,
      unit: itemUnit,
      cost,
      reorder_point: reorder,
      stock_on_hand: stock,
    })
    if (error) {
      toast('Error al crear item', 'error')
    } else {
      toast(`${name} agregado ✓`)
      setItemName(''); setItemCost(''); setItemReorder(''); setItemStock('0')
      await load()
    }
    setCreatingItem(false)
  }

  async function recordMovement(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseFloat(movQty)
    if (!movItemId || isNaN(qty) || qty <= 0) { toast('Item y cantidad requeridos', 'warning'); return }
    setRecordingMov(true)
    const { error } = await supabase.rpc('record_inventory_movement', {
      p_inventory_item_id: movItemId,
      p_movement_type: movType,
      p_quantity: qty,
      p_reason: movReason.trim() || null,
    })
    if (error) {
      toast('Error al registrar movimiento', 'error')
    } else {
      toast('Movimiento registrado ✓')
      setMovQty(''); setMovReason('')
      await load()
    }
    setRecordingMov(false)
  }

  async function saveRecipeLine(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseFloat(recipeQty)
    if (!recipeMenuItemId || !recipeInventoryItemId || isNaN(qty) || qty <= 0) {
      toast('Platillo, insumo y cantidad requeridos', 'warning'); return
    }
    setSavingRecipe(true)
    const { error } = await supabase.from('recipe_items').upsert({
      tenant_id: tenant.tenant_id,
      menu_item_id: recipeMenuItemId,
      inventory_item_id: recipeInventoryItemId,
      quantity_per_unit: qty,
    }, { onConflict: 'menu_item_id,inventory_item_id' })
    if (error) {
      toast('Error al guardar receta', 'error')
    } else {
      toast('Receta guardada ✓')
      setRecipeQty('')
      await load()
    }
    setSavingRecipe(false)
  }

  async function deleteRecipeLine(id: string) {
    const { error } = await supabase.from('recipe_items').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    await load()
  }

  const itemName_ = (id: string) => items.find((i) => i.id === id)?.name ?? '—'
  const menuName_ = (id: string) => menuItems.find((m) => m.id === id)?.name ?? '—'

  if (loading) {
    return (
      <>
        <Topbar title="Inventario" />
        <div className="admin-content"><p className="text-muted text-sm">Cargando...</p></div>
      </>
    )
  }

  return (
    <>
      <Topbar title="Inventario" />
      <div className="admin-content">
        {lowStock.length > 0 && (
          <div className="card mb-24" style={{ borderColor: 'var(--orange)' }}>
            <h4 style={{ marginBottom: 8 }}>⚠️ Stock bajo</h4>
            {lowStock.map((i) => (
              <div key={i.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{i.name}</span>
                <span>{i.stock_on_hand} {i.unit} (mínimo {i.reorder_point})</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-col gap-8 mb-24">
          {items.length === 0 ? (
            <p className="text-muted text-sm">Sin insumos registrados. Crea el primero abajo.</p>
          ) : (
            items.map((i) => (
              <div key={i.id} className="staff-card">
                <div className="staff-card__info">
                  <div className="staff-card__name">{i.name}{i.sku ? ` · ${i.sku}` : ''}</div>
                  <div className="staff-card__meta">
                    {i.stock_on_hand} {i.unit} en existencia · costo {fmt.currency(i.cost)} · mínimo {i.reorder_point}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card mb-24" style={{ maxWidth: 560 }}>
          <h4 style={{ marginBottom: 16 }}>➕ Nuevo insumo</h4>
          <form className="flex-col gap-12" onSubmit={createItem}>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-item-name">Nombre</label>
              <input id="inv-item-name" type="text" className="form-control" required placeholder="Ej: Pechuga de pollo" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-item-unit">Unidad</label>
              <input id="inv-item-unit" type="text" className="form-control" placeholder="unit, kg, lb, litro..." value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-item-cost">Costo por unidad</label>
              <input id="inv-item-cost" type="number" step="0.01" min="0" className="form-control" value={itemCost} onChange={(e) => setItemCost(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-item-stock">Stock inicial</label>
              <input id="inv-item-stock" type="number" step="0.001" min="0" className="form-control" value={itemStock} onChange={(e) => setItemStock(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-item-reorder">Punto de reorden</label>
              <input id="inv-item-reorder" type="number" step="0.001" min="0" className="form-control" value={itemReorder} onChange={(e) => setItemReorder(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creatingItem}>
              {creatingItem ? 'Guardando...' : '✓ Crear insumo'}
            </button>
          </form>
        </div>

        <div className="card mb-24" style={{ maxWidth: 560 }}>
          <h4 style={{ marginBottom: 16 }}>📦 Registrar movimiento</h4>
          <form className="flex-col gap-12" onSubmit={recordMovement}>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-mov-item">Insumo</label>
              <select id="inv-mov-item" className="form-control" required value={movItemId} onChange={(e) => setMovItemId(e.target.value)}>
                <option value="">Selecciona...</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-mov-type">Tipo</label>
              <select id="inv-mov-type" className="form-control" value={movType} onChange={(e) => setMovType(e.target.value)}>
                <option value="in">Entrada (compra)</option>
                <option value="adjustment">Ajuste</option>
                <option value="waste">Merma</option>
                <option value="transfer">Traslado</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-mov-qty">Cantidad</label>
              <input id="inv-mov-qty" type="number" step="0.001" min="0.001" className="form-control" required value={movQty} onChange={(e) => setMovQty(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-mov-reason">Motivo (opcional)</label>
              <input id="inv-mov-reason" type="text" className="form-control" value={movReason} onChange={(e) => setMovReason(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-outline" disabled={recordingMov}>
              {recordingMov ? 'Guardando...' : 'Registrar movimiento'}
            </button>
          </form>
        </div>

        <div className="card" style={{ maxWidth: 560 }}>
          <h4 style={{ marginBottom: 16 }}>🍽️ Recetas — consumo por venta</h4>
          <form className="flex-col gap-12" onSubmit={saveRecipeLine}>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-recipe-menu">Platillo</label>
              <select id="inv-recipe-menu" className="form-control" required value={recipeMenuItemId} onChange={(e) => setRecipeMenuItemId(e.target.value)}>
                <option value="">Selecciona...</option>
                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-recipe-item">Insumo</label>
              <select id="inv-recipe-item" className="form-control" required value={recipeInventoryItemId} onChange={(e) => setRecipeInventoryItemId(e.target.value)}>
                <option value="">Selecciona...</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="inv-recipe-qty">Cantidad consumida por unidad vendida</label>
              <input id="inv-recipe-qty" type="number" step="0.001" min="0.001" className="form-control" required value={recipeQty} onChange={(e) => setRecipeQty(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-outline" disabled={savingRecipe}>
              {savingRecipe ? 'Guardando...' : 'Guardar receta'}
            </button>
          </form>

          {recipes.length > 0 && (
            <div className="flex-col gap-8 mt-16">
              {recipes.map((r) => (
                <div key={r.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{menuName_(r.menu_item_id)} → {itemName_(r.inventory_item_id)} × {r.quantity_per_unit}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteRecipeLine(r.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
