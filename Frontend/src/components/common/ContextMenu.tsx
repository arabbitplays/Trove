import { useEffect, type ReactNode } from 'react'

type ContextMenuProps = {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
  className?: string
  width?: number
  height?: number
  ariaLabel?: string
}

export default function ContextMenu({
  x,
  y,
  onClose,
  children,
  className = 'actions-menu',
  width = 200,
  height = 220,
  ariaLabel = 'Context menu',
}: ContextMenuProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const left = Math.min(Math.max(10, x), window.innerWidth - width - 10)
  const top = Math.min(Math.max(10, y), window.innerHeight - height - 10)

  return (
    <div
      className="actions-menu-backdrop"
      onClick={onClose}
      onContextMenu={event => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className={className}
        role="menu"
        aria-label={ariaLabel}
        style={{ left, top }}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
