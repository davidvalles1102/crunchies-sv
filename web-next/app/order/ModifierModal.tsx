'use client'

import { useState } from 'react'
import { fmt } from '@/lib/format'
import type { ModifierGroup } from '@/lib/types'
import type { Selection } from '@/lib/modifiers'

function defaultSelection(g: ModifierGroup): string[] {
  if (g.selection_type === 'single') {
    const def = g.modifier_options.find((o) => o.is_default)
    if (def) return [def.id]
    return g.modifier_options[0] ? [g.modifier_options[0].id] : []
  }
  return g.modifier_options.filter((o) => o.is_default).map((o) => o.id)
}

export default function ModifierModal({
  item,
  groups,
  onConfirm,
  onCancel,
}: {
  item: { id: string; name: string }
  groups: ModifierGroup[]
  onConfirm: (selections: Selection[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    groups.forEach((g) => { init[g.id] = defaultSelection(g) })
    return init
  })
  const [error, setError] = useState(false)

  const toggle = (g: ModifierGroup, optionId: string) => {
    setSelected((prev) => {
      const current = prev[g.id] || []
      if (g.selection_type === 'single') {
        return { ...prev, [g.id]: [optionId] }
      }
      const exists = current.includes(optionId)
      let next = exists ? current.filter((id) => id !== optionId) : [...current, optionId]
      if (!exists && g.max_select && next.length > g.max_select) {
        next = next.slice(next.length - g.max_select)
      }
      return { ...prev, [g.id]: next }
    })
  }

  const handleConfirm = () => {
    let missingRequired = false
    const selections: Selection[] = []

    groups.forEach((g) => {
      const ids = selected[g.id] || []
      if (g.required && !ids.length) missingRequired = true
      ids.forEach((id) => {
        const opt = g.modifier_options.find((o) => o.id === id)
        if (opt) selections.push({ option_name: opt.name, price_delta: Number(opt.price_delta) })
      })
    })

    if (missingRequired) { setError(true); return }
    onConfirm(selections)
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>{item.name}</h3>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          {groups.map((g) => (
            <div key={g.id} className="mm-group" style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {g.name}{g.required && <span className="text-danger"> *</span>}
                {g.selection_type === 'multiple' && g.max_select && (
                  <span className="text-muted text-xs"> (máx {g.max_select})</span>
                )}
              </div>
              <div className="flex-col gap-8">
                {g.modifier_options.map((o) => {
                  const checked = (selected[g.id] || []).includes(o.id)
                  const deltaLabel = Number(o.price_delta) > 0 ? `+${fmt.currency(o.price_delta)}`
                    : Number(o.price_delta) < 0 ? fmt.currency(o.price_delta) : ''
                  return (
                    <label key={o.id} className="checkbox-label" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type={g.selection_type === 'single' ? 'radio' : 'checkbox'}
                          name={`mm-group-${g.id}`}
                          checked={checked}
                          onChange={() => toggle(g, o.id)}
                        />
                        {o.name}
                      </span>
                      <span className="text-muted text-sm">{deltaLabel}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          {error && <div className="alert alert-error">Selecciona las opciones requeridas.</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Agregar</button>
        </div>
      </div>
    </div>
  )
}
