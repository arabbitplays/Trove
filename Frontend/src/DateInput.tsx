import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  required?: boolean
}

function toDisplayDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : ''
}

function toIsoDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

export default function DateInput({ id, value, onChange, onBlur, required = false }: Props) {
  const [draft, setDraft] = useState(toDisplayDate(value))

  useEffect(() => setDraft(toDisplayDate(value)), [value])

  function changeDraft(next: string) {
    setDraft(next)
    if (!next) onChange('')
    else {
      const iso = toIsoDate(next)
      if (iso) onChange(iso)
    }
  }

  function commitDraft() {
    if (draft && !toIsoDate(draft)) setDraft(toDisplayDate(value))
    onBlur?.()
  }

  return <span className="date-input-control">
    <input
      id={id}
      className="date-input-display"
      type="text"
      inputMode="numeric"
      placeholder="DD.MM.YYYY"
      autoComplete="off"
      required={required}
      value={draft}
      onChange={event => changeDraft(event.target.value)}
      onBlur={commitDraft}
      aria-label={id ? undefined : 'Date (DD.MM.YYYY)'}
    />
    <span className="date-input-picker" aria-hidden="true"><CalendarDays size={16} /></span>
    <input
      className="date-input-native"
      type="date"
      lang="de-DE"
      value={value}
      onChange={event => {
        const next = event.target.value
        setDraft(toDisplayDate(next))
        onChange(next)
      }}
      onBlur={onBlur}
      aria-label="Open calendar date picker"
      tabIndex={0}
    />
  </span>
}
