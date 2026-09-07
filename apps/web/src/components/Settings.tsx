import { useEffect, useState } from "react"
import {
  getPreferences,
  listJurisdictions,
  savePreferences,
  type DraftingPreferences,
  type Jurisdiction,
} from "../api/ingest"
import { availableDefaultJurisdictions, loadPrefs, savePrefs, type Locale, type Prefs } from "../prefs"
import { useI18n } from "../i18n"
import { useToast } from "./Toast"
import { Tooltip } from "./Tooltip"
import JurisdictionSelect from "./JurisdictionSelect"
import AiModelsSettings from "./AiModelsSettings"

// The settings modal: a left rail of tabs over one shared shell. The first tab
// is the merged AI model configuration (default + fast models, OpenAI-compatible
// providers, Vertex/Bedrock host setups); Drafting and Research persist standing
// instructions through the ingest service; Matter defaults, Approvals, and
// Appearance are per-browser preferences (see prefs.ts).
type Tab = "ai-models" | "drafting" | "research" | "matters" | "approvals" | "appearance"

const TABS: { id: Tab; label: string }[] = [
  { id: "ai-models", label: "AI model config" },
  { id: "drafting", label: "Drafting" },
  { id: "research", label: "Research" },
  { id: "matters", label: "Matter defaults" },
  { id: "approvals", label: "Approvals" },
  { id: "appearance", label: "Appearance" },
]

export default function Settings({ onClose, firstRun = false }: { onClose: () => void; firstRun?: boolean }) {
  const { t } = useI18n()
  // First run is about getting a model connected, so land on the AI model page.
  const [tab, setTab] = useState<Tab>("ai-models")
  const toast = useToast()

  function switchTab(next: Tab) {
    setTab(next)
  }

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="picker-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-bar">
          <span className="viewer-title">{t("Settings")}</span>
          <button className="modal-close" aria-label={t("Close")} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            {TABS.map((item) => (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => switchTab(item.id)}>
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {firstRun && tab === "ai-models" && (
              <p className="settings-notice">{t("Welcome to doc.haus. Connect a model — an OpenAI-compatible endpoint (API key), a local model, or a host sign-in (gcloud/AWS) — then pick it as your default model.")}</p>
            )}

            {tab === "ai-models" && <AiModelsSettings firstRun={firstRun} onFirstRunDone={onClose} />}

            {tab === "drafting" && <DraftingTab onSaved={(m) => toast("success", m)} />}
            {tab === "research" && <ResearchTab onSaved={(m) => toast("success", m)} />}
            {tab === "matters" && <MatterDefaultsTab />}
            {tab === "approvals" && <ApprovalsTab />}
            {tab === "appearance" && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

// Firm-wide drafting preferences. Saved through the ingest service, which
// renders them into the standing-instructions file the engine reads on every
// turn — so a save here changes how every assistant drafts from its next reply.
function DraftingTab({ onSaved }: { onSaved: (text: string) => void }) {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<DraftingPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    getPreferences().then(setPrefs)
  }, [])
  if (!prefs) return <p className="muted">{t("Loading preferences...")}</p>
  const set = (patch: Partial<DraftingPreferences>) => setPrefs({ ...prefs, ...patch })
  return (
    <section className="settings-section">
      <h3>{t("Drafting preferences")}</h3>
      <p className="settings-hint muted">{t("How every assistant drafts, redlines, and explains its work — across all matters. Saved as standing instructions on the engine; changes apply from the next reply.")}</p>
      <div className="settings-grid">
        <label className="settings-label">{t("Attorney")}</label>
        <input placeholder="Jane Doe" value={prefs.attorney} onChange={(e) => set({ attorney: e.target.value })} />
        <label className="settings-label">{t("Firm")}</label>
        <input placeholder="Doe & Partners LLP" value={prefs.firm} onChange={(e) => set({ firm: e.target.value })} />
      </div>
      <SegRow
        label={t("Process")}
        hint={t("Plan-first makes the assistants inventory the source documents, spot issues against the governing law, research, and write a provision-by-provision action plan before touching the document. Slower and uses more model time; catches more.")}
        value={prefs.process}
        onChange={(process) => set({ process: process as DraftingPreferences["process"] })}
        options={[
          { value: "plan-first", label: t("Plan-first") },
          { value: "standard", label: t("Standard") },
        ]}
      />
      <SegRow
        label={t("Posture")}
        hint={t("How hard negotiated terms lean toward your client.")}
        value={prefs.posture}
        onChange={(posture) => set({ posture: posture as DraftingPreferences["posture"] })}
        options={[
          { value: "client-favorable", label: t("Client-favorable") },
          { value: "balanced", label: t("Balanced") },
          { value: "conservative", label: t("Conservative") },
        ]}
      />
      <SegRow
        label={t("Style")}
        hint={t("Formal legal drafting, or plain language where precision allows.")}
        value={prefs.formality}
        onChange={(formality) => set({ formality: formality as DraftingPreferences["formality"] })}
        options={[
          { value: "formal", label: t("Formal") },
          { value: "plain", label: t("Plain language") },
        ]}
      />
      <SegRow
        label={t("Explanations")}
        hint={t("How much reasoning the assistant shows for its suggestions.")}
        value={prefs.detail}
        onChange={(detail) => set({ detail: detail as DraftingPreferences["detail"] })}
        options={[
          { value: "concise", label: t("Concise") },
          { value: "detailed", label: t("Detailed") },
        ]}
      />
      <SegRow
        label={t("Assistant output language")}
        hint={t("Controls replies and drafted work product. This is independent from the interface language.")}
        value={prefs.responseLanguage}
        onChange={(responseLanguage) =>
          set({ responseLanguage: responseLanguage as DraftingPreferences["responseLanguage"] })
        }
        options={[
          { value: "auto", label: t("Follow the user") },
          { value: "zh-CN", label: "简体中文" },
          { value: "en", label: "English" },
        ]}
      />
      <SegRow
        label={t("Dates")}
        value={prefs.dateFormat}
        onChange={(dateFormat) => set({ dateFormat: dateFormat as DraftingPreferences["dateFormat"] })}
        options={[
          { value: "month-day-year", label: "June 11, 2026" },
          { value: "day-month-year", label: "11 June 2026" },
          { value: "iso", label: "2026-06-11" },
        ]}
      />
      <SegRow
        label={t("Numbers")}
        value={prefs.numberStyle}
        onChange={(numberStyle) => set({ numberStyle: numberStyle as DraftingPreferences["numberStyle"] })}
        options={[
          { value: "words-and-numerals", label: "thirty (30) days" },
          { value: "numerals", label: "30 days" },
        ]}
      />
      <label className="settings-label">{t("House style notes")}</label>
      <textarea
        className="settings-textarea"
        rows={4}
        placeholder={t('Anything else the assistants should always honor, e.g. "Define parties as Customer and Provider, never Licensee/Licensor."')}
        value={prefs.houseStyle}
        onChange={(e) => set({ houseStyle: e.target.value })}
      />
      <div className="row settings-row">
        <button
          className={`primary${saving ? " btn-loading" : ""}`}
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setPrefs(await savePreferences(prefs))
            setSaving(false)
            onSaved(t("Drafting preferences saved. They apply from the assistant's next reply."))
          }}
        >
          {t("Save")}
        </button>
      </div>
    </section>
  )
}

