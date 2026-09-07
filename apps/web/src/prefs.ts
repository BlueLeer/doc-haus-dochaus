// Per-browser UI preferences (Settings → Approvals / Appearance / Matter
// defaults). localStorage, not engine config, because these shape how THIS
// browser presents and gates the engine — the engine has no notion of them.
// Drafting preferences are different: they steer the model, so they live on the
// engine as an instructions file (see api/ingest.ts getPreferences).
export type Locale = "zh-CN" | "en"

export type Prefs = {
  locale: Locale
  textSize: "compact" | "standard" | "large"
  // Auto-approve the engine's permission asks for redline/tracked-change
  // proposals. Safe to automate: the tools only record pending tracked changes
  // the lawyer still accepts or rejects in the document viewer.
  autoApproveRedlines: boolean
  // Auto-approve creating new documents and templates (never edits to existing
  // ones — those keep asking).
  autoApproveDrafting: boolean
  // Jurisdiction codes prefilled on the new-matter form.
  defaultJurisdictions: string[]
}

export const DEFAULT_PREFS: Prefs = {
  locale: "en",
  textSize: "standard",
  autoApproveRedlines: false,
  autoApproveDrafting: false,
  defaultJurisdictions: [],
}

const KEY = "dochaus.prefs"

export function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>
    return {
      ...DEFAULT_PREFS,
      locale: saved.locale ?? (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"),
      ...saved,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  applyAppearance(next)
  return next
}

export function availableDefaultJurisdictions(available: string[]) {
  const selected = loadPrefs().defaultJurisdictions.filter((code) => available.includes(code))
  return selected.length ? selected : available.slice(0, 1)
}

// Reflect text size onto <html> as the data attribute the stylesheet keys off
// ([data-text] scales the UI).
export function applyAppearance(prefs: Prefs = loadPrefs()) {
  document.documentElement.dataset.text = prefs.textSize
  document.documentElement.lang = prefs.locale
}

// Which permission asks each auto-approve toggle covers. word-integration
// (direct document edits) is deliberately absent — it always asks.
const REDLINE_PERMISSIONS = new Set(["tracked-changes", "redline"])
const DRAFT_PERMISSIONS = new Set(["draft-document", "create-template"])

export function autoApproved(permission: string): boolean {
  const prefs = loadPrefs()
  if (REDLINE_PERMISSIONS.has(permission)) return prefs.autoApproveRedlines
  if (DRAFT_PERMISSIONS.has(permission)) return prefs.autoApproveDrafting
  return false
}
