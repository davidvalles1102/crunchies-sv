'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import type { Category, ModifierGroup } from '@/lib/types'

type MgmtMenuItem = {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  image_url: string | null
  available: boolean
  is_featured: boolean
  categories: { name: string; icon: string | null } | null
}

type ItemForm = {
  name: string
  category_id: string
  description: string
  price: string
  image_url: string
  available: boolean
  is_featured: boolean
}

const EMPTY_ITEM_FORM: ItemForm = { name: '', category_id: '', description: '', price: '', image_url: '', available: true, is_featured: false }

export default function MenuManagementClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MgmtMenuItem[]>([])
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([])
  const [activeCat, setActiveCat] = useState('all')

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM)
  const [itemFormError, setItemFormError] = useState('')
  const [selectedModGroupIds, setSelectedModGroupIds] = useState<Set<string>>(new Set())

  const [catsModalOpen, setCatsModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('')

  const [modsModalOpen, setModsModalOpen] = useState(false)
  const [newModGroupName, setNewModGroupName] = useState('')
  const [newModGroupType, setNewModGroupType] = useState<'single' | 'multiple'>('single')
  const [newModGroupRequired, setNewModGroupRequired] = useState(false)
  const [newModGroupMax, setNewModGroupMax] = useState('')

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('display_order')
    setCategories((data as Category[]) || [])
  }

  const loadItems = async () => {
    const { data } = await supabase.from('menu_items').select('*, categories(name, icon)').order('created_at', { ascending: false })
    setItems((data as MgmtMenuItem[]) || [])
  }

  const loadModGroups = async () => {
    const { data } = await supabase.from('modifier_groups').select('*, modifier_options(*)').order('display_order')
    const groups = ((data as ModifierGroup[]) || []).map((g) => ({
      ...g,
      modifier_options: [...(g.modifier_options || [])].sort((a, b) => a.display_order - b.display_order),
    }))
    setModGroups(groups)
  }

  useEffect(() => {
    ;(async () => {
      await Promise.all([loadCategories(), loadItems(), loadModGroups()])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openItemModal = async (item: MgmtMenuItem | null = null) => {
    setEditingId(item?.id ?? null)
    setItemForm(item ? {
      name: item.name,
      category_id: item.category_id ?? '',
      description: item.description ?? '',
      price: String(item.price ?? ''),
      image_url: item.image_url ?? '',
      available: item.available,
      is_featured: item.is_featured,
    } : EMPTY_ITEM_FORM)
    setItemFormError('')

    let assignedGroupIds: string[] = []
    if (item) {
      const { data } = await supabase.from('menu_item_modifier_groups').select('modifier_group_id').eq('menu_item_id', item.id)
      assignedGroupIds = (data || []).map((r) => r.modifier_group_id as string)
    }
    setSelectedModGroupIds(new Set(assignedGroupIds))
    setItemModalOpen(true)
  }

  const toggleModGroupSelected = (id: string) => {
    setSelectedModGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveItem = async () => {
    setItemFormError('')
    const price = parseFloat(itemForm.price)
    const payload = {
      name: itemForm.name.trim(),
      category_id: itemForm.category_id || null,
      description: itemForm.description.trim() || null,
      price,
      image_url: itemForm.image_url.trim() || null,
      available: itemForm.available,
      is_featured: itemForm.is_featured,
      updated_at: new Date().toISOString(),
    }

    if (!payload.name || Number.isNaN(price)) {
      setItemFormError('Nombre y precio son requeridos.')
      return
    }

    let error
    let itemId: string | null = editingId
    if (editingId) {
      ;({ error } = await supabase.from('menu_items').update(payload).eq('id', editingId))
    } else {
      const { data, error: insertErr } = await supabase.from('menu_items').insert(payload).select().single()
      error = insertErr
      itemId = data?.id ?? null
    }

    if (error) { setItemFormError(error.message); return }

    await supabase.from('menu_item_modifier_groups').delete().eq('menu_item_id', itemId)
    if (selectedModGroupIds.size) {
      await supabase.from('menu_item_modifier_groups').insert(
        [...selectedModGroupIds].map((gid) => ({ menu_item_id: itemId, modifier_group_id: gid }))
      )
    }

    setItemModalOpen(false)
    toast(editingId ? 'Platillo actualizado' : 'Platillo agregado')
    await loadItems()
  }

  const toggleAvail = async (id: string, newVal: boolean) => {
    const { error } = await supabase.from('menu_items').update({ available: newVal }).eq('id', id)
    if (error) { toast('Error', 'error'); return }
    toast(newVal ? 'Platillo activado' : 'Platillo pausado')
    await loadItems()
  }

  const deleteItem = async (id: string) => {
    if (!confirm('¿Eliminar este platillo permanentemente?')) return
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast('Platillo eliminado')
    await loadItems()
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCatName.trim()
    const icon = newCatIcon.trim() || '🍽️'
    if (!name) return
    const { error } = await supabase.from('categories').insert({ name, icon, display_order: categories.length + 1 })
    if (error) { toast('Error', 'error'); return }
    toast('Categoría agregada')
    setNewCatName('')
    setNewCatIcon('')
    await loadCategories()
  }

  const deleteCat = async (id: string) => {
    if (!confirm('¿Eliminar categoría? Los platillos quedarán sin categoría.')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) { toast('Error', 'error'); return }
    toast('Categoría eliminada')
    await loadCategories()
  }

  const addModGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newModGroupName.trim()
    if (!name) return

    const { error } = await supabase.from('modifier_groups').insert({
      name,
      selection_type: newModGroupType,
      required: newModGroupRequired,
      max_select: newModGroupType === 'multiple' && newModGroupMax ? parseInt(newModGroupMax) : null,
      display_order: modGroups.length,
    })
    if (error) { toast('Error al crear grupo', 'error'); return }

    toast('Grupo creado')
    setNewModGroupName('')
    setNewModGroupType('single')
    setNewModGroupRequired(false)
    setNewModGroupMax('')
    await loadModGroups()
  }

  const addModOption = async (e: React.FormEvent<HTMLFormElement>, groupId: string) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const delta = parseFloat(String(data.get('delta') ?? '')) || 0
    if (!name) return

    const { error } = await supabase.from('modifier_options').insert({ group_id: groupId, name, price_delta: delta })
    if (error) { toast('Error al agregar opción', 'error'); return }
    toast('Opción agregada')
    form.reset()
    await loadModGroups()
  }

  const deleteModGroup = async (id: string) => {
    if (!confirm('¿Eliminar este grupo y todas sus opciones? Se quitará de los platillos asignados.')) return
    const { error } = await supabase.from('modifier_groups').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast('Grupo eliminado')
    await loadModGroups()
  }

  const deleteModOption = async (id: string) => {
    const { error } = await supabase.from('modifier_options').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    await loadModGroups()
  }

  const filtered = activeCat === 'all' ? items : items.filter((i) => i.category_id === activeCat)

  return (
    <>
      <Topbar title="Gestión de Menú">
        <button className="btn btn-primary btn-sm" onClick={() => openItemModal()}>+ Agregar Platillo</button>
        <button className="btn btn-outline btn-sm" onClick={() => setModsModalOpen(true)}>Modificadores</button>
        <button className="btn btn-outline btn-sm" onClick={() => setCatsModalOpen(true)}>Categorías</button>
      </Topbar>

      <div className="admin-content">
        <div className="category-tabs" style={{ marginBottom: 20 }}>
          <button className={`cat-tab${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>Todos</button>
          {categories.map((c) => (
            <button key={c.id} className={`cat-tab${activeCat === c.id ? ' active' : ''}`} onClick={() => setActiveCat(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="menu-mgmt-grid">
          {filtered.length === 0 ? (
            <p className="text-muted text-sm">No hay platillos en esta categoría.</p>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className={`mgmt-card${!item.available ? ' mgmt-card--inactive' : ''}`}>
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="mgmt-card__img" src={item.image_url} alt={item.name} loading="lazy" />
                ) : (
                  <div className="mgmt-card__img">{item.categories?.icon ?? '🍽️'}</div>
                )}
                <div className="mgmt-card__body">
                  <div className="mgmt-card__name">{item.name}{item.is_featured ? ' ⭐' : ''}</div>
                  <div className="mgmt-card__cat">{item.categories?.name ?? '—'}</div>
                  <div className="mgmt-card__price">${Number(item.price).toFixed(2)}</div>
                </div>
                <div className="mgmt-card__actions">
                  <button className="btn btn-outline btn-sm" onClick={() => openItemModal(item)}>✏️ Editar</button>
                  <button className={`btn btn-sm ${item.available ? 'btn-ghost' : 'btn-amber'}`} onClick={() => toggleAvail(item.id, !item.available)}>
                    {item.available ? '🔴 Pausar' : '🟢 Activar'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)}>✕</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit item modal */}
      <div className={`modal-backdrop${itemModalOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 600 }}>
          <div className="modal-header">
            <h3>{editingId ? 'Editar Platillo' : 'Nuevo Platillo'}</h3>
            <button className="modal-close" onClick={() => setItemModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <form className="flex-col gap-16" onSubmit={(e) => { e.preventDefault(); saveItem() }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input type="text" className="form-control" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría *</label>
                  <select className="form-control" required value={itemForm.category_id} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-control" rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Precio *</label>
                  <input type="number" className="form-control" step="0.01" min="0" required value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">URL de Imagen</label>
                  <input type="url" className="form-control" placeholder="https://..." value={itemForm.image_url} onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-16">
                <label className="checkbox-label">
                  <input type="checkbox" checked={itemForm.available} onChange={(e) => setItemForm({ ...itemForm, available: e.target.checked })} />
                  <span>Disponible</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={itemForm.is_featured} onChange={(e) => setItemForm({ ...itemForm, is_featured: e.target.checked })} />
                  <span>Destacado ⭐</span>
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Variaciones (tamaño, extras, etc.)</label>
                <div className="flex-col gap-8" style={{ maxHeight: 140, overflowY: 'auto', padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  {modGroups.length === 0 ? (
                    <p className="text-muted text-sm">Sin grupos de modificadores creados. Usa &quot;Modificadores&quot; en la barra superior.</p>
                  ) : (
                    modGroups.map((g) => (
                      <label key={g.id} className="checkbox-label" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedModGroupIds.has(g.id)} onChange={() => toggleModGroupSelected(g.id)} />
                        <span>{g.name} <span className="text-muted text-xs">({g.selection_type === 'single' ? 'única' : 'múltiple'}{g.required ? ', obligatorio' : ''})</span></span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              {itemFormError && <div className="alert alert-error">{itemFormError}</div>}
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setItemModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveItem}>Guardar</button>
          </div>
        </div>
      </div>

      {/* Categories modal */}
      <div className={`modal-backdrop${catsModalOpen ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>Categorías</h3>
            <button className="modal-close" onClick={() => setCatsModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="flex-col gap-8">
              {categories.map((c) => (
                <div key={c.id} className="cat-list-item">
                  <span>{c.icon} {c.name}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteCat(c.id)}>✕</button>
                </div>
              ))}
            </div>
            <form className="flex gap-8 mt-16" onSubmit={addCategory}>
              <input type="text" className="form-control" placeholder="Nombre" style={{ flex: 1 }} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
              <input type="text" className="form-control" placeholder="Emoji" style={{ width: 70 }} value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} />
              <button type="submit" className="btn btn-primary">+ Agregar</button>
            </form>
          </div>
        </div>
      </div>

      {/* Modifier groups modal */}
      <div className={`modal-backdrop${modsModalOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 560 }}>
          <div className="modal-header">
            <h3>Grupos de Modificadores</h3>
            <button className="modal-close" onClick={() => setModsModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="flex-col gap-16">
              {modGroups.length === 0 ? (
                <p className="text-muted text-sm">Sin grupos creados todavía.</p>
              ) : (
                modGroups.map((g) => (
                  <div key={g.id} className="card" style={{ padding: 14 }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <strong>{g.name}</strong>
                        <span className="text-muted text-xs"> — {g.selection_type === 'single' ? 'Selección única' : 'Selección múltiple'}{g.required ? ', obligatorio' : ''}{g.max_select ? `, máx ${g.max_select}` : ''}</span>
                      </div>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteModGroup(g.id)}>✕</button>
                    </div>
                    <div className="flex-col gap-4 mt-8">
                      {g.modifier_options.length === 0 ? (
                        <p className="text-muted text-xs">Sin opciones.</p>
                      ) : (
                        g.modifier_options.map((o) => (
                          <div key={o.id} className="flex justify-between items-center text-sm">
                            <span>{o.name}{o.is_default ? <span className="text-muted text-xs"> (default)</span> : null}</span>
                            <span className="flex items-center gap-8">
                              <span className="text-muted">{Number(o.price_delta) >= 0 ? '+' : ''}{Number(o.price_delta).toFixed(2)}</span>
                              <button className="btn btn-ghost btn-sm" onClick={() => deleteModOption(o.id)}>✕</button>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <form className="flex gap-8 mt-8" onSubmit={(e) => addModOption(e, g.id)}>
                      <input type="text" name="name" className="form-control" placeholder="Opción (ej: Doble)" style={{ flex: 1 }} required />
                      <input type="number" name="delta" className="form-control" placeholder="+/- $" step="0.01" style={{ width: 90 }} required />
                      <button type="submit" className="btn btn-outline btn-sm">+ Opción</button>
                    </form>
                  </div>
                ))
              )}
            </div>

            <hr className="receipt__divider mt-16" />

            <h4 className="mt-16 mb-16">Nuevo grupo</h4>
            <form className="flex-col gap-12" onSubmit={addModGroup}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input type="text" className="form-control" placeholder="Ej: Tamaño de pan" required value={newModGroupName} onChange={(e) => setNewModGroupName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-control" value={newModGroupType} onChange={(e) => setNewModGroupType(e.target.value as 'single' | 'multiple')}>
                    <option value="single">Selección única</option>
                    <option value="multiple">Selección múltiple</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-16 items-center">
                <label className="checkbox-label">
                  <input type="checkbox" checked={newModGroupRequired} onChange={(e) => setNewModGroupRequired(e.target.checked)} />
                  <span>Obligatorio</span>
                </label>
                <div className={`form-group${newModGroupType !== 'multiple' ? ' hidden' : ''}`} style={{ flex: 1 }}>
                  <input type="number" className="form-control" placeholder="Máx. opciones (multiple)" min="1" value={newModGroupMax} onChange={(e) => setNewModGroupMax(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">+ Crear Grupo</button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