// Where the assistants may read on the live web, and the key that powers it.
// Saved through the same ingest preferences as Drafting (it's one standing-
// instructions file), but split into its own tab because web search is a
// distinct, service-backed capability — not a drafting style choice.
function ResearchTab({ onSaved }: { onSaved: (text: string) => void }) {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<DraftingPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    getPreferences().then(setPrefs)
  }, [])
  if (!prefs) return <p className="muted">{t("Loading preferences...")}</p>
  const set = (patch: Partial<DraftingPreferences>) => setPrefs({ ...prefs, ...patch })
  return (
    <section className="settings-section">
      <h3>{t("Research")}</h3>
      <p className="settings-hint muted">{t("How the assistants read the live web. Changes apply from the next reply.")}</p>
      <SegRow
        label={t("Web research")}
        hint={t("Where the assistants may read when a question turns on current law. Official sources are government legislation portals and court sites; the open web adds commentary, which is not authority and is a larger prompt-injection surface.")}
        value={prefs.webResearch}
        onChange={(webResearch) => set({ webResearch: webResearch as DraftingPreferences["webResearch"] })}
        options={[
          { value: "official", label: t("Official legal sources only") },
          { value: "open", label: t("Entire web") },
        ]}
      />
      <label className="settings-label">
        {t("Additional approved sources")}
        <InfoTip label={t("Hosts the firm trusts as primary sources, one per line (e.g. justia.com). Always allowed for web fetch even in official-sources-only mode — matched as the exact host or any subdomain. Government and court sites are built in and need not be listed.")} />
      </label>
      <textarea
        className="settings-textarea"
        rows={3}
        placeholder={"justia.com\nyour-regulator.org"}
        value={prefs.approvedSources.join("\n")}
        onChange={(e) => set({ approvedSources: e.target.value.split("\n") })}
      />
      <label className="settings-label">
        {t("Exa API key")}
        <InfoTip label={t("Web search is provided by Exa (exa.ai). It lets the assistants discover a citation they do not already know — which statute governs, the section number, the official page — before reading the law from the official source. Exa has a free tier; the key takes effect immediately after saving.")} />
      </label>
      <PasswordInput
        placeholder="Exa API key (exa.ai)"
        value={prefs.searchApiKey}
        onChange={(searchApiKey) => set({ searchApiKey })}
      />
      {!prefs.searchApiKey.trim() && (
        <p className="settings-hint settings-warning">{t("No Exa key set. Assistants can still fetch law they can already cite from official sources, but they cannot discover citations they do not know — a key part of live legal research.")}</p>
      )}
      <div className="row settings-row">
        <button
          className={`primary${saving ? " btn-loading" : ""}`}
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            // Reduce typed lines to bare hostnames (drop scheme/path, lowercase),
            // so the fence's host match in research.ts is exact.
            const approvedSources = [
              ...new Set(
                prefs.approvedSources
                  .map((s) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase())
                  .filter(Boolean),
              ),
            ]
            setPrefs(await savePreferences({ ...prefs, approvedSources }))
            setSaving(false)
            onSaved(t("Research preferences saved. They apply from the assistant's next reply."))
          }}
        >
          {t("Save")}
        </button>
      </div>
    </section>
  )
}

