import { useEffect, useId, useRef, useState } from "react"

// Keep the trigger and options in the same design system, with keyboard access.
export default function CaseSelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Record<string, string>; onChange: (value: string) => void; disabled?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const entries = Object.entries(options)
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" })
  }, [open, active, id])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [open])
  function choose(key: string) { onChange(key); setOpen(false); trigger.current?.focus() }
  return <div className="case-select case-field" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
  }}>
    <span id={`${id}-label`} className="case-field-label">{label}</span>
    <button type="button" className="case-select-trigger" ref={trigger} role="combobox" disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
      onClick={() => { setActive(Math.max(0, entries.findIndex(([key]) => key === value))); setOpen(!open) }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { if (open) event.stopPropagation(); setOpen(false); return }
        if (event.key === "Tab") { setOpen(false); return }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault()
          if (!open) { setActive(Math.max(0, entries.findIndex(([key]) => key === value))); setOpen(true); return }
          setActive((index) => event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length)
        }
        if (open && ["Enter", " "].includes(event.key)) { event.preventDefault(); choose(entries[active][0]) }
      }}>
      <span id={`${id}-value`}>{options[value] ?? "请选择"}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && !disabled && <div id={`${id}-list`} className="case-select-menu" role="listbox" aria-labelledby={`${id}-label`}>
      {entries.map(([key, text], index) => <div key={key} id={`${id}-${index}`} role="option"
        aria-selected={value === key} className={active === index ? "is-active" : ""}
        onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(key)}>
        <span>{text}</span><span aria-hidden="true">{value === key ? "✓" : ""}</span>
      </div>)}
    </div>}
  </div>
}
