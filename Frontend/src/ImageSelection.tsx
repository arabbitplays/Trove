import { type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { Play } from 'lucide-react'

export type SelectableContent = {
  hash: string
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
  allSelected: boolean
  isSelected: (hash: string) => boolean
  onToggleAll: () => void
  onToggle: (hash: string) => void
  onOpen: (item: T) => void
  renderDetails: (item: T) => ReactNode
  endRef: RefObject<HTMLDivElement>
}

export default function ImageSelection<T extends SelectableContent>({
  items,
  total,
  selectedCount,
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
        <span>Select all {total.toLocaleString()} matching items</span>
      </label>
      <span className="selection-count" aria-live="polite">{selectedCount.toLocaleString()} selected</span>
    </div>
    <section className="content-grid" aria-label="Select media">
      {items.map(item => <article className={`content-card ${isSelected(item.hash) ? 'content-card-selected' : ''}`} key={item.hash}>
        <div className="content-selection-preview">
          <button className="content-preview-wrap" type="button" onClick={() => onOpen(item)} aria-label={`Open content ${item.hash.slice(0, 8)}`}>
            <img className="content-preview" src={`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api/contents/${item.hash}/thumbnail`} alt="Content" loading="lazy" />
            {item.mediaType.startsWith('video/') && <span className="video-indicator" aria-label="Video">
              <Play size={16} fill="currentColor" aria-hidden="true" />
            </span>}
          </button>
          <label className="content-selection-control">
            <input type="checkbox" checked={isSelected(item.hash)} onChange={() => onToggle(item.hash)} aria-label={`Select content ${item.hash.slice(0, 8)}`} />
          </label>
        </div>
        {renderDetails(item)}
      </article>)}
      <div ref={endRef} className="content-grid-end" aria-hidden="true" />
    </section>
  </>
}
