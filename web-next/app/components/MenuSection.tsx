'use client'

import { useMemo, useState } from 'react'
import type { Category, MenuItem } from '@/lib/types'

export default function MenuSection({
  categories,
  items,
}: {
  categories: Category[]
  items: MenuItem[]
}) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return items.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category_id === activeCategory
      const matchSearch =
        item.name.toLowerCase().includes(query) ||
        (item.description ?? '').toLowerCase().includes(query)
      return matchCat && matchSearch
    })
  }, [items, activeCategory, search])

  return (
    <section id="menu" className="menu-section">
      <div className="section-header">
        <h2 className="section-title">Nuestro <span className="neon-amber">Menú</span></h2>
        <p className="section-sub">Frescos, auténticos y con el toque de siempre</p>
      </div>

      <div className="category-tabs">
        <button
          className={`cat-tab${activeCategory === 'all' ? ' active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`cat-tab${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      <div className="menu-search-wrap">
        <input
          type="text"
          className="form-control menu-search"
          placeholder="Buscar platillo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="disclaimer-text">📸 Imágenes de referencia — la presentación puede variar.</p>

      <div className="menu-grid">
        {filtered.length === 0 ? (
          <p className="text-muted text-sm" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
            No se encontraron platillos.
          </p>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className={`menu-card${item.is_featured ? ' featured' : ''}`}>
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="menu-card__img" src={item.image_url} alt={item.name} loading="lazy" />
              ) : (
                <div className="menu-card__img-placeholder">🍽️</div>
              )}
              <div className="menu-card__body">
                <div className="menu-card__name">{item.name}</div>
                {item.description && <div className="menu-card__desc">{item.description}</div>}
                <div className="menu-card__footer">
                  <span className="menu-card__price">${(+item.price).toFixed(2)}</span>
                  {item.is_featured && <span className="badge badge-amber menu-card__badge">⭐ Destacado</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
