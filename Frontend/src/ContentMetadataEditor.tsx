import { useEffect, useState, type FormEvent } from 'react'

export type EditableContent = {
  hash: string
  originalName: string
  tags: string[]
  description: string
}

type Props = {
  content: EditableContent
  allTags: string[]
  description: string
  onDescriptionChange: (value: string) => void
  onSaveDescription: (hash: string, value: string) => void
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
  onApplyShortcut: (hash: string, tag: string) => void
  onAddTag: (hash: string, tag: string) => Promise<boolean>
  onRemoveTag: (hash: string, tag: string) => void
}

export default function ContentMetadataEditor({
  content,
  allTags,
  description,
  onDescriptionChange,
  onSaveDescription,
  tagShortcuts,
  onShortcutChange,
  onApplyShortcut,
  onAddTag,
  onRemoveTag,
}: Props) {
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => setTagDraft(''), [content.hash])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement && event.target.id === 'content-description') return
      const digit = /^[1-9]$/.test(event.key) ? event.key : /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
      if (!digit) return
      const tag = tagShortcuts[digit]
      if (tag) {
        event.preventDefault()
        event.stopPropagation()
        onApplyShortcut(content.hash, tag)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [content.hash, tagShortcuts, onApplyShortcut])

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tag = tagDraft.trim()
    if (tag && await onAddTag(content.hash, tag)) setTagDraft('')
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
          onBlur={event => onSaveDescription(content.hash, event.currentTarget.value)}
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
        <p>Press a number key to add its tag to this content.</p>
      </section>
    </section>
    <div className="single-content-tags">
      {content.tags.map(tag => <button key={tag} className="tag" type="button" onClick={() => onRemoveTag(content.hash, tag)} title={`Remove ${tag}`}>
        {tag}<span aria-hidden="true"> ×</span>
      </button>)}
      <form onSubmit={event => void addTag(event)}>
        <input className="tag-input" list="content-existing-tags" aria-label={`Add tag to ${content.originalName}`} placeholder="Add tag" value={tagDraft} onChange={event => setTagDraft(event.target.value)} />
        <datalist id="content-existing-tags">{allTags.map(tag => <option key={tag} value={tag} />)}</datalist>
        <button className="button" type="submit" disabled={!tagDraft.trim()}>Add tag</button>
      </form>
    </div>
  </>
}
