import { type ReactNode, type RefObject } from 'react'
import { Play } from 'lucide-react'
import SelectionToolbar from './components/common/SelectionToolbar'
import { API } from './config'
import type { ContentItem } from './types'

export type SelectableContent = ContentItem

type Props<T extends SelectableContent> = {
  items: T[]
  total: number
  selectedCount: number
  onActions?: (x: number, y: number) => void
  onContextMenu?: (id: string, x: number, y: number) => void
  allSelected: boolean
  isSelected: (id: string) => boolean
  onToggleAll: () => void
  onToggle: (id: string, shiftKey?: boolean) => void
  onOpen: (item: T, shiftKey?: boolean) => void
  renderDetails: (item: T) => ReactNode
  endRef: RefObject<HTMLDivElement>
}

export default function ImageSelection<T extends SelectableContent>({
  items,
  total,
  selectedCount,
  onActions,
  onContextMenu,
  allSelected,
  isSelected,
  onToggleAll,
  onToggle,
  onOpen,
  renderDetails,
  endRef,
}: Props<T>) {
  return (
    <>
      <SelectionToolbar
        total={total}
        selectedCount={selectedCount}
        allSelected={allSelected}
        onToggleAll={onToggleAll}
        onActions={onActions}
      />
      <section className="content-grid" aria-label="Select media">
        {items.map(item => (
          <article
            className={`content-card ${isSelected(item.id) ? 'content-card-selected' : ''}`}
            key={item.id}
          >
            <div
              className="content-selection-preview"
              onContextMenu={event => {
                if (onContextMenu) {
                  event.preventDefault()
                  onContextMenu(item.id, event.clientX, event.clientY)
                }
              }}
            >
              <button
                className="content-preview-wrap"
                type="button"
                onClick={event => onOpen(item, event.shiftKey)}
                aria-label={`Open content ${item.id.slice(0, 8)}`}
              >
                <img
                  className="content-preview"
                  src={`${API}/api/contents/${item.id}/thumbnail`}
                  alt={item.description || ''}
                  loading="lazy"
                />
                {item.mediaType.startsWith('video/') && (
                  <span className="video-indicator" aria-label="Video">
                    <Play size={16} fill="currentColor" aria-hidden="true" />
                  </span>
                )}
              </button>
              <label className="content-selection-control">
                <input
                  type="checkbox"
                  checked={isSelected(item.id)}
                  onChange={event =>
                    onToggle(
                      item.id,
                      (event.nativeEvent as globalThis.MouseEvent).shiftKey
                    )
                  }
                  aria-label={`Select content ${item.id.slice(0, 8)}`}
                />
              </label>
            </div>
            {renderDetails(item)}
          </article>
        ))}
        <div ref={endRef} className="content-grid-end" aria-hidden="true" />
      </section>
    </>
  )
}
