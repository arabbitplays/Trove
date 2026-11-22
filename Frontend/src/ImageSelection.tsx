import { type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { Play } from 'lucide-react'

export type SelectableContent = {
  id: string
  addedAt: string
  takenAt: string | null
  tags: string[]
  autoTags: string[]
  mediaType: string
  description: string
}

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
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected
  }, [allSelected, selectedCount])

  return <>
    <div className="selection-toolbar">
      <label className="selection-all-control">
        <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={onToggleAll} disabled={total === 0} />
        <span>Select all</span>
      </label>
      <span className="selection-count" aria-live="polite">{selectedCount.toLocaleString()} selected</span>
      {onActions && <button className="button selection-actions-trigger" type="button" aria-label="Actions for selected images" disabled={!selectedCount} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        onActions(rect.right - 190, rect.bottom)
      }}>•••</button>}
    </div>
    <section className="content-grid" aria-label="Select media">
      {items.map(item => <article className={`content-card ${isSelected(item.id) ? 'content-card-selected' : ''}`} key={item.id}>
        <div className="content-selection-preview" onContextMenu={event => { if (onContextMenu) { event.preventDefault(); onContextMenu(item.id, event.clientX, event.clientY) } }}>
          <button className="content-preview-wrap" type="button" onClick={event => onOpen(item, event.shiftKey)} aria-label={`Open content ${item.id.slice(0, 8)}`}>
            <img className="content-preview" src={`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api/contents/${item.id}/thumbnail`} alt="Content" loading="lazy" />
            {item.mediaType.startsWith('video/') && <span className="video-indicator" aria-label="Video">
              <Play size={16} fill="currentColor" aria-hidden="true" />
            </span>}
          </button>
          <label className="content-selection-control">
            <input type="checkbox" checked={isSelected(item.id)} onChange={event => onToggle(item.id, (event.nativeEvent as globalThis.MouseEvent).shiftKey)} aria-label={`Select content ${item.id.slice(0, 8)}`} />
          </label>
        </div>
        {renderDetails(item)}
      </article>)}
      <div ref={endRef} className="content-grid-end" aria-hidden="true" />
    </section>
  </>
}
