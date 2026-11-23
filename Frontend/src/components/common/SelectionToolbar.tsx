import { useEffect, useRef } from 'react'

type SelectionToolbarProps = {
  total: number
  selectedCount: number
  allSelected: boolean
  onToggleAll: () => void
  onActions?: (x: number, y: number) => void
  actionsAriaLabel?: string
}

export default function SelectionToolbar({
  total,
  selectedCount,
  allSelected,
  onToggleAll,
  onActions,
  actionsAriaLabel = 'Actions for selected images',
}: SelectionToolbarProps) {
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected
    }
  }, [allSelected, selectedCount])

  return (
    <div className="selection-toolbar">
      <label className="selection-all-control">
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          disabled={total === 0}
        />
        <span>Select all</span>
      </label>
      <span className="selection-count" aria-live="polite">
        {selectedCount.toLocaleString()} selected
      </span>
      {onActions && (
        <button
          className="button selection-actions-trigger"
          type="button"
          aria-label={actionsAriaLabel}
          disabled={!selectedCount}
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            onActions(rect.right - 190, rect.bottom)
          }}
        >
          •••
        </button>
      )}
    </div>
  )
}