// A masked text input with a show/hide toggle, for API keys. Defaults to hidden;
// the toggle flips the input type so the key can be checked without re-typing.
function PasswordInput({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  return (
    <div className="settings-password">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="btn-sm ghost settings-reveal"
        disabled={disabled}
        aria-pressed={show}
        onClick={() => setShow((s) => !s)}
      >
        {t(show ? "Hide" : "Show")}
      </button>
    </div>
  )
}

// Defaults applied when a new matter is created. Per-browser (prefs.ts); the
// new-matter form reads them as its starting jurisdiction selection.
function MatterDefaultsTab() {
  const { t } = useI18n()
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [selected, setSelected] = useState<string[]>(() => loadPrefs().defaultJurisdictions)
  useEffect(() => {
    listJurisdictions().then((items) => {
      setJurisdictions(items)
      setSelected(availableDefaultJurisdictions(items.map((item) => item.code)))
    })
  }, [])
  return (
    <section className="settings-section">
      <h3>{t("Matter defaults")}</h3>
      <p className="settings-hint muted">{t("Jurisdictions preselected on every new matter. Most firms work in one or two — set them once here instead of picking them on each matter. You can still change them per matter.")}</p>
      <div className="row settings-row">
        <span className="muted">{t("Jurisdictions")}</span>
        <JurisdictionSelect
          jurisdictions={jurisdictions}
          selected={selected}
          onChange={(codes) => {
            setSelected(codes)
            savePrefs({ defaultJurisdictions: codes })
          }}
        />
      </div>
    </section>
  )
}

// Which assistant actions need a click-through before they run. Auto-approval
// only covers proposal-shaped asks — redlines still land as tracked changes the
// lawyer accepts or rejects in the document, and brand-new files are additive.
// Direct edits to existing documents (Word integration) always ask.
function ApprovalsTab() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const set = (patch: Partial<Prefs>) => setPrefs(savePrefs(patch))
  return (
    <section className="settings-section">
      <h3>{t("Approvals")}</h3>
      <p className="settings-hint muted">{t("What the assistant must ask before doing. Everything it proposes is still reviewable: redlines land as tracked changes you accept or reject in the document.")}</p>
      <ToggleRow
        title={t("Redlines & tracked changes")}
        description={t("Proposing a tracked change or redline in a document.")}
        on={prefs.autoApproveRedlines}
        onChange={(on) => set({ autoApproveRedlines: on })}
      />
      <ToggleRow
        title={t("New documents & templates")}
        description={t("Drafting a new document or creating a template.")}
        on={prefs.autoApproveDrafting}
        onChange={(on) => set({ autoApproveDrafting: on })}
      />
      <p className="settings-hint muted">{t("Direct edits to an existing document always ask, regardless of these settings.")}</p>
    </section>
  )
}

function ToggleRow({
  title,
  description,
  on,
  onChange,
}: {
  title: string
  description: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <div className="settings-conn">
      <div className="settings-toggle-text">
        <span className="settings-conn-name">{title}</span>
        <span className="muted">{description}</span>
      </div>
      <span className="switch-state muted">{t(on ? "Auto-approve" : "Ask first")}</span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={`switch${on ? " on" : ""}`}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}

// Text size, applied instantly (prefs.ts reflects it onto <html>).
function AppearanceTab() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const { t, setLocale } = useI18n()
  const set = (patch: Partial<Prefs>) => setPrefs(savePrefs(patch))
  return (
    <section className="settings-section">
      <h3>{t("Appearance")}</h3>
      <SegRow
        label={t("Interface language")}
        value={prefs.locale}
        onChange={(locale) => {
          set({ locale: locale as Locale })
          setLocale(locale as Locale)
        }}
        options={[
          { value: "zh-CN", label: "简体中文" },
          { value: "en", label: "English" },
        ]}
      />
      <SegRow
        label={t("Text size")}
        value={prefs.textSize}
        onChange={(textSize) => set({ textSize: textSize as Prefs["textSize"] })}
        options={[
          { value: "compact", label: t("Compact") },
          { value: "standard", label: t("Standard") },
          { value: "large", label: t("Large") },
        ]}
      />
    </section>
  )
}

// A labeled segmented control row — the pick-one primitive the preference tabs
// are built from.
function SegRow({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-seg-row">
      <label className="settings-label">
        {label}
        {hint && <InfoTip label={hint} />}
      </label>
      <div className="settings-seg">
        {options.map((o) => (
          <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// A small "i" badge that reveals a longer explanation on hover, so dense help
// text can sit beside a label instead of as a paragraph under every field.
function InfoTip({ label }: { label: string }) {
  return (
    <Tooltip label={label}>
      <span className="info-tip" role="img" tabIndex={0} aria-label={label}>
        i
      </span>
    </Tooltip>
  )
}
