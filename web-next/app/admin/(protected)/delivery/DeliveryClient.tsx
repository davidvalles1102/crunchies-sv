'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { modifiersSummary } from '@/lib/modifiers'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import type { Driver, DeliveryZone, DeliveryOrder } from '@/lib/types'

type TypeFilter = 'all' | 'delivery' | 'takeout'
type BoardOrder = DeliveryOrder & { elapsedMinutes: number }

const STATUS_CFG: Record<string, { label: string; cls: string; icon: string; next: string | null; nextLabel: string | null }> = {
  pending:    { label: 'Pendiente',  cls: 'badge-amber', icon: '🕐', next: 'preparing',  nextLabel: '👨‍🍳 Preparar' },
  preparing:  { label: 'Preparando', cls: 'badge-info',  icon: '🔥', next: 'ready',       nextLabel: '✅ Listo' },
  ready:      { label: 'Listo',      cls: 'badge-green', icon: '✅', next: 'on_the_way',  nextLabel: '🛵 En Camino' },
  on_the_way: { label: 'En Camino',  cls: 'badge-green', icon: '🛵', next: 'delivered',   nextLabel: '📦 Entregado' },
  delivered:  { label: 'Entregado',  cls: 'badge-muted', icon: '📦', next: null,          nextLabel: null },
}

const ORDER_STATUS_MAP: Record<string, string> = {
  preparing: 'in_kitchen',
  ready: 'ready',
  on_the_way: 'ready',
  delivered: 'delivered',
}

const ADVANCE_MSGS: Record<string, string> = {
  preparing: '🔥 Orden en preparación',
  ready: '✅ Orden lista',
  on_the_way: '🛵 Repartidor en camino',
  delivered: '📦 Entregado — recuerda cobrar',
}

