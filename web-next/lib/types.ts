export type Category = {
  id: string
  name: string
  icon: string | null
  display_order: number
  active: boolean
}

export type MenuItem = {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  image_url: string | null
  available: boolean
  is_featured: boolean
  categories: { name: string } | null
}

export type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  role: string
  loyalty_points: number
}

export type ModifierOption = {
  id: string
  name: string
  price_delta: number
  is_default: boolean
  display_order: number
}

export type ModifierGroup = {
  id: string
  name: string
  selection_type: 'single' | 'multiple'
  required: boolean
  max_select: number | null
  modifier_options: ModifierOption[]
}

export type DeliveryZone = {
  id: string
  name: string
  fee: number
  active: boolean
  display_order: number
}

export type OrderMenuItem = {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  image_url: string | null
  available: boolean
  categories: { name: string; icon: string | null } | null
}
