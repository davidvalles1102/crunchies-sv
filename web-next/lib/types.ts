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

export type RestaurantTable = {
  id: string
  number: number
  capacity: number
  location: string
  status: 'available' | 'occupied' | 'reserved' | 'maintenance'
}

export type OrderItemModifier = {
  option_name: string
  price_delta: number
}

export type PaymentOrderItem = {
  id: string
  item_name: string
  item_price: number
  quantity: number
  order_item_modifiers: OrderItemModifier[]
}

export type Payment = {
  id: string
  receipt_number: string
  method: 'cash' | 'card' | 'transfer' | 'points'
  amount: number
  change_amount: number
  created_at: string
  orders: {
    restaurant_tables: { number: number } | null
    order_items: PaymentOrderItem[]
  } | null
  profiles: { full_name: string | null } | null
}

export type ExpenseCategory = 'insumos' | 'servicios' | 'nomina' | 'renta' | 'mantenimiento' | 'marketing' | 'transporte' | 'otros'

export type Expense = {
  id: string
  category: ExpenseCategory
  description: string
  amount: number
  payment_method: 'cash' | 'card' | 'transfer'
  expense_date: string
  is_recurring: boolean
  recurrence: 'daily' | 'weekly' | 'monthly' | null
  registered_by: string
  profiles: { full_name: string | null } | null
}

export type Driver = {
  id: string
  full_name: string
  phone: string
  active: boolean
}

export type DeliveryOrderItem = {
  id: string
  item_name: string
  item_price: number
  quantity: number
  order_item_modifiers?: OrderItemModifier[]
}

export type DeliveryOrder = {
  id: string
  order_type: 'delivery' | 'takeout'
  delivery_status: 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | null
  delivery_name: string | null
  delivery_phone: string | null
  delivery_address: string | null
  delivery_fee: number
  driver_id: string | null
  payment_method: 'cash' | 'nequi'
  total: number
  notes: string | null
  created_at: string
  order_items: DeliveryOrderItem[]
}

export type Reservation = {
  id: string
  reservation_date: string
  reservation_time: string
  party_size: number
  notes: string | null
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
  table_id: string | null
  created_at: string
  profiles: { full_name: string | null; phone: string | null; loyalty_points: number } | null
  restaurant_tables: { number: number; location: string; capacity: number } | null
}

export type KitchenOrderItem = {
  id: string
  item_name: string
  quantity: number
  notes: string | null
  order_item_modifiers?: OrderItemModifier[]
}

export type KitchenOrder = {
  id: string
  status: 'in_kitchen' | 'ready' | 'delivered'
  order_type: 'dine_in' | 'takeout' | 'delivery'
  delivery_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
  restaurant_tables: { number: number } | null
  order_items: KitchenOrderItem[]
}
