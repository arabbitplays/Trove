type TagPickerProps = {
  selectedTags: string[]
  availableTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  ariaLabel?: string
}

export default function TagPicker({
  selectedTags,
  availableTags,
  onToggleTag,
  onClearTags,
  ariaLabel = 'Filter by tags',
}: TagPickerProps) {
  const unselectedAvailable = availableTags.filter(tag => !selectedTags.includes(tag))

  return (
    <nav className="tag-picker" aria-label={ariaLabel}>
      <div className="tag-picker-row" aria-label="Selected tags">
        {selectedTags.length === 0 ? (
          <span className="filter active" aria-current="true">
            All
          </span>
        ) : (
          selectedTags.map(tag => (
            <button
              key={tag}
              className="filter active"
              type="button"
              onClick={() => onToggleTag(tag)}
              aria-label={`Remove ${tag} filter`}
            >
              {tag}
              <span aria-hidden="true"> ×</span>
            </button>
          ))
        )}
        {selectedTags.length > 0 && (
          <button className="text-button" type="button" onClick={onClearTags}>
            Clear filters
          </button>
        )}
      </div>
      <div className="tag-picker-row" aria-label="Tags with matching content">
        {unselectedAvailable.map(tag => (
          <button
            key={tag}
            className="filter"
            type="button"
            onClick={() => onToggleTag(tag)}
          >
            {tag}
          </button>
        ))}
        {unselectedAvailable.length === 0 && (
          <span className="tag-picker-empty">No more matching tags</span>
        )}
      </div>
    </nav>
  )
}
