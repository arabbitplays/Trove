import { useState, type MouseEvent } from 'react'
import ContextMenu from '../common/ContextMenu'
import { API, formatDate } from '../../config'
import type { PeriodRecord } from '../../types'

type PeriodListProps = {
  periods: PeriodRecord[]
  onBeginCreate: () => void
  onBeginEdit: (period: PeriodRecord) => void
  onDeletePeriod: (id: string) => Promise<void>
  error: string
}

export default function PeriodList({
  periods,
  onBeginCreate,
  onBeginEdit,
  onDeletePeriod,
  error,
}: PeriodListProps) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  function openContextMenu(event: MouseEvent, id: string) {
    event.preventDefault()
    setContextMenu({ id, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="periods-view">
      <div className="periods-heading">
        <div>
          <h1>Periods</h1>
        </div>
        <button className="button button-primary" type="button" onClick={onBeginCreate}>
          New period
        </button>
      </div>
      {error && (
        <p className="period-error" role="alert">
          {error}
        </p>
      )}
      {periods.length === 0 ? (
        <p className="state">No periods yet. Create one to get started.</p>
      ) : (
        <div className="period-grid">
          {periods.map(period => {
            const cover = period.titleImageId ?? period.contentIds[0]
            return (
              <button
                className="period-card"
                key={period.id}
                type="button"
                onClick={() => onBeginEdit(period)}
                onContextMenu={event => openContextMenu(event, period.id)}
              >
                {cover ? (
                  <img
                    src={`${API}/api/contents/${cover}/thumbnail`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="period-cover-empty">No title image</span>
                )}
                <span className="period-card-info">
                  <strong>{period.name}</strong>
                  <span>
                    {formatDate(period.startDate)} – {formatDate(period.endDate)}
                  </span>
                  <span>{period.contentIds.length} images</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          className="period-context-menu"
          width={180}
          height={60}
          onClose={() => setContextMenu(null)}
          ariaLabel="Period actions"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const id = contextMenu.id
              setContextMenu(null)
              void onDeletePeriod(id)
            }}
          >
            Delete
          </button>
        </ContextMenu>
      )}
    </section>
  )
}
