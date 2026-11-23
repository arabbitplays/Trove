import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Play } from 'lucide-react'
import SelectionToolbar from '../common/SelectionToolbar'
import ContextMenu from '../common/ContextMenu'
import SingleContentView from '../media/SingleContentView'
import DateInput from '../../DateInput'
import { API, formatDate } from '../../config'
import type { ContentItem, PeriodRecord } from '../../types'

type PeriodDetailProps = {
  period: PeriodRecord | null
  isNew: boolean
  periodContents: ContentItem[]
  onBack: () => void
  onOpenAddModal: () => void
  onSavePeriodFields: (fields: { name?: string; startDate?: string; endDate?: string }) => Promise<boolean>
  onCreatePeriod: (data: { name: string; startDate: string; endDate: string }) => Promise<void>
  onRemoveContent: (id: string) => Promise<void>
  onRemoveSelectedContents: (ids: string[]) => Promise<void>
  onSetTitleImage: (id: string) => Promise<void>
  onSaveMetadata: (id: string, description: string, takenAt: string | null) => Promise<boolean>
  onChangeTag: (id: string, tag: string, remove?: boolean) => Promise<boolean>
  allTags: string[]
  autoTagNames: string[]
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
  busy: boolean
  error: string
}

export default function PeriodDetail({
  period,
  isNew,
  periodContents,
  onBack,
  onOpenAddModal,
  onSavePeriodFields,
  onCreatePeriod,
  onRemoveContent,
  onRemoveSelectedContents,
  onSetTitleImage,
  onSaveMetadata,
  onChangeTag,
  allTags,
  autoTagNames,
  tagShortcuts,
  onShortcutChange,
  busy,
  error,
}: PeriodDetailProps) {
  const [name, setName] = useState(period?.name ?? '')
  const [startDate, setStartDate] = useState(period?.startDate.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(period?.endDate.slice(0, 10) ?? '')
  const [imageView, setImageView] = useState<'grid' | 'single'>('grid')
  const [currentContentId, setCurrentContentId] = useState('')
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [cardContextMenu, setCardContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [imageActionsMenu, setImageActionsMenu] = useState<{ x: number; y: number } | null>(null)
  const selectionAnchor = useRef<string | null>(null)

  useEffect(() => {
    if (period) {
      setName(period.name)
      setStartDate(period.startDate.slice(0, 10))
      setEndDate(period.endDate.slice(0, 10))
    }
  }, [period])

  const currentContent = periodContents.find(item => item.id === currentContentId)

  function openSingle(item: ContentItem) {
    setCurrentContentId(item.id)
    setDescriptionDraft(item.description)
    setImageView('single')
  }

  function movePeriodSelection(direction: -1 | 1) {
    const index = periodContents.findIndex(item => item.id === currentContentId)
    const effectiveIndex = index < 0 ? 0 : index
    const next = periodContents[effectiveIndex + direction]
    if (next) openSingle(next)
  }

  useEffect(() => {
    if (imageView !== 'single') return
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        movePeriodSelection(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        movePeriodSelection(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imageView, currentContentId, periodContents])

  function toggleImageSelection(id: string, shiftKey = false) {
    if (shiftKey && selectionAnchor.current) {
      const anchorIndex = periodContents.findIndex(item => item.id === selectionAnchor.current)
      const clickedIndex = periodContents.findIndex(item => item.id === id)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const [start, end] = [anchorIndex, clickedIndex].sort((a, b) => a - b)
        setSelectedImageIds(periodContents.slice(start, end + 1).map(item => item.id))
        return
      }
    }
    selectionAnchor.current = id
    setSelectedImageIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    )
  }

  const allImagesSelected =
    periodContents.length > 0 && periodContents.every(item => selectedImageIds.includes(item.id))

  function toggleAllSelection() {
    setSelectedImageIds(allImagesSelected ? [] : periodContents.map(item => item.id))
  }

  async function handleFieldBlur(field: 'name' | 'startDate' | 'endDate', value: string) {
    if (isNew || !period) return
    const original = field === 'name' ? period.name : period[field].slice(0, 10)
    if (value !== original) {
      await onSavePeriodFields({ [field]: value })
    }
  }

  async function handleFormSubmit(event: FormEvent) {
    event.preventDefault()
    if (isNew) {
      await onCreatePeriod({ name, startDate, endDate })
    }
  }

  function openCardContextMenu(event: MouseEvent, id: string) {
    event.preventDefault()
    setCardContextMenu({ id, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="periods-view">
      <div className="periods-heading period-detail-heading">
        <div>
          <button className="text-button" type="button" onClick={onBack}>
            ← All periods
          </button>
          <h1>{isNew ? 'New period' : period?.name}</h1>
          {!isNew && period && (
            <span className="period-detail-dates">
              {formatDate(period.startDate)} – {formatDate(period.endDate)}
            </span>
          )}
        </div>
        {!isNew && (
          <div className="period-view-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={onOpenAddModal}
            >
              Add images
            </button>
            <div className="view-toggle" role="group" aria-label="Period image view">
              <button
                className={`button ${imageView === 'grid' ? 'button-primary' : ''}`}
                type="button"
                onClick={() => setImageView('grid')}
                aria-pressed={imageView === 'grid'}
              >
                Grid
              </button>
              <button
                className={`button ${imageView === 'single' ? 'button-primary' : ''}`}
                type="button"
                onClick={() => {
                  if (periodContents.length) openSingle(currentContent ?? periodContents[0])
                }}
                disabled={!periodContents.length}
                aria-pressed={imageView === 'single'}
              >
                Single
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="period-error" role="alert">
          {error}
        </p>
      )}

      <form className="period-form" onSubmit={handleFormSubmit}>
        <label>
          Period name
          <input
            className="tag-input"
            required
            maxLength={200}
            value={name}
            onChange={event => setName(event.target.value)}
            onBlur={event => void handleFieldBlur('name', event.target.value)}
          />
        </label>
        <label>
          Start date
          <DateInput
            required
            value={startDate}
            onChange={value => {
              setStartDate(value)
              if (!isNew && value) void onSavePeriodFields({ startDate: value })
            }}
            onBlur={() => void handleFieldBlur('startDate', startDate)}
          />
        </label>
        <label>
          End date
          <DateInput
            required
            value={endDate}
            onChange={value => {
              setEndDate(value)
              if (!isNew && value) void onSavePeriodFields({ endDate: value })
            }}
            onBlur={() => void handleFieldBlur('endDate', endDate)}
          />
        </label>
        {isNew && (
          <div className="period-form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !name.trim() || !startDate || !endDate}
            >
              {busy ? 'Creating…' : 'Create period'}
            </button>
          </div>
        )}
      </form>

      {!isNew &&
        period &&
        (imageView === 'grid' ? (
          periodContents.length === 0 ? (
            <p className="state">No images in this period yet. Add images to get started.</p>
          ) : (
            <>
              <SelectionToolbar
                total={periodContents.length}
                selectedCount={selectedImageIds.length}
                allSelected={allImagesSelected}
                onToggleAll={toggleAllSelection}
                onActions={(x, y) => setImageActionsMenu({ x, y })}
                actionsAriaLabel="Actions for selected period images"
              />
              <section
                className="content-grid period-image-grid"
                aria-label={`Images in ${period.name}`}
              >
                {periodContents.map(item => (
                  <article className="content-card" key={item.id}>
                    <div
                      className="content-selection-preview"
                      onContextMenu={event => openCardContextMenu(event, item.id)}
                    >
                      <button
                        className="content-preview-wrap"
                        type="button"
                        onClick={() => openSingle(item)}
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
                        {period.titleImageId === item.id && (
                          <span className="period-title-badge">Title</span>
                        )}
                      </button>
                      <label className="content-selection-control">
                        <input
                          type="checkbox"
                          checked={selectedImageIds.includes(item.id)}
                          onChange={event =>
                            toggleImageSelection(
                              item.id,
                              (event.nativeEvent as globalThis.MouseEvent).shiftKey
                            )
                          }
                          aria-label={`Select image ${item.id.slice(0, 8)}`}
                        />
                      </label>
                    </div>
                    <div className="content-details">
                      <div className="card-tags">
                        {item.tags.map(tag => (
                          <span className="tag" key={`manual-${tag}`}>
                            {tag}
                          </span>
                        ))}
                        {item.autoTags.map(tag => (
                          <span className="tag tag-auto" key={`auto-${tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )
        ) : currentContent ? (
          <SingleContentView
            content={currentContent}
            currentIndex={periodContents.findIndex(item => item.id === currentContent.id)}
            totalCount={periodContents.length}
            allTags={allTags}
            autoTagNames={autoTagNames}
            descriptionDraft={descriptionDraft ?? currentContent.description}
            onDescriptionChange={setDescriptionDraft}
            onSaveMetadata={onSaveMetadata}
            tagShortcuts={tagShortcuts}
            onShortcutChange={onShortcutChange}
            onApplyShortcut={(id, tag) => {
              void onChangeTag(id, tag)
            }}
            onAddTag={onChangeTag}
            onRemoveTag={(id, tag) => {
              void onChangeTag(id, tag, true)
            }}
            className="single-content period-single-content"
          />
        ) : (
          <p className="state">No content in this period.</p>
        ))}

      {cardContextMenu && (
        <ContextMenu
          x={cardContextMenu.x}
          y={cardContextMenu.y}
          className="period-context-menu"
          width={180}
          height={90}
          onClose={() => setCardContextMenu(null)}
          ariaLabel="Image actions"
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy || cardContextMenu.id === period?.titleImageId}
            onClick={() => {
              const id = cardContextMenu.id
              setCardContextMenu(null)
              void onSetTitleImage(id)
            }}
          >
            Make title
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              const id = cardContextMenu.id
              setCardContextMenu(null)
              void onRemoveContent(id)
            }}
          >
            Remove
          </button>
        </ContextMenu>
      )}

      {imageActionsMenu && (
        <ContextMenu
          x={imageActionsMenu.x}
          y={imageActionsMenu.y}
          className="period-context-menu"
          width={180}
          height={60}
          onClose={() => setImageActionsMenu(null)}
          ariaLabel="Selected images actions"
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setImageActionsMenu(null)
              void onRemoveSelectedContents(selectedImageIds)
            }}
          >
            Remove
          </button>
        </ContextMenu>
      )}
    </section>
  )
}
