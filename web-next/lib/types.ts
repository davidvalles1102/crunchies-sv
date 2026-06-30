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
