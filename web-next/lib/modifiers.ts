import { createClient } from './supabase/client'
import type { ModifierGroup } from './types'

export type Selection = { option_name: string; price_delta: number }

const groupsCache: Record<string, ModifierGroup[]> = {}

export async function getItemModifierGroups(menuItemId: string): Promise<ModifierGroup[]> {
  if (groupsCache[menuItemId]) return groupsCache[menuItemId]

  const supabase = createClient()
  const { data, error } = await supabase
    .from('menu_item_modifier_groups')
    .select('modifier_groups(id, name, selection_type, required, max_select, modifier_options(id, name, price_delta, is_default, display_order))')
    .eq('menu_item_id', menuItemId)

  if (error || !data) { groupsCache[menuItemId] = []; return [] }

  type Row = { modifier_groups: ModifierGroup | null }
  const groups = (data as unknown as Row[])
    .map((row) => row.modifier_groups)
    .filter((g): g is ModifierGroup => !!g)
    .map((g) => ({
      ...g,
      modifier_options: [...(g.modifier_options || [])].sort((a, b) => a.display_order - b.display_order),
    }))

  groupsCache[menuItemId] = groups
  return groups
}

export function modifiersExtraPrice(selections: Selection[]) {
  return (selections || []).reduce((s, m) => s + Number(m.price_delta), 0)
}

export function modifiersSummary(selections: Selection[]) {
  return (selections || []).map((m) => m.option_name).join(', ')
}

export function buildLineKey(menuItemId: string, selections: Selection[]) {
  return menuItemId + '::' + (selections || []).map((m) => m.option_name).sort().join(',')
}
