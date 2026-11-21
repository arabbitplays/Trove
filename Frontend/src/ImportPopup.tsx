import { useEffect, useState, type FormEvent } from 'react'

const supportedExtensions = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.heic',
])

type ImportPopupProps = {
  files: File[]
  tags: string[]
  importing: boolean
  onCheckDuplicates: (files: File[]) => Promise<number>
  onCancel: () => void
  onImport: (files: File[], tags: string[], duplicatePolicy: 'skip' | 'rename') => Promise<void>
}

export default function ImportPopup({ files, tags, importing, onCheckDuplicates, onCancel, onImport }: ImportPopupProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [tagError, setTagError] = useState('')
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'rename'>('skip')
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null)
  const [duplicateCheckError, setDuplicateCheckError] = useState(false)
  const importableFiles = files.filter(file => supportedExtensions.has(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()))
  const availableTags = tags

  useEffect(() => {
    let active = true
    setDuplicateCount(null)
    setDuplicateCheckError(false)
    void onCheckDuplicates(importableFiles).then(count => {
      if (active) setDuplicateCount(count)
    }).catch(() => {
      if (active) setDuplicateCheckError(true)
    })
    return () => { active = false }
  }, [files, onCheckDuplicates])

  function toggleTag(tag: string) {
    setSelectedTags(current => current.includes(tag)
      ? current.filter(item => item !== tag)
      : [...current, tag])
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tag = tagDraft.trim().toLowerCase()
    if (!tag || tag.length > 50 || tag.includes('/')) {
      setTagError('Use 1–50 characters and no slash.')
      return
    }
    if ([...availableTags, ...selectedTags].some(item => item.toLowerCase() === tag)) {
      setTagError('This tag already exists or is selected.')
      return
    }
    setSelectedTags(current => [...current, tag])
    setTagDraft('')
    setTagError('')
  }

  return <div className="popup-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget && !importing) onCancel()
  }}>
    <section className="import-popup" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header className="popup-header">
        <div>
          <h2 id="import-title">Import images</h2>
          <p>{importableFiles.length} supported image{importableFiles.length === 1 ? '' : 's'} selected</p>
        </div>
        <button className="text-button" type="button" onClick={onCancel} disabled={importing}>Close</button>
      </header>

      {files.length > importableFiles.length && <p className="popup-hint">
        {files.length - importableFiles.length} unsupported file{files.length - importableFiles.length === 1 ? ' will' : 's will'} be skipped.
      </p>}
      <p className="popup-hint">Choose how to handle duplicate files before importing.</p>

      <section className="popup-tag-section">
        <h3>Duplicate files</h3>
        {duplicateCount === null && !duplicateCheckError && <p className="popup-hint">Checking for duplicates…</p>}
        {duplicateCheckError && <p className="tag-error" role="alert">
          Could not check for duplicates. <button className="text-button" type="button" onClick={() => {
            setDuplicateCheckError(false)
            setDuplicateCount(null)
            void onCheckDuplicates(importableFiles).then(setDuplicateCount).catch(() => setDuplicateCheckError(true))
          }}>Try again</button>
        </p>}
        {duplicateCount !== null && <>
          <p className="popup-hint">{duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} found.</p>
          <label className="popup-tag-option">
            <input type="radio" name="duplicate-policy" checked={duplicatePolicy === 'skip'} onChange={() => setDuplicatePolicy('skip')} />
            <span>Skip duplicates</span>
          </label>
          <label className="popup-tag-option">
            <input type="radio" name="duplicate-policy" checked={duplicatePolicy === 'rename'} onChange={() => setDuplicatePolicy('rename')} />
            <span>Rename duplicates with a number and tag them Duplicate</span>
          </label>
        </>}
      </section>

      <section className="popup-tag-section">
        <h3>Tags for all imported images</h3>
        {availableTags.length > 0 ? <div className="popup-tag-list">
          {availableTags.map(tag => <label className="popup-tag-option" key={tag}>
            <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
            <span>{tag}</span>
          </label>)}
        </div> : <p className="popup-hint">No existing tags.</p>}
      </section>

      <form className="popup-create-tag" onSubmit={addTag}>
        <label htmlFor="new-import-tag">Create a tag</label>
        <div>
          <input
            id="new-import-tag"
            value={tagDraft}
            onChange={event => { setTagDraft(event.target.value); setTagError('') }}
            maxLength={50}
            placeholder="Tag name"
            disabled={importing}
          />
          <button className="button" type="submit" disabled={importing || !tagDraft.trim()}>Add tag</button>
        </div>
        {tagError && <p className="tag-error" role="alert">{tagError}</p>}
      </form>

      <footer className="popup-actions">
        <button className="button" type="button" onClick={onCancel} disabled={importing}>Cancel</button>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void onImport(importableFiles, selectedTags, duplicatePolicy)}
          disabled={importing || importableFiles.length === 0 || duplicateCount === null || duplicateCheckError}
        >{importing ? 'Importing…' : `Import ${importableFiles.length} image${importableFiles.length === 1 ? '' : 's'}`}</button>
      </footer>
    </section>
  </div>
}
