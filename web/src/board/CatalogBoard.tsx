// Read-only board render for the catalog: stacks the board background, the
// visible hold-set overlays, and hold markers positioned by the shared render
// geometry. Ported from ios/MoonBoardLED/Board/BoardImageView.swift. This is
// non-interactive by design (R13) — it takes no tap handler.

import type { CSSProperties } from 'react'
import type { CatalogHold } from '../catalog/catalogSync'
import { displayed, holdColor } from '../types'
import type { CatalogBoardDef } from './boards'
import { center } from './renderGeometry'

interface CatalogBoardProps {
  board: CatalogBoardDef
  holds: CatalogHold[]
  /** Hold-set ids whose overlay art is drawn; defaults to all of the board's sets. */
  visibleHoldSetIds?: Set<number>
  /** When false (default), move roles collapse to a single blue marker. */
  showBeta?: boolean
}

const fill: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
}

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}boards/${path}`
}

export function CatalogBoard({
  board,
  holds,
  visibleHoldSetIds,
  showBeta = false,
}: CatalogBoardProps) {
  const g = board.geometry
  const overlays = board.holdSets.filter(
    (s) => visibleHoldSetIds === undefined || visibleHoldSetIds.has(s.id),
  )
  // Marker diameter as a fraction of the image width: ~60% of one column's span.
  const markerPct = ((1 - g.leftMargin - g.rightMargin) / g.numColumns) * 60

  return (
    <div
      className="catalog-board"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${g.width} / ${g.height}`,
      }}
    >
      <img src={assetUrl(`${board.background}.png`)} alt="" style={fill} />
      {overlays.map((s) => (
        <img
          key={s.id}
          src={assetUrl(`${board.folder}/${s.imageName}.png`)}
          alt=""
          data-holdset={s.id}
          style={fill}
        />
      ))}
      {holds.map((h, i) => {
        const { x, y } = center(g, h.c, h.r)
        const role = displayed(h.t, showBeta)
        return (
          <div
            key={`${h.c}-${h.r}-${i}`}
            data-testid="hold-marker"
            data-role={role}
            style={{
              position: 'absolute',
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${markerPct}%`,
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `2px solid ${holdColor[role]}`,
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
              boxSizing: 'border-box',
            }}
          />
        )
      })}
    </div>
  )
}