export default function DeliveryClient() {
  useRequireRole(['admin', 'waiter'])
  const supabase = createClient()
  const toast = useToast()

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [allOrders, setAllOrders] = useState<BoardOrder[]>([])
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])

  const [detailOrder, setDetailOrder] = useState<BoardOrder | null>(null)
  const [driversOpen, setDriversOpen] = useState(false)
  const [zonesOpen, setZonesOpen] = useState(false)

  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneFee, setNewZoneFee] = useState('')

  const [dotSubscribed, setDotSubscribed] = useState(false)
  const [dotFlash, setDotFlash] = useState(false)

  async function loadDrivers() {
    const { data } = await supabase.from('drivers').select('*').order('full_name')
    setDrivers((data as Driver[]) || [])
  }

  async function loadZones() {
    const { data } = await supabase.from('delivery_zones').select('*').order('display_order')
    setZones((data as DeliveryZone[]) || [])
  }

  const loadOrders = async () => {
    // eslint-disable-next-line react-hooks/purity -- only ever invoked from effects/handlers, never during render
    const now = Date.now()
    const today = new Date(now).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(*))')
      .in('order_type', ['delivery', 'takeout'])
      .not('delivery_status', 'eq', 'delivered')
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: false })

    const { data: delivered } = await supabase
      .from('orders')
      .select('id, order_type')
      .in('order_type', ['delivery', 'takeout'])
      .eq('delivery_status', 'delivered')
      .gte('created_at', `${today}T00:00:00`)

    if (error) { toast('Error al cargar órdenes', 'error'); return }

    const withElapsed: BoardOrder[] = ((data as DeliveryOrder[]) || []).map((o) => ({
      ...o,
      elapsedMinutes: Math.floor((now - new Date(o.created_at).getTime()) / 60000),
    }))

    setAllOrders(withElapsed)
    setDeliveredCount(delivered?.length ?? 0)
  }

  async function addDriver(e: React.FormEvent) {
    e.preventDefault()
    const full_name = newDriverName.trim()
    const phone = newDriverPhone.trim()
    if (!full_name || !phone) return

    const { error } = await supabase.from('drivers').insert({ full_name, phone })
    if (error) { toast('Error al agregar repartidor', 'error'); return }

    toast('Repartidor agregado')
    setNewDriverName('')
    setNewDriverPhone('')
    await loadDrivers()
    await loadOrders()
  }

  async function toggleDriverActive(id: string, newVal: boolean) {
    const { error } = await supabase.from('drivers').update({ active: newVal }).eq('id', id)
    if (error) { toast('Error', 'error'); return }
    await loadDrivers()
    await loadOrders()
  }

  async function deleteDriver(id: string) {
    if (!confirm('¿Eliminar este repartidor? Las órdenes asignadas quedarán sin repartidor.')) return
    const { error } = await supabase.from('drivers').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast('Repartidor eliminado')
    await loadDrivers()
    await loadOrders()
  }

  async function assignDriver(orderId: string, driverId: string) {
    const { error } = await supabase.from('orders').update({ driver_id: driverId || null }).eq('id', orderId)
    if (error) { toast('Error al asignar repartidor', 'error'); return }
    const driver = drivers.find((d) => d.id === driverId)
    toast(driverId ? `🛵 Asignado a ${driver?.full_name}` : 'Repartidor desasignado', 'success')
    await loadOrders()
  }

  async function addZone(e: React.FormEvent) {
    e.preventDefault()
    const name = newZoneName.trim()
    const fee = parseFloat(newZoneFee)
    if (!name || Number.isNaN(fee)) return

    const { error } = await supabase.from('delivery_zones').insert({ name, fee, display_order: zones.length })
    if (error) { toast('Error al agregar zona', 'error'); return }

    toast('Zona agregada')
    setNewZoneName('')
    setNewZoneFee('')
    await loadZones()
  }

  async function toggleZoneActive(id: string, newVal: boolean) {
    const { error } = await supabase.from('delivery_zones').update({ active: newVal }).eq('id', id)
    if (error) { toast('Error', 'error'); return }
    await loadZones()
  }

  async function deleteZone(id: string) {
    if (!confirm('¿Eliminar esta zona de entrega?')) return
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast('Zona eliminada')
    await loadZones()
  }

  async function advanceStatus(orderId: string, newDeliveryStatus: string) {
    const orderStatus = ORDER_STATUS_MAP[newDeliveryStatus] ?? 'open'
    const { error } = await supabase
      .from('orders')
      .update({ delivery_status: newDeliveryStatus, status: orderStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (error) { toast('Error al actualizar', 'error'); return }
    toast(ADVANCE_MSGS[newDeliveryStatus] ?? 'Actualizado', 'success')
    await loadOrders()
  }

  useEffect(() => {
    ;(async () => {
      await loadDrivers()
      await loadZones()
      await loadOrders()
    })()

    const channel = supabase
      .channel('delivery-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        const t = (payload.new as { order_type?: string } | null)?.order_type
        if (!t || !['delivery', 'takeout'].includes(t)) return

        setDotFlash(true)
        setTimeout(() => setDotFlash(false), 2000)

        if (payload.eventType === 'INSERT') {
          toast(t === 'delivery' ? '🛵 Nueva orden a domicilio' : '🥡 Nueva orden para llevar', 'info')
        }
        await loadOrders()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setDotSubscribed(true)
      })

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = typeFilter === 'all' ? allOrders : allOrders.filter((o) => o.order_type === typeFilter)

  function openDetail(id: string) {
    const o = allOrders.find((x) => x.id === id)
    if (o) setDetailOrder(o)
  }

  return (
    <>
      <Topbar title="Delivery & Para Llevar">
        <div className={`realtime-dot${dotFlash ? ' dot--active' : ''}`} style={dotSubscribed ? { opacity: 1 } : undefined}>
          <span className="dot" /> En vivo
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-outline btn-sm"
            style={typeFilter === 'all' ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
            onClick={() => setTypeFilter('all')}
          >Todos</button>
          <button
            className="btn btn-outline btn-sm"
            style={typeFilter === 'delivery' ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
            onClick={() => setTypeFilter('delivery')}
          >🛵 Domicilio</button>
          <button
            className="btn btn-outline btn-sm"
            style={typeFilter === 'takeout' ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
            onClick={() => setTypeFilter('takeout')}
          >🥡 Para Llevar</button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setDriversOpen(true)}>🛵 Repartidores</button>
        <button className="btn btn-outline btn-sm" onClick={() => setZonesOpen(true)}>📍 Zonas</button>
      </Topbar>

      <div className="admin-content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          <div className="stat-card stat-amber">
            <div className="stat-label">Pendientes</div>
            <div className="stat-value">{allOrders.filter((o) => o.delivery_status === 'pending').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Preparando</div>
            <div className="stat-value">{allOrders.filter((o) => o.delivery_status === 'preparing').length}</div>
          </div>
          <div className="stat-card stat-green">
            <div className="stat-label">Listos</div>
            <div className="stat-value">{allOrders.filter((o) => o.delivery_status === 'ready').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En Camino</div>
            <div className="stat-value">{allOrders.filter((o) => o.delivery_status === 'on_the_way').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Entregados Hoy</div>
            <div className="stat-value">{deliveredCount}</div>
          </div>
        </div>

        <div className="delivery-board mt-24">
          {filtered.length === 0 ? (
            <div className="kitchen-empty" style={{ maxWidth: 400, margin: '0 auto' }}>
              <div style={{ fontSize: '3rem' }}>{typeFilter === 'delivery' ? '🛵' : typeFilter === 'takeout' ? '🥡' : '📭'}</div>
              <p className="text-muted text-sm mt-8">Sin órdenes activas por ahora</p>
            </div>
          ) : (
            filtered.map((o) => (
              <DeliveryCard
                key={o.id}
                order={o}
                drivers={drivers}
                onDetail={() => openDetail(o.id)}
                onAdvance={(status) => advanceStatus(o.id, status)}
                onAssignDriver={(driverId) => assignDriver(o.id, driverId)}
              />
            ))
          )}
        </div>
      </div>

      <div className={`modal-backdrop${detailOrder ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 520 }}>
          <div className="modal-header">
            <h3>{detailOrder ? (detailOrder.order_type === 'delivery' ? '🛵 Orden Domicilio' : '🥡 Para Llevar') : 'Detalle de Orden'}</h3>
            <button className="modal-close" onClick={() => setDetailOrder(null)}>✕</button>
          </div>
          {detailOrder && (() => {
            const o = detailOrder
            const ds = o.delivery_status || 'pending'
            const cfg = STATUS_CFG[ds]
            const isDelivery = o.order_type === 'delivery'
            let nextStatus = cfg.next
            if (!isDelivery && ds === 'ready') nextStatus = 'delivered'
            const nextCfg = nextStatus ? STATUS_CFG[nextStatus] : null
            const nextLabel = nextStatus
              ? (isDelivery || ds !== 'ready' ? (nextCfg?.nextLabel ?? 'Avanzar') : '✅ Marcar Recogido')
              : null

            return (
              <>
                <div className="modal-body">
                  <div className="flex-col gap-16">
                    <div className="card" style={{ borderColor: 'var(--amber-dim)' }}>
                      <h4 style={{ color: 'var(--amber)', marginBottom: 10 }}>👤 Cliente</h4>
                      <div className="flex-col gap-6 text-sm">
                        <div className="flex justify-between"><span className="text-muted">Nombre</span><span style={{ fontWeight: 600 }}>{o.delivery_name}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Teléfono</span><span>{o.delivery_phone}</span></div>
                        {isDelivery && (
                          <div className="flex justify-between"><span className="text-muted">Dirección</span><span style={{ textAlign: 'right', maxWidth: 220 }}>{o.delivery_address}</span></div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted">Pago</span>
                          <span style={{ fontWeight: 600, color: o.payment_method === 'nequi' ? 'var(--green)' : 'var(--amber)' }}>
                            {o.payment_method === 'nequi' ? '📱 Nequi' : '💵 Efectivo'}
                          </span>
                        </div>
                        {isDelivery && (
                          <div className="flex justify-between"><span className="text-muted">Repartidor</span><span>{drivers.find((d) => d.id === o.driver_id)?.full_name ?? 'Sin asignar'}</span></div>
                        )}
                        {o.delivery_fee > 0 && (
                          <div className="flex justify-between"><span className="text-muted">Costo de envío</span><span>{fmt.currency(o.delivery_fee)}</span></div>
                        )}
                      </div>
                    </div>
                    <div className="card">
                      <h4 style={{ marginBottom: 10 }}>🧾 Items</h4>
                      {(o.order_items || []).map((i) => (
                        <div key={i.id} className="receipt__item text-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                          <span>
                            {i.quantity}x {i.item_name}
                            {i.order_item_modifiers?.length ? (
                              <><br /><span className="text-muted text-xs">{modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))}</span></>
                            ) : null}
                          </span>
                          <span>{fmt.currency(i.item_price * i.quantity)}</span>
                        </div>
                      ))}
                      {o.notes && <div className="text-sm text-muted mt-8">📋 {o.notes}</div>}
                      <div className="receipt__item receipt__total mt-8" style={{ paddingTop: 8, borderTop: '1px solid var(--border-lit)' }}>
                        <span>Total a cobrar</span>
                        <span className="neon-amber">{fmt.currency(o.total)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted text-sm">Estado actual</span>
                      <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                    </div>
                    <div className="text-muted text-xs">Recibida: {fmt.datetime(o.created_at)}</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline" onClick={() => setDetailOrder(null)}>Cerrar</button>
                  {nextStatus && (
                    <button className="btn btn-primary" onClick={() => { setDetailOrder(null); advanceStatus(o.id, nextStatus as string) }}>
                      {nextCfg?.icon ?? ''} {nextLabel}
                    </button>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      <div className={`modal-backdrop${driversOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 520 }}>
          <div className="modal-header">
            <h3>Repartidores</h3>
            <button className="modal-close" onClick={() => setDriversOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="flex-col gap-8">
              {drivers.length === 0 ? (
                <p className="text-muted text-sm">Sin repartidores registrados.</p>
              ) : (
                drivers.map((d) => {
                  const workload = allOrders.filter((o) => o.driver_id === d.id && ['ready', 'on_the_way'].includes(o.delivery_status ?? '')).length
                  return (
                    <div key={d.id} className="card" style={{ padding: '10px 14px' }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <strong>{d.full_name}</strong>
                          <span className="text-muted text-xs"> · 📞 {d.phone}</span>
                          {!d.active && <span className="badge badge-muted text-xs">Inactivo</span>}
                        </div>
                        <div className="flex gap-8 items-center">
                          {workload > 0 && <span className="badge badge-amber text-xs">{workload} en ruta</span>}
                          <button className="btn btn-outline btn-sm" onClick={() => toggleDriverActive(d.id, !d.active)}>{d.active ? 'Desactivar' : 'Activar'}</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteDriver(d.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <hr className="receipt__divider mt-16" />
            <h4 className="mt-16 mb-16">Nuevo repartidor</h4>
            <form className="flex gap-8" onSubmit={addDriver}>
              <input type="text" className="form-control" placeholder="Nombre" style={{ flex: 1 }} required value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} />
              <input type="tel" className="form-control" placeholder="Teléfono" style={{ flex: 1 }} required value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} />
              <button type="submit" className="btn btn-primary btn-sm">+ Agregar</button>
            </form>
          </div>
        </div>
      </div>

      <div className={`modal-backdrop${zonesOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 480 }}>
          <div className="modal-header">
            <h3>Zonas de Entrega</h3>
            <button className="modal-close" onClick={() => setZonesOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="flex-col gap-8">
              {zones.length === 0 ? (
                <p className="text-muted text-sm">Sin zonas registradas. El costo de envío en el pedido web no se podrá calcular hasta crear al menos una.</p>
              ) : (
                zones.map((z) => (
                  <div key={z.id} className="card" style={{ padding: '10px 14px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <strong>{z.name}</strong>
                        <span className="neon-amber text-sm"> — {fmt.currency(z.fee)}</span>
                        {!z.active && <span className="badge badge-muted text-xs">Inactiva</span>}
                      </div>
                      <div className="flex gap-8">
                        <button className="btn btn-outline btn-sm" onClick={() => toggleZoneActive(z.id, !z.active)}>{z.active ? 'Desactivar' : 'Activar'}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteZone(z.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <hr className="receipt__divider mt-16" />
            <h4 className="mt-16 mb-16">Nueva zona</h4>
            <form className="flex gap-8" onSubmit={addZone}>
              <input type="text" className="form-control" placeholder="Nombre de la zona" style={{ flex: 1 }} required value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} />
              <input type="number" className="form-control" placeholder="Tarifa $" step="0.01" min="0" style={{ width: 110 }} required value={newZoneFee} onChange={(e) => setNewZoneFee(e.target.value)} />
              <button type="submit" className="btn btn-primary btn-sm">+ Agregar</button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

function DeliveryCard({ order, drivers, onDetail, onAdvance, onAssignDriver }: {
  order: BoardOrder
  drivers: Driver[]
  onDetail: () => void
  onAdvance: (status: string) => void
  onAssignDriver: (driverId: string) => void
}) {
  const ds = order.delivery_status || 'pending'
  const cfg = STATUS_CFG[ds] ?? STATUS_CFG.pending
  const isDelivery = order.order_type === 'delivery'
  const timerCls = order.elapsedMinutes < 20 ? 'timer--ok' : order.elapsedMinutes < 40 ? 'timer--warn' : 'timer--urgent'
  const items = order.order_items || []

  let nextLabel = cfg.nextLabel
  let nextStatus = cfg.next
  if (!isDelivery && ds === 'ready') { nextLabel = '✅ Marcado como Recogido'; nextStatus = 'delivered' }

  return (
    <div className="delivery-card">
      <div className="delivery-card__header">
        <div className="delivery-card__type">{isDelivery ? '🛵 Domicilio' : '🥡 Para Llevar'}</div>
        <div className={`delivery-card__timer ${timerCls}`}>⏱ {order.elapsedMinutes}m</div>
        <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
      </div>

      <div className="delivery-card__customer">
        <div className="delivery-card__name">{order.delivery_name || '—'}</div>
        <div className="delivery-card__phone text-sm text-muted">📞 {order.delivery_phone || '—'}</div>
        {isDelivery && order.delivery_address && (
          <div className="delivery-card__address text-sm" style={{ color: 'var(--amber)', marginTop: 4 }}>📍 {order.delivery_address}</div>
        )}
        <div className="text-xs mt-4" style={{ color: order.payment_method === 'nequi' ? 'var(--green)' : 'var(--text-muted)' }}>
          {order.payment_method === 'nequi' ? '📱 Nequi — verificar pago' : '💵 Efectivo'}
        </div>
        {isDelivery && (
          <div className="flex gap-8 items-center mt-8">
            <span className="text-xs text-muted">🛵 Repartidor:</span>
            <select
              className="form-control driver-select"
              style={{ flex: 1, padding: '4px 8px', fontSize: '.8rem' }}
              value={order.driver_id ?? ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onAssignDriver(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {drivers.filter((d) => d.active).map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="delivery-card__items">
        {items.map((i) => (
          <div key={i.id} className="delivery-card__item">
            <span className="kitchen-item__qty">{i.quantity}</span>
            <span>
              {i.item_name}
              {i.order_item_modifiers?.length ? (
                <span className="text-muted text-xs"> ({modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))})</span>
              ) : null}
            </span>
          </div>
        ))}
        {order.notes && <div className="text-xs text-muted mt-4">📋 {order.notes}</div>}
      </div>

      <div className="delivery-card__footer">
        <span className="neon-amber" style={{ fontWeight: 700, fontFamily: 'var(--font-d)' }}>{fmt.currency(order.total)}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={onDetail}>Ver</button>
          {nextStatus && <button className="btn btn-primary btn-sm" onClick={() => onAdvance(nextStatus as string)}>{nextLabel}</button>}
        </div>
      </div>
    </div>
  )
}
