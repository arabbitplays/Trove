import { useEffect, type RefObject } from 'react'
import TagPicker from '../common/TagPicker'
import ImageSelection from '../../ImageSelection'
import type { ContentItem, ContentSelectionState } from '../../types'

type AddImagesModalProps = {
  open: boolean
  periodName: string
  onClose: () => void
  contents: ContentItem[]
  totalContents: number
  selectedTags: string[]
  availableTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  selection: ContentSelectionState
  onToggleContent: (id: string, shiftKey?: boolean) => void
  onToggleAll: () => void
  onAddSelected: () => Promise<void>
  busy: boolean
  endRef: RefObject<HTMLDivElement>
}

export default function AddImagesModal({
  open,
  periodName,
  onClose,
  contents,
  totalContents,
  selectedTags,
  availableTags,
  onToggleTag,
  onClearTags,
  selection,
  onToggleContent,
  onToggleAll,
  onAddSelected,
  busy,
  endRef,
}: AddImagesModalProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const selectedCount =
    selection.mode === 'all'
      ? Math.max(0, totalContents - selection.excludedIds.length)
      : selection.ids.length
  const allSelected = selection.mode === 'all' && selection.excludedIds.length === 0

  return (
    <div
      className="popup-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="import-popup period-picker-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="period-picker-title"
      >
        <header className="popup-header">
          <div>
            <h2 id="period-picker-title">Add images to {periodName}</h2>
            <p>Filter by tags and select images to add.</p>
          </div>
          <button
            className="button"
            type="button"
            onClick={onClose}
            aria-label="Close image picker"
            disabled={busy}
          >
            Close
          </button>
        </header>
        <TagPicker
          selectedTags={selectedTags}
          availableTags={availableTags}
          onToggleTag={onToggleTag}
          onClearTags={onClearTags}
          ariaLabel="Filter period content by tags"
        />
        <ImageSelection
          items={contents}
          total={totalContents}
          selectedCount={selectedCount}
          allSelected={allSelected}
          isSelected={id =>
            selection.mode === 'all'
              ? !selection.excludedIds.includes(id)
              : selection.ids.includes(id)
          }
          onToggleAll={onToggleAll}
          onToggle={onToggleContent}
          onOpen={(item, shiftKey) => onToggleContent(item.id, shiftKey)}
          renderDetails={item => {
            const combinedTags = [
              ...item.tags.map(tag => ({ tag, isAuto: false })),
              ...item.autoTags.map(tag => ({ tag, isAuto: true })),
            ]
            return (
              <div className="content-details">
                {combinedTags.map(({ tag, isAuto }) => (
                  <span
                    key={`${tag}-${isAuto ? 'auto' : 'manual'}`}
                    className={`tag ${isAuto ? 'tag-auto' : ''}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )
          }}
          endRef={endRef}
        />
        <div className="period-add-actions">
          <span>{selectedCount.toLocaleString()} selected</span>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void onAddSelected()}
            disabled={busy || selectedCount === 0}
          >
            {busy ? 'Adding…' : 'Add selected to period'}
          </button>
        </div>
      </section>
    </div>
  )
}
