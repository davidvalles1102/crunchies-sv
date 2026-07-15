'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

type CreditAccount = {
  id: string
  customer_id: string
  credit_limit: number
  balance: number
  profiles: { full_name: string | null; phone: string | null } | null
}

type CreditTx = {
  id: string
  movement_type: 'charge' | 'payment' | 'adjustment'
  amount: number
  notes: string | null
  created_at: string
}

export default function CreditClient() {
  useRequireRole(['admin', 'waiter'])
  const { tenant } = useAdmin()
  const supabase = createClient()
  const toast = useToast()

  const [accounts, setAccounts] = useState<CreditAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CreditAccount | null>(null)
  const [history, setHistory] = useState<CreditTx[]>([])

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recording, setRecording] = useState(false)

  const [limitInput, setLimitInput] = useState('')
  const [savingLimit, setSavingLimit] = useState(false)
  const [creditEnabled, setCreditEnabled] = useState(false)

  const load = useCallback(async () => {
    const [{ data }, { data: settings }] = await Promise.all([
      supabase
        .from('customer_credit_accounts')
        .select('*, profiles(full_name, phone)')
        .eq('tenant_id', tenant.tenant_id)
        .order('balance', { ascending: false }),
      supabase.from('tenant_settings').select('credit_enabled')
        .eq('tenant_id', tenant.tenant_id).maybeSingle<{ credit_enabled: boolean }>(),
    ])
    setAccounts((data as unknown as CreditAccount[]) ?? [])
    setCreditEnabled(!!settings?.credit_enabled)
    setLoading(false)
  }, [supabase, tenant.tenant_id])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function openAccount(acc: CreditAccount) {
    setSelected(acc)
    setLimitInput(String(acc.credit_limit))
    setPaymentAmount('')
    setPaymentNotes('')
    const { data } = await supabase
      .from('customer_credit_transactions')
      .select('*')
      .eq('tenant_id', tenant.tenant_id)
      .eq('customer_id', acc.customer_id)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory((data as CreditTx[]) ?? [])
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { toast('Monto inválido', 'warning'); return }

    setRecording(true)
    const { data, error } = await supabase.rpc('record_credit_payment', {
      p_tenant_id: tenant.tenant_id,
      p_customer_id: selected.customer_id,
      p_amount: amount,
      p_notes: paymentNotes.trim() || null,
    })
    if (error) {
      toast('Error al registrar el abono', 'error')
    } else {
      toast('Abono registrado ✓')
      setPaymentAmount('')
      setPaymentNotes('')
      await load()
      // Usa el balance real que devuelve la RPC, no un calculo local — si
      // hubo otro cargo/abono entre que se abrio esta cuenta y este submit
      // (otro mesero cobrando al mismo cliente), restar `amount` a mano
      // aqui daria un balance distinto al que de verdad quedo en la DB.
      const updated = Array.isArray(data) ? data[0] : data
      await openAccount({ ...selected, balance: Number(updated?.balance ?? selected.balance) })
    }
    setRecording(false)
  }

  async function saveLimit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    const limit = parseFloat(limitInput) || 0
    setSavingLimit(true)
    const { error } = await supabase.from('customer_credit_accounts').update({ credit_limit: limit }).eq('id', selected.id)
    if (error) {
      toast('Error al guardar el límite', 'error')
    } else {
      toast('Límite actualizado ✓')
      await load()
    }
    setSavingLimit(false)
  }

  if (loading) {
    return (
      <>
        <Topbar title="Fiado — Crédito de clientes" />
        <div className="admin-content"><p className="text-muted text-sm">Cargando...</p></div>
      </>
    )
  }

  if (!creditEnabled) {
    return (
      <>
        <Topbar title="Fiado — Crédito de clientes" />
        <div className="admin-content">
          <div className="card" style={{ maxWidth: 480, textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
            <h4 style={{ marginBottom: 8 }}>Módulo desactivado</h4>
            <p className="text-muted text-sm">El fiado no está activo para este negocio. Actívalo en la configuración del tenant si lo necesitas.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar title="Fiado — Crédito de clientes" />
      <div className="admin-content">
        <div className="flex-col gap-8 mb-24">
          {accounts.length === 0 ? (
            <p className="text-muted text-sm">Nadie tiene saldo pendiente todavía. Se crea una cuenta automáticamente al vender al fiado desde el POS.</p>
          ) : (
            accounts.map((acc) => (
              <button
                key={acc.id}
                className="staff-card"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: selected?.id === acc.id ? '1px solid var(--orange)' : undefined }}
                onClick={() => openAccount(acc)}
              >
                <div className="staff-card__info">
                  <div className="staff-card__name">{acc.profiles?.full_name ?? 'Cliente'}</div>
                  <div className="staff-card__meta">
                    {acc.profiles?.phone ?? '—'} · límite {acc.credit_limit > 0 ? fmt.currency(acc.credit_limit) : 'sin límite'}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: acc.balance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {fmt.currency(acc.balance)}
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <>
            <div className="card mb-24" style={{ maxWidth: 480 }}>
              <h4 style={{ marginBottom: 16 }}>💵 Registrar abono — {selected.profiles?.full_name}</h4>
              <form className="flex-col gap-12" onSubmit={recordPayment}>
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input type="number" step="0.01" min="0.01" className="form-control" required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas (opcional)</label>
                  <input type="text" className="form-control" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={recording}>
                  {recording ? 'Guardando...' : 'Registrar abono'}
                </button>
              </form>
            </div>

            <div className="card mb-24" style={{ maxWidth: 480 }}>
              <h4 style={{ marginBottom: 16 }}>🔒 Límite de crédito</h4>
              <form className="flex-col gap-12" onSubmit={saveLimit}>
                <div className="form-group">
                  <label className="form-label">Límite (0 = sin límite)</label>
                  <input type="number" step="0.01" min="0" className="form-control" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-outline" disabled={savingLimit}>
                  {savingLimit ? 'Guardando...' : 'Guardar límite'}
                </button>
              </form>
            </div>

            <div className="card" style={{ maxWidth: 480 }}>
              <h4 style={{ marginBottom: 16 }}>📋 Historial</h4>
              {history.length === 0 ? (
                <p className="text-muted text-sm">Sin movimientos.</p>
              ) : (
                <div className="flex-col gap-8">
                  {history.map((tx) => (
                    <div key={tx.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{tx.movement_type === 'charge' ? '🧾 Cargo' : tx.movement_type === 'payment' ? '💵 Abono' : '⚖️ Ajuste'} — {fmt.datetime(tx.created_at)}</span>
                      <span style={{ color: tx.movement_type === 'charge' ? 'var(--danger)' : 'var(--text)' }}>
                        {tx.movement_type === 'charge' ? '+' : '-'}{fmt.currency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
