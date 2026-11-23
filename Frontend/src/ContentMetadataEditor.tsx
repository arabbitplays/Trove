import { useEffect, useState, type FormEvent } from 'react'
import DateInput from './DateInput'

export type EditableContent = {
  id: string
  addedAt: string
  takenAt: string | null
  tags: string[]
  autoTags: string[]
  description: string
}

type Props = {
  content: EditableContent
  allTags: string[]
  autoTagNames: string[]
  description: string
  onDescriptionChange: (value: string) => void
  onSaveMetadata: (id: string, description: string, takenAt: string | null) => Promise<boolean>
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
  onApplyShortcut: (id: string, tag: string) => void
  onAddTag: (id: string, tag: string) => Promise<boolean>
  onRemoveTag: (id: string, tag: string) => void
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

export default function ContentMetadataEditor({
  content,
  allTags,
  autoTagNames,
  description,
  onDescriptionChange,
  onSaveMetadata,
  tagShortcuts,
  onShortcutChange,
  onApplyShortcut,
  onAddTag,
  onRemoveTag,
}: Props) {
  const [tagDraft, setTagDraft] = useState('')
  const [takenAtDraft, setTakenAtDraft] = useState(content.takenAt?.slice(0, 10) ?? '')
  const [dateError, setDateError] = useState('')

  useEffect(() => setTagDraft(''), [content.id])
  useEffect(() => {
    setTakenAtDraft(content.takenAt?.slice(0, 10) ?? '')
  }, [content.id, content.takenAt])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return
      }
      const digit = /^[1-9]$/.test(event.key) ? event.key : /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
      if (!digit) return
      const tag = tagShortcuts[digit]
      if (tag) {
        event.preventDefault()
        event.stopPropagation()
        onApplyShortcut(content.id, tag)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [content.id, tagShortcuts, onApplyShortcut])

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tag = tagDraft.trim()
    if (tag && !autoTagNames.includes(tag.toLowerCase()) && await onAddTag(content.id, tag)) setTagDraft('')
  }

  return <>
    <section className="single-content-tools" aria-label="Content description and shortcuts">
      <div className="description-editor">
        <label htmlFor="content-description">Description</label>
        <textarea
          id="content-description"
          rows={4}
          maxLength={5000}
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          onBlur={event => { void onSaveMetadata(content.id, event.currentTarget.value, content.takenAt) }}
        />
      </div>
      <section className="tag-shortcut-section" aria-label="Number key tag shortcuts">
        <h2>Quick tag shortcuts</h2>
        <div className="tag-shortcuts">
          {Array.from({ length: 9 }, (_, index) => String(index + 1)).map(number => <label className="tag-shortcut" key={number}>
            <kbd>{number}</kbd>
            <select
              aria-label={`Tag for number ${number}`}
              value={tagShortcuts[number] ?? ''}
              onChange={event => {
                onShortcutChange(number, event.target.value)
                event.currentTarget.blur()
              }}
            >
              <option value="">No tag</option>
              {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>)}
        </div>
      </section>
    </section>
    <div className="content-capture-date">
      <label htmlFor="content-capture-date">Capture date</label>
      <div className="content-capture-date-controls"><DateInput id="content-capture-date" value={takenAtDraft} onChange={value => { setTakenAtDraft(value); setDateError(''); void onSaveMetadata(content.id, description, value || null) }} /><button type="button" className="button" aria-label="Clear capture date" title="Clear capture date" disabled={!takenAtDraft} onClick={() => { setTakenAtDraft(''); setDateError(''); void onSaveMetadata(content.id, description, null) }}>×</button></div>
      {dateError && <span className="content-date-error" role="alert">{dateError}</span>}
    </div>
    <div className="single-content-tags">
      {content.tags.map(tag => <button key={tag} className="tag" type="button" onClick={() => onRemoveTag(content.id, tag)} title={`Remove ${tag}`}>
        {tag}<span aria-hidden="true"> ×</span>
      </button>)}
      {content.autoTags.map(tag => <span key={tag} className="tag tag-auto" title="Assigned automatically">{tag}</span>)}
      <form onSubmit={event => void addTag(event)}>
        <input className="tag-input" list="content-existing-tags" aria-label="Add tag to content" placeholder="Add tag" value={tagDraft} onChange={event => setTagDraft(event.target.value)} />
        <datalist id="content-existing-tags">{allTags.map(tag => <option key={tag} value={tag} />)}</datalist>
      </form>
    </div>
  </>
}
