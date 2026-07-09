// A shell-owned mount point directly above the bottom nav. AppLayout renders an empty
// grid-row element and publishes it here; a route (today only the catalog) portals
// content into it via createPortal. This lets the catalog's last-opened bar sit as a
// real layout row above the nav — flush, no overlap, no sticky offset — while its
// component keeps rendering inside CatalogScreen where the slab/filter data lives. The
// portal only teleports the DOM output, not the data.

import { createContext, useContext } from 'react'

/** The slot element, or null before AppLayout has mounted it. */
export const BottomSlotContext = createContext<HTMLElement | null>(null)

export function useBottomSlot(): HTMLElement | null {
  return useContext(BottomSlotContext)
}
