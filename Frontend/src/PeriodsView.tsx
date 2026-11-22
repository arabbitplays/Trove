import { useEffect, useState, type FormEvent, type MouseEvent, type RefObject } from 'react'
import ImageSelection, { type SelectableContent } from './ImageSelection'
import ContentMetadataEditor from './ContentMetadataEditor'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

type PeriodRecord = {
  id: string
  name: string
  startDate: string
  endDate: string
  titleImageHash: string | null
  contentHashes: string[]
}
type ContentItem = SelectableContent
type Selection = { mode: 'some'; hashes: string[] } | { mode: 'all'; excludedHashes: string[] }
type ContextMenu = { hash: string; x: number; y: number }

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

function parseDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const isoDate = `${year}-${month}-${day}`
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === isoDate ? isoDate : null
}

type Props = {
  contents: ContentItem[]
  totalContents: number
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  availableTags: string[]
  allTags: string[]
  autoTagNames: string[]
  endRef: RefObject<HTMLDivElement>
  loadNextBatch: () => Promise<ContentItem[]>
  onTagsChanged: () => Promise<void>
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
}

export default function PeriodsView({ contents, totalContents, selectedTags, onToggleTag, onClearTags, availableTags, allTags, autoTagNames, endRef, loadNextBatch, onTagsChanged, tagShortcuts, onShortcutChange }: Props) {
  const [periods, setPeriods] = useState<PeriodRecord[]>([])
  const [editing, setEditing] = useState<PeriodRecord | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [titleImageHash, setTitleImageHash] = useState('')
  const [periodContents, setPeriodContents] = useState<ContentItem[]>([])
  const [imageView, setImageView] = useState<'grid' | 'single'>('grid')
  const [currentContentHash, setCurrentContentHash] = useState('')
  const [addPopupOpen, setAddPopupOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({ mode: 'some', hashes: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadPeriods() {
    const response = await fetch(`${API}/api/periods`)
    if (!response.ok) throw new Error('Could not load periods.')
    setPeriods(await response.json() as PeriodRecord[])
  }

  async function loadPeriodContents(id: string) {
    const response = await fetch(`${API}/api/periods/${id}/contents`)
    if (!response.ok) throw new Error('Could not load images in this period.')
    setPeriodContents(await response.json() as ContentItem[])
  }

  useEffect(() => {
    void loadPeriods().catch(() => setError('Could not load periods.'))
  }, [])

  useEffect(() => {
    setSelection({ mode: 'some', hashes: [] })
  }, [selectedTags])

  const selectedCount = selection.mode === 'all'
    ? Math.max(0, totalContents - selection.excludedHashes.length)
    : selection.hashes.length
  const allSelected = selection.mode === 'all' && selection.excludedHashes.length === 0

  useEffect(() => {
    if ((!editing && !isNew) || !addPopupOpen || contents.length >= totalContents || !endRef.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadNextBatch()
    }, { rootMargin: '600px' })
    observer.observe(endRef.current)
    return () => observer.disconnect()
  }, [editing, isNew, addPopupOpen, contents.length, totalContents, endRef, loadNextBatch])

  function beginCreate() {
    const today = new Date().toISOString().slice(0, 10)
    setEditing(null)
    setPeriodContents([])
    setIsNew(true)
    setName('')
    setStartDate(formatDate(today))
    setEndDate(formatDate(today))
    setTitleImageHash('')
    setError('')
  }

  function beginEdit(period: PeriodRecord) {
    setEditing(period)
    setIsNew(false)
    setName(period.name)
    setStartDate(formatDate(period.startDate))
    setEndDate(formatDate(period.endDate))
    setTitleImageHash(period.titleImageHash ?? '')
    setSelection({ mode: 'some', hashes: [] })
    setError('')
    setImageView('grid')
    setCurrentContentHash('')
    setAddPopupOpen(false)
    void loadPeriodContents(period.id).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not load period images.'))
  }

  function openSingle(item: ContentItem) {
    setCurrentContentHash(item.hash)
    setDescriptionDraft(item.description)
    setImageView('single')
  }

  function movePeriodSelection(direction: -1 | 1) {
    const index = periodContents.findIndex(item => item.hash === currentContentHash)
    const next = periodContents[index + direction]
    if (next) openSingle(next)
  }

  useEffect(() => {
    if (imageView !== 'single') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); movePeriodSelection(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); movePeriodSelection(1) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imageView, currentContentHash, periodContents])

  function openContextMenu(event: MouseEvent, hash: string) {
    event.preventDefault()
    setContextMenu({
      hash,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 110),
    })
  }

  async function savePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const startDateIso = parseDate(startDate)
    const endDateIso = parseDate(endDate)
    if (!startDateIso || !endDateIso) {
      setError('Enter dates in DD.MM.YYYY format, for example 08.04.2025.')
      return
    }
    if (endDateIso < startDateIso) {
      setError('The end date must be on or after the start date.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (isNew) {
        const response = await fetch(`${API}/api/periods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, startDate: startDateIso, endDate: endDateIso }),
        })
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not create period.')
        const created = await response.json() as PeriodRecord
        await loadPeriods()
        beginEdit(created)
      } else if (editing) {
        const response = await fetch(`${API}/api/periods/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, startDate: startDateIso, endDate: endDateIso, titleImageHash: titleImageHash || null }),
        })
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not save period.')
        await loadPeriods()
        setEditing(current => current ? { ...current, name, startDate: startDateIso, endDate: endDateIso, titleImageHash: titleImageHash || null } : current)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save period.')
    } finally {
      setBusy(false)
    }
  }

  function toggleContent(hash: string) {
    setSelection(current => {
      if (current.mode === 'all') {
        const excluded = new Set(current.excludedHashes)
        if (excluded.has(hash)) excluded.delete(hash)
        else excluded.add(hash)
        return { mode: 'all', excludedHashes: [...excluded] }
      }
      const hashes = new Set(current.hashes)
      if (hashes.has(hash)) hashes.delete(hash)
      else hashes.add(hash)
      return { mode: 'some', hashes: [...hashes] }
    })
  }

  function toggleAll() {
    setSelection(current => current.mode === 'all' && current.excludedHashes.length === 0
      ? { mode: 'some', hashes: [] }
      : { mode: 'all', excludedHashes: [] })
  }

  async function addSelectedToPeriod() {
    if (!editing || selectedCount === 0) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection.mode === 'all'
          ? { allMatching: true, tags: selectedTags, excludedHashes: selection.excludedHashes }
          : { allMatching: false, hashes: selection.hashes }),
      })
      if (!response.ok) throw new Error('Could not add selected content to the period.')
      const updated = await fetch(`${API}/api/periods/${editing.id}`)
      if (!updated.ok) throw new Error('Content was added, but the period could not be refreshed.')
      const next = await updated.json() as PeriodRecord
      setEditing(next)
      setTitleImageHash(next.titleImageHash ?? '')
      await loadPeriodContents(editing.id)
      setSelection({ mode: 'some', hashes: [] })
      setAddPopupOpen(false)
      await loadPeriods()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add selected content.')
    } finally {
      setBusy(false)
    }
  }

  async function removeContent(hash: string) {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}/contents/${encodeURIComponent(hash)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove content from the period.')
      const contentHashes = editing.contentHashes.filter(item => item !== hash)
      setEditing({ ...editing, contentHashes, titleImageHash: editing.titleImageHash === hash ? null : editing.titleImageHash })
      setPeriodContents(current => current.filter(item => item.hash !== hash))
      if (titleImageHash === hash) setTitleImageHash('')
      if (currentContentHash === hash) setImageView('grid')
      await loadPeriods()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove content.')
    } finally {
      setBusy(false)
    }
  }

  async function setTitleImage(hash: string) {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, startDate: editing.startDate, endDate: editing.endDate, titleImageHash: hash }),
      })
      if (!response.ok) throw new Error('Could not set the title image.')
      setTitleImageHash(hash)
      setEditing({ ...editing, titleImageHash: hash })
      setContextMenu(null)
      await loadPeriods()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set the title image.')
    } finally {
      setBusy(false)
    }
  }

  async function saveMetadata(hash: string, description: string, takenAt: string | null): Promise<boolean> {
    const item = periodContents.find(content => content.hash === hash)
    if (!item || (item.description === description && item.takenAt === takenAt)) return true
    const response = await fetch(`${API}/api/contents/${hash}/metadata`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, takenAt }),
    })
    if (!response.ok) {
      setError('Could not save the content metadata.')
      return false
    }
    setPeriodContents(current => current.map(content => content.hash === hash ? { ...content, description, takenAt } : content))
    setDescriptionDraft(null)
    return true
  }

  async function changeTag(hash: string, tagValue: string, remove = false): Promise<boolean> {
    const tag = tagValue.trim()
    if (!tag) return false
    if (!remove && autoTagNames.includes(tag.toLowerCase())) return false
    const response = await fetch(`${API}/api/tags/${encodeURIComponent(tag)}`, {
      method: remove ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([hash]),
    })
    if (!response.ok) {
      setError('Could not update this tag.')
      return false
    }
    await loadPeriodContents(editing!.id)
    await onTagsChanged()
    return true
  }

  const tagPicker = <nav className="tag-picker" aria-label="Filter period content by tags">
    <div className="tag-picker-row" aria-label="Selected tags">
      {selectedTags.length === 0
        ? <span className="filter active" aria-current="true">All</span>
        : selectedTags.map(tag => <button key={tag} className="filter active" type="button" onClick={() => onToggleTag(tag)} aria-label={`Remove ${tag} filter`}>{tag}<span aria-hidden="true"> ×</span></button>)}
      {selectedTags.length > 0 && <button className="text-button" type="button" onClick={onClearTags}>Clear filters</button>}
    </div>
    <div className="tag-picker-row" aria-label="Tags with matching content">
      {availableTags.filter(tag => !selectedTags.includes(tag)).map(tag => <button key={tag} className="filter" type="button" onClick={() => onToggleTag(tag)}>{tag}</button>)}
      {availableTags.filter(tag => !selectedTags.includes(tag)).length === 0 && <span className="tag-picker-empty">No more matching tags</span>}
    </div>
  </nav>

  if (!editing && !isNew) return <section className="periods-view">
    <div className="periods-heading">
      <div><h1>Periods</h1></div>
      <button className="button button-primary" type="button" onClick={beginCreate}>New period</button>
    </div>
    {error && <p className="period-error" role="alert">{error}</p>}
    {periods.length === 0 ? <p className="state">No periods yet. Create one to get started.</p> : <div className="period-grid">
      {periods.map(period => {
        const cover = period.titleImageHash ?? period.contentHashes[0]
        return <button className="period-card" key={period.id} type="button" onClick={() => beginEdit(period)}>
          {cover
            ? <img src={`${API}/api/contents/${cover}/thumbnail`} alt="" loading="lazy" />
            : <span className="period-cover-empty">No title image</span>}
          <span className="period-card-info"><strong>{period.name}</strong><span>{formatDate(period.startDate)} – {formatDate(period.endDate)}</span><span>{period.contentHashes.length} images</span></span>
        </button>
      })}
    </div>}
  </section>

  const currentContent = periodContents.find(item => item.hash === currentContentHash)
  return <section className="periods-view">
    <div className="periods-heading period-detail-heading">
      <div><button className="text-button" type="button" onClick={() => { setEditing(null); setIsNew(false); setAddPopupOpen(false); setError('') }}>← All periods</button><h1>{isNew ? 'New period' : editing?.name}</h1>
        {!isNew && editing && <span className="period-detail-dates">{formatDate(editing.startDate)} – {formatDate(editing.endDate)}</span>}
      </div>
      {!isNew && <div className="period-view-actions">
        <button className="button button-primary" type="button" onClick={() => { setSelection({ mode: 'some', hashes: [] }); setAddPopupOpen(true) }}>Add images</button>
        <div className="view-toggle" role="group" aria-label="Period image view">
          <button className={`button ${imageView === 'grid' ? 'button-primary' : ''}`} type="button" onClick={() => setImageView('grid')} aria-pressed={imageView === 'grid'}>Grid</button>
          <button className={`button ${imageView === 'single' ? 'button-primary' : ''}`} type="button" onClick={() => { if (periodContents.length) openSingle(currentContent ?? periodContents[0]) }} disabled={!periodContents.length} aria-pressed={imageView === 'single'}>Single</button>
        </div>
      </div>}
    </div>
    {error && <p className="period-error" role="alert">{error}</p>}
    <form className="period-form" onSubmit={event => event.preventDefault()}>
      <label>Period name<input className="tag-input" required maxLength={200} value={name} onChange={event => setName(event.target.value)} onBlur={event => { setName(event.target.value); void savePeriod(new Event('submit') as unknown as FormEvent<HTMLFormElement>) }} /></label>
      <label>Start date<input type="text" required inputMode="numeric" pattern="\d{2}\.\d{2}\.\d{4}" value={startDate} onChange={event => setStartDate(event.target.value)} onBlur={() => void savePeriod(new Event('submit') as unknown as FormEvent<HTMLFormElement>)} /></label>
      <label>End date<input type="text" required inputMode="numeric" pattern="\d{2}\.\d{2}\.\d{4}" value={endDate} onChange={event => setEndDate(event.target.value)} onBlur={() => void savePeriod(new Event('submit') as unknown as FormEvent<HTMLFormElement>)} /></label>
    </form>
    {!isNew && editing && (imageView === 'grid'
      ? periodContents.length === 0 ? <p className="state">No images in this period yet. Add images to get started.</p> : <section className="content-grid period-image-grid" aria-label={`Images in ${editing.name}`}>
        {periodContents.map(item => <article className="content-card" key={item.hash}>
          <button className="content-preview-wrap" type="button" onClick={() => openSingle(item)} onContextMenu={event => openContextMenu(event, item.hash)} aria-label={`Open content ${item.hash.slice(0, 8)}; right-click for period image actions`}>
            <img className="content-preview" src={`${API}/api/contents/${item.hash}/thumbnail`} alt="Content" loading="lazy" />
            {item.mediaType.startsWith('video/') && <span className="video-indicator" aria-label="Video">▶</span>}
            {titleImageHash === item.hash && <span className="period-title-badge">Title</span>}
          </button>
          <div className="content-details">
            <div className="card-tags">{item.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}{item.autoTags.map(tag => <span className="tag tag-auto" key={tag}>{tag}</span>)}</div>
          </div>
        </article>)}
      </section>
      : currentContent ? <section className="single-content period-single-content" aria-label="Period content single view">
        <header className="single-content-heading"><div className="single-content-title"><span>{periodContents.findIndex(item => item.hash === currentContent.hash) + 1} of {periodContents.length}</span></div></header>
        <div className="single-content-frame">
          {currentContent.mediaType.startsWith('video/')
            ? <video className="full-content" src={`${API}/api/contents/${currentContent.hash}/content`} controls preload="metadata" />
            : <img className="full-content" src={`${API}/api/contents/${currentContent.hash}/content`} alt="Selected content" />}
        </div>
        <ContentMetadataEditor
          content={currentContent}
          allTags={allTags}
          autoTagNames={autoTagNames}
          description={descriptionDraft ?? currentContent.description}
          onDescriptionChange={setDescriptionDraft}
          onSaveMetadata={saveMetadata}
          tagShortcuts={tagShortcuts}
          onShortcutChange={onShortcutChange}
          onApplyShortcut={(hash, tag) => { void changeTag(hash, tag) }}
          onAddTag={changeTag}
          onRemoveTag={(hash, tag) => { void changeTag(hash, tag, true) }}
        />
      </section> : <p className="state">No content in this period.</p>)}

    {addPopupOpen && editing && <div className="popup-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAddPopupOpen(false) }}>
      <section className="import-popup period-picker-popup" role="dialog" aria-modal="true" aria-labelledby="period-picker-title">
        <header className="popup-header"><div><h2 id="period-picker-title">Add images to {editing.name}</h2><p>Filter by tags and select images to add.</p></div><button className="button" type="button" onClick={() => setAddPopupOpen(false)} aria-label="Close image picker">Close</button></header>
        {tagPicker}
        <ImageSelection
          items={contents}
          total={totalContents}
          selectedCount={selectedCount}
          allSelected={allSelected}
          isSelected={hash => selection.mode === 'all' ? !selection.excludedHashes.includes(hash) : selection.hashes.includes(hash)}
          onToggleAll={toggleAll}
          onToggle={toggleContent}
          onOpen={item => toggleContent(item.hash)}
          renderDetails={item => <div className="content-details">{[...item.tags, ...item.autoTags].map(tag => <span key={tag} className={`tag ${item.autoTags.includes(tag) ? 'tag-auto' : ''}`}>{tag}</span>)}</div>}
          endRef={endRef}
        />
        <div className="period-add-actions"><span>{selectedCount.toLocaleString()} selected</span><button className="button button-primary" type="button" onClick={() => void addSelectedToPeriod()} disabled={busy || selectedCount === 0}>{busy ? 'Adding…' : 'Add selected to period'}</button></div>
      </section>
    </div>}
    {contextMenu && <div className="period-context-backdrop" onClick={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu(null) }}>
      <div className="period-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()}>
        <button type="button" role="menuitem" disabled={busy} onClick={() => void setTitleImage(contextMenu.hash)}>Make Title Image</button>
        <button type="button" role="menuitem" disabled={busy} onClick={() => { const hash = contextMenu.hash; setContextMenu(null); void removeContent(hash) }}>Remove</button>
      </div>
    </div>}
  </section>
}
