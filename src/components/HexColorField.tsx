import { useState, type KeyboardEvent } from 'react'

import { normalizeHexColor } from './hexColor'

interface HexColorFieldProps {
  value: string
  ariaLabel: string
  disabled?: boolean
  className?: string
  onChange: (color: string) => void
}

export function HexColorField({
  value,
  ariaLabel,
  disabled = false,
  className,
  onChange,
}: HexColorFieldProps) {
  const normalizedValue = normalizeHexColor(value) ?? '#000000'
  const [draft, setDraft] = useState(normalizedValue.toUpperCase())
  const [draftSource, setDraftSource] = useState(normalizedValue)

  if (draftSource !== normalizedValue) {
    setDraftSource(normalizedValue)
    setDraft(normalizedValue.toUpperCase())
  }

  const commitDraft = () => {
    const normalized = normalizeHexColor(draft)
    if (!normalized) {
      setDraft(normalizedValue.toUpperCase())
      return
    }

    setDraft(normalized.toUpperCase())
    if (normalized !== normalizedValue) {
      onChange(normalized)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.currentTarget.blur()
  }

  return (
    <span
      className={
        'hex-color-field' +
        (className ? ' ' + className : '') +
        (disabled ? ' is-disabled' : '')
      }
    >
      <input
        className={'hex-color-swatch'}
        type={'color'}
        aria-label={ariaLabel}
        value={normalizedValue}
        disabled={disabled}
        onChange={(event) => {
          const color = event.currentTarget.value
          setDraft(color.toUpperCase())
          onChange(color)
        }}
      />
      <input
        className={'hex-color-input'}
        type={'text'}
        aria-label={ariaLabel + '颜色值'}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        maxLength={7}
        inputMode={'text'}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
      />
    </span>
  )
}
