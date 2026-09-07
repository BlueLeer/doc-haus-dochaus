import { useEffect, useMemo, useState } from "react"
import {
  addLocalProvider,
  getConfig,
  getProviderOptions,
  listAuthMethods,
  listProviders,
  probeProvider,
  removeLocalProvider,
  setDisabledProviders,
  setModels,
  setProviderKey,
  setProviderOptions,
  settingsClient,
  updateLocalProvider,
  type Client,
} from "../api/opencode"
import {
  listAwsProfiles,
  listGcpProjects,
  probeVertexHost,
} from "../api/ingest"
import { isGated, loadVerified, saveVerified } from "../providers"
import { useI18n } from "../i18n"
import { useToast } from "./Toast"

type Provider = Awaited<ReturnType<typeof listProviders>>["all"][number]
type Methods = Record<string, { type: "oauth" | "api"; label: string }[]>
type Config = Awaited<ReturnType<typeof getConfig>>

// The merged "AI model configuration" page — what used to be the Models and
// Providers tabs, in one OpenAI-compatible-first view. The engine's default and
// fast models each get a slot card; every other connected provider is listed
// below with "use as default / fast" actions; OpenAI-compatible providers are
// added inline; Vertex/Bedrock host-credential setups fold away at the bottom.
//
// Data sources (all engine-wide, header-less settings client):
//   - listProviders()   -> catalog (models.dev + config-defined providers)
//   - listAuthMethods() -> which providers take a typed API key vs OAuth
//   - getConfig()       -> engine opencode.json: model, small_model,
//                          disabled_providers, and the configured provider block
//   - auth.json         -> API keys, written via setProviderKey
//
// A provider is "configured" (editable name/baseURL, truly deletable) iff it has
// an entry in config.provider. Hosted catalog providers (deepseek, OpenAI, ...)
// are only keyable and can be disabled, never deleted. Vertex/Bedrock stay gated
// behind a live credential probe (providers.ts) inside their own fold, so a
// half-configured cloud never shows up as pickable.
export default function AiModelsSettings({
  firstRun = false,
  onFirstRunDone,
}: {
  firstRun?: boolean
  onFirstRunDone?: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const client = useMemo<Client>(() => settingsClient(), [])
  const [all, setAll] = useState<Provider[]>([])
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [methods, setMethods] = useState<Methods>({})
  const [cfg, setCfg] = useState<Config | null>(null)
  const [disabled, setDisabled] = useState<string[]>([])
  const [verified, setVerified] = useState<Set<string>>(loadVerified)
  const [busy, setBusy] = useState("")
  const [adding, setAdding] = useState(false)

  async function load() {
    const [providers, auth, config] = await Promise.all([listProviders(client), listAuthMethods(client), getConfig()])
    setAll(providers.all)
    setConnected(new Set(providers.connected))
    setMethods(auth)
    setCfg(config)
    setDisabled([...new Set(config.disabled_providers ?? [])])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const providerByID = new Map(all.map((p) => [p.id, p] as const))
  const nameOf = (id: string) => providerByID.get(id)?.name ?? id
  const configuredOf = (id: string) => Boolean(cfg?.provider?.[id])

  async function saveModels(model: string, small: string) {
    setBusy("models")
    try {
      const saved = await setModels(model, small || model)
      setCfg((c) => (c ? { ...c, model: saved.model ?? model, small_model: saved.small_model ?? (small || model) } : c))
      toast("success", t("Models saved."))
      if (firstRun) onFirstRunDone?.()
    } catch (error) {
      toast("error", error instanceof Error ? error.message : t("Could not save models."))
    } finally {
      setBusy("")
    }
  }

  async function toggleEnabled(id: string, enable: boolean) {
    const next = enable ? disabled.filter((x) => x !== id) : [...new Set([...disabled, id])]
    setDisabled(next)
    try {
      await setDisabledProviders(next)
      toast("success", enable ? t("Enabled {name}.", { name: nameOf(id) }) : t("Disabled {name}.", { name: nameOf(id) }))
    } catch (error) {
      toast("error", error instanceof Error ? error.message : t("Could not save provider state."))
    }
    await load()
  }

  async function deleteConfigured(id: string) {
    setBusy(`del-${id}`)
    try {
      await removeLocalProvider(id)
      toast("success", t("Removed {name}.", { name: nameOf(id) }))
      await load()
    } catch (error) {
      toast("error", error instanceof Error ? error.message : t("Could not remove provider."))
    } finally {
      setBusy("")
    }
  }

  const defaultModel = cfg?.model ?? ""
  const fastModel = cfg?.small_model ?? ""
  const defaultPID = defaultModel.split("/")[0] ?? ""
  const fastPID = fastModel.split("/")[0] ?? ""
  const inUseIDs = new Set([defaultPID, fastPID].filter(Boolean))

  const cardFor = (id: string) => (id && providerByID.get(id) ? providerByID.get(id)! : null)

  // All non-gated providers that are relevant: connected or configured, plus any
  // disabled one parked at the end. The slot providers are rendered by the slots
  // themselves; the rest come from here.
  const rest = all
    .filter((p) => !isGated(p.id))
    .filter((p) => connected.has(p.id) || Boolean(cfg?.provider?.[p.id]))
    .filter((p) => !inUseIDs.has(p.id))
  const restEnabled = rest.filter((p) => !disabled.includes(p.id))
  const restDisabled = rest.filter((p) => disabled.includes(p.id))

  const needsSetup = all.filter((p) => isGated(p.id) && !verified.has(p.id))
  const readyGated = all.filter((p) => isGated(p.id) && verified.has(p.id))

  return (
    <div className="ai-models">
      <section className="settings-section">
        <h3>{t("AI model configuration")}</h3>
        <p className="settings-hint muted">
          {t("OpenAI-compatible endpoints — DeepSeek, Kimi, Qwen, local Ollama, or any server that speaks the OpenAI API. Keys live in the engine's local credential store on this machine; they are never uploaded.")}
        </p>

        <div className="ai-models-slots">
          <SlotCard
            title={t("Default model")}
            hint={t("The model every conversation uses unless an agent overrides it.")}
            provider={cardFor(defaultPID)}
            modelSpec={defaultModel}
            busy={busy}
            client={client}
            connected={connected}
            methods={methods}
            cfg={cfg}
            disabledList={disabled}
            onChangeModel={(pid, mid) => saveModels(`${pid}/${mid}`, fastModel)}
            onDelete={configuredOf(defaultPID) && !isGated(defaultPID) ? () => deleteConfigured(defaultPID) : undefined}
            onToggle={(on) => toggleEnabled(defaultPID, on)}
            onMutated={load}
            toast={toast}
          />
          <SlotCard
            title={t("Fast model")}
            hint={t("Cheap model for lightweight tasks like conversation routing and title generation.")}
            provider={cardFor(fastPID)}
            modelSpec={fastModel}
            busy={busy}
            client={client}
            connected={connected}
            methods={methods}
            cfg={cfg}
            disabledList={disabled}
            onChangeModel={(pid, mid) => saveModels(defaultModel, `${pid}/${mid}`)}
            onDelete={configuredOf(fastPID) && !isGated(fastPID) ? () => deleteConfigured(fastPID) : undefined}
            onToggle={(on) => toggleEnabled(fastPID, on)}
            onMutated={load}
            toast={toast}
          />
        </div>

        {restEnabled.length > 0 && (
          <div className="ai-models-group">
            <h4 className="ai-models-subhead">{t("Other connected providers")}</h4>
            {restEnabled.map((p) => (
              <PlainCard
                key={p.id}
                provider={p}
                configured={configuredOf(p.id)}
                busy={busy}
                client={client}
                cfg={cfg}
                connected={connected}
                methods={methods}
                onDefault={() => saveModels(`${p.id}/${firstModelID(p)}`, fastModel)}
                onFast={() => saveModels(defaultModel, `${p.id}/${firstModelID(p)}`)}
                onDelete={configuredOf(p.id) ? () => deleteConfigured(p.id) : undefined}
                onToggle={(on) => toggleEnabled(p.id, on)}
                onMutated={load}
                toast={toast}
              />
            ))}
          </div>
        )}

        {restDisabled.length > 0 && (
          <div className="ai-models-group">
            <h4 className="ai-models-subhead">{t("Disabled")}</h4>
            {restDisabled.map((p) => (
              <PlainCard
                key={p.id}
                provider={p}
                configured={configuredOf(p.id)}
                busy={busy}
                client={client}
                cfg={cfg}
                connected={connected}
                methods={methods}
                onDefault={undefined}
                onFast={undefined}
                onDelete={undefined}
                onToggle={(on) => toggleEnabled(p.id, on)}
                onMutated={load}
                toast={toast}
                off
              />
            ))}
          </div>
        )}

        <div className="ai-models-add">
          {adding ? (
            <AddForm
              onCancel={() => setAdding(false)}
              onSaved={async () => {
                setAdding(false)
                await load()
                toast("success", t("Provider added. If its models do not appear, restart the engine."))
              }}
            />
          ) : (
            <button className="btn-sm ghost" onClick={() => setAdding(true)}>
              + {t("Add OpenAI-compatible model")}
            </button>
          )}
        </div>
      </section>

      <CloudFold
        needsSetup={needsSetup}
        readyGated={readyGated}
        client={client}
        onVerified={(ids) => {
          const next = new Set(verified)
          ids.forEach((id) => next.add(id))
          saveVerified(next)
          setVerified(next)
          load()
        }}
        onUnverify={(id) => {
          const next = new Set(verified)
          next.delete(id)
          saveVerified(next)
          setVerified(next)
          load()
        }}
        onUseAsDefault={(pid) => saveModels(`${pid}/${firstModelID(providerByID.get(pid)!)}`, fastModel)}
        onUseAsFast={(pid) => saveModels(defaultModel, `${pid}/${firstModelID(providerByID.get(pid)!)}`)}
      />
    </div>
  )
}

// The model id a provider exposes first — what "use as default/fast" applies to
// when the user does not pick one explicitly. Configured providers carry exactly
// one model in config; catalog providers use their first catalog model.
function firstModelID(p: Provider) {
  return Object.keys(p.models ?? {})[0] ?? ""
}

// The engine flags whether a provider actually holds credentials in its `key`
// field (the catalog "connected" list marks config presence, not a working key —
// a configured provider with no key still lists as connected). The SDK type does
// not model `key`, so read it through a narrow cast.
export function providerHasKey(p: Provider) {
  return Boolean((p as unknown as { key?: string | Record<string, unknown> }).key)
}

// A slot card — the default or fast model in use. Editing is done inline: the
// card flips to a small form for name/baseURL/key/model, saved per the provider
// kind. "Delete" on a hosted catalog provider is a disable; on a configured
// provider it is a real removal.
function SlotCard(props: {
  title: string
  hint: string
  provider: Provider | null
  modelSpec: string
  busy: string
  client: Client
  connected: Set<string>
  methods: Methods
  cfg: Config | null
  disabledList: string[]
  onChangeModel: (providerID: string, modelID: string) => void
  onDelete?: () => void
  onToggle: (enable: boolean) => void
  onMutated: () => void
  toast: ReturnType<typeof useToast>
}) {
  const { t } = useI18n()
  const p = props.provider
  if (!p) {
    return (
      <div className="settings-conn ai-models-slot off">
        <div className="settings-toggle-text">
          <span className="settings-conn-name">{props.title}</span>
          <span className="muted">{props.hint}</span>
        </div>
        <span className="ai-models-empty muted">{t("None set")}</span>
      </div>
    )
  }
  const off = props.disabledList.includes(p.id)
  const modelID = props.modelSpec.split("/").slice(1).join("/")
  const hasKey = providerHasKey(p)
  const models = listModels(p, props.cfg)
  return (
    <div className={`settings-conn ai-models-slot${off ? " off" : ""}`}>
      <div className="ai-models-card-main">
        <div className="ai-models-title-row">
          <span className="settings-conn-name">{p.name}</span>
          <span className="ai-models-badge">{props.title}</span>
          {off && <span className="ai-models-badge off">{t("Disabled")}</span>}
        </div>
        <div className="ai-models-meta muted">
          {models.length > 1 ? (
            <select
              className="ai-models-model-select"
              value={modelID || models[0]}
              disabled={props.busy === "models"}
              onChange={(e) => props.onChangeModel(p.id, e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <span>{modelID || models[0] || t("no model")}</span>
          )}
          <span className="ai-models-dot">·</span>
          <span>{p.id}</span>
          {!hasKey && !isGated(p.id) && (
            <>
              <span className="ai-models-dot">·</span>
              <span className="ai-models-nokey">{t("no key set")}</span>
            </>
          )}
        </div>
      </div>
      <div className="ai-models-actions">
        <EditButton
          provider={p}
          cfg={props.cfg}
          connected={props.connected}
          methods={props.methods}
          client={props.client}
          onSaved={() => props.onMutated()}
          toast={props.toast}
          title={t("Edit {name}", { name: p.name })}
        />
        <button
          className="btn-sm ghost ai-models-del"
          aria-label={off ? t("Enable {name}", { name: p.name }) : props.onDelete ? t("Remove {name}", { name: p.name }) : t("Disable {name}", { name: p.name })}
          disabled={props.busy === `del-${p.id}`}
          onClick={() => {
            if (off) return props.onToggle(true)
            if (props.onDelete) {
              if (!window.confirm(t("Remove provider {name}? This deletes its config and key from the engine.", { name: p.name }))) return
              return props.onDelete()
            }
            props.onToggle(false)
          }}
        >
          {off ? t("Enable") : props.onDelete ? t("Delete") : t("Disable")}
        </button>
      </div>
    </div>
  )
}

// Any connected-but-not-in-use provider card: use-as-default/fast, edit, and
// delete-or-disable.
function PlainCard(props: {
  provider: Provider
  configured: boolean
  busy: string
  client: Client
  cfg: Config | null
  connected: Set<string>
  methods: Methods
  onDefault?: () => void
  onFast?: () => void
  onDelete?: () => void
  onToggle: (enable: boolean) => void
  onMutated: () => void
  toast: ReturnType<typeof useToast>
  off?: boolean
}) {
  const { t } = useI18n()
  const p = props.provider
  const modelID = firstModelID(p)
  const hasKey = providerHasKey(p)
  return (
    <div className={`settings-conn ai-models-plain${props.off ? " off" : ""}`}>
      <div className="ai-models-card-main">
        <div className="ai-models-title-row">
          <span className="settings-conn-name">{p.name}</span>
          {props.off && <span className="ai-models-badge off">{t("Disabled")}</span>}
        </div>
        <div className="ai-models-meta muted">
          <span>{modelID || p.id}</span>
          {!hasKey && !props.off && <span className="ai-models-nokey"> · {t("no key set")}</span>}
        </div>
      </div>
      <div className="ai-models-actions">
        {!props.off && modelID && (
          <>
            <button className="btn-sm ghost" disabled={props.busy === "models"} onClick={props.onDefault}>
              {t("Use as default")}
            </button>
            <button className="btn-sm ghost" disabled={props.busy === "models"} onClick={props.onFast}>
              {t("Use as fast")}
            </button>
          </>
        )}
        <EditButton
          provider={p}
          cfg={props.cfg}
          connected={props.connected}
          methods={props.methods}
          client={props.client}
          onSaved={() => props.onMutated()}
          toast={props.toast}
          title={t("Edit {name}", { name: p.name })}
        />
        <button
          className="btn-sm ghost ai-models-del"
          aria-label={props.off ? t("Enable {name}", { name: p.name }) : props.onDelete ? t("Remove {name}", { name: p.name }) : t("Disable {name}", { name: p.name })}
          disabled={props.busy === `del-${p.id}`}
          onClick={() => {
            if (props.off) return props.onToggle(true)
            if (props.onDelete) {
              if (!window.confirm(t("Remove provider {name}? This deletes its config and key from the engine.", { name: p.name }))) return
              return props.onDelete()
            }
            props.onToggle(false)
          }}
        >
          {props.off ? t("Enable") : props.onDelete ? t("Delete") : t("Disable")}
        </button>
      </div>
    </div>
  )
}

// "Edit" opens a small popover-ish form over the card. The fields depend on the
// provider kind:
//   - hosted API-key (deepseek...): API key only.
//   - configured OpenAI-compatible (huoshan, local): name, base URL, optional
//     API key, model id.
// Gated host-credential providers are edited in the cloud fold instead, so the
// card shows no Edit button for them.
function EditButton(props: {
  provider: Provider
  cfg: Config | null
  connected: Set<string>
  methods: Methods
  client: Client
  onSaved: () => void
  toast: ReturnType<typeof useToast>
  title: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [key, setKey] = useState("")
  const [modelID, setModelID] = useState("")
  const [saving, setSaving] = useState(false)
  const p = props.provider
  const isConfigured = Boolean(props.cfg?.provider?.[p.id])
  const gated = isGated(p.id)
  const configuredModels = Object.keys(props.cfg?.provider?.[p.id]?.models ?? {})
  const catalogModels = Object.keys(p.models ?? {})
  const models = isConfigured && configuredModels.length ? configuredModels : catalogModels

  if (gated) return null

  const openEditor = async () => {
    const opts = isConfigured ? await getProviderOptions(p.id) : {}
    setName(p.name)
    setBaseURL(opts.baseURL ?? "")
    setKey("")
    setModelID(models[0] ?? "")
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (isConfigured) {
        if (!baseURL.trim()) throw new Error(t("Base URL is required."))
        await updateLocalProvider(p.id, {
          name: name.trim() || p.name,
          baseURL: baseURL.trim(),
          modelID: modelID.trim() || models[0],
        })
      }
      if (key.trim()) await setProviderKey(props.client, p.id, key.trim())
      props.onSaved()
      setOpen(false)
      props.toast("success", t("Saved {name}.", { name: p.name }))
    } catch (error) {
      props.toast("error", error instanceof Error ? error.message : t("Could not save provider."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="btn-sm ghost" title={props.title} aria-label={props.title} onClick={openEditor}>
        {t("Edit")}
      </button>
      {open && (
        <div className="ai-models-editor">
          <div className="settings-grid">
            {!isConfigured && (
              <>
                <span />
                <p className="settings-hint muted" style={{ margin: 0 }}>
                  {t("Hosted provider — only the API key can be set here. Its model list comes from the provider catalog.")}
                </p>
              </>
            )}
            {isConfigured && (
              <>
                <label className="settings-label">{t("Name")}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={p.name} />
              </>
            )}
            {isConfigured && (
              <>
                <label className="settings-label">{t("Base URL")}</label>
                <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.example.com/v1" />
              </>
            )}
            <label className="settings-label">{t("API key")}</label>
            <PasswordInput
              placeholder={props.connected.has(p.id) ? t("Replace key (leave blank to keep)") : t("API key")}
              value={key}
              onChange={setKey}
            />
            {isConfigured && (
              <>
                <label className="settings-label">{t("Model id")}</label>
                <input value={modelID} onChange={(e) => setModelID(e.target.value)} placeholder="my-model" list={`models-${p.id}`} />
                {models.length > 1 && (
                  <datalist id={`models-${p.id}`}>
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </div>
          <div className="row settings-row">
            <button className={`primary${saving ? " btn-loading" : ""}`} disabled={saving} onClick={save}>
              {t("Save")}
            </button>
            <button className="btn-sm ghost" disabled={saving} onClick={() => setOpen(false)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// The models a provider exposes to the model picker: configured providers list
// exactly what is in their config entry; catalog providers list their catalog.
function listModels(p: Provider, cfg: Config | null) {
  const configured = cfg?.provider?.[p.id]
  if (configured && Object.keys(configured.models ?? {}).length) return Object.keys(configured.models!)
  return Object.keys(p.models ?? {})
}

function PasswordInput({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
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
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="btn-sm ghost settings-reveal" aria-pressed={show} onClick={() => setShow((s) => !s)}>
        {t(show ? "Hide" : "Show")}
      </button>
    </div>
  )
}

// The inline "Add OpenAI-compatible model" form — four fields, matching the
// unified card: name, base URL, API key, model id. Saving registers a configured
// provider (addLocalProvider) and stores the key when one is given.
function AddForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("http://localhost:1234/v1")
  const [key, setKey] = useState("")
  const [modelID, setModelID] = useState("")
  const [saving, setSaving] = useState(false)
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "provider"
  const ready = name.trim() && baseURL.trim() && modelID.trim()
  const save = async () => {
    if (!ready) return
    setSaving(true)
    try {
      const client = settingsClient()
      await addLocalProvider({ id, name: name.trim(), baseURL: baseURL.trim(), modelID: modelID.trim() })
      if (key.trim()) await setProviderKey(client, id, key.trim())
      onSaved()
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="ai-models-addform">
      <div className="settings-grid">
        <label className="settings-label">{t("Name")}</label>
        <input placeholder="DeepSeek" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="settings-label">{t("Base URL")}</label>
        <input placeholder="https://api.deepseek.com/v1" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
        <label className="settings-label">{t("API key")}</label>
        <PasswordInput placeholder={t("API key (optional now)")} value={key} onChange={setKey} />
        <label className="settings-label">{t("Model id")}</label>
        <input placeholder="deepseek-chat" value={modelID} onChange={(e) => setModelID(e.target.value)} />
      </div>
      <div className="row settings-row">
        <button className={`primary${saving ? " btn-loading" : ""}`} disabled={!ready || saving} onClick={save}>
          {t("Add provider")}
        </button>
        <button className="btn-sm ghost" disabled={saving} onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>
      <p className="settings-hint muted">{t("Provider id: {id}", { id })}</p>
    </div>
  )
}

// Vertex / Bedrock host-credential setups, folded under the OpenAI-compatible
// page. These sign in on the server (gcloud ADC / AWS) rather than with a typed
// key, so they keep their own enable-and-probe flow. Reuses the verified gate so
// a cloud that has not passed a live probe never reaches the pickers above.
function CloudFold(props: {
  needsSetup: Provider[]
  readyGated: Provider[]
  client: Client
  onVerified: (ids: string[]) => void
  onUnverify: (id: string) => void
  onUseAsDefault: (providerID: string) => void
  onUseAsFast: (providerID: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const setupCards = CLOUD_SETUPS.filter((spec) => props.needsSetup.some((p) => p.id === spec.ids[0]))
  return (
    <section className="settings-section">
      <div className="ai-models-cloudhead">
        <button className="linklike" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "▾" : "▸"} {t("Vertex / Bedrock (host credentials)")}
        </button>
        {(props.needsSetup.length > 0 || props.readyGated.length > 0) && (
          <span className="muted" style={{ fontSize: 12 }}>
            {props.readyGated.length > 0
              ? t("{count} connected", { count: props.readyGated.length })
              : t("{count} need setup", { count: props.needsSetup.length })}
          </span>
        )}
      </div>
      {open && (
        <div className="ai-models-cloudbody">
          {setupCards.length > 0 && (
            <>
              <p className="settings-hint muted">
                {t("Vertex and Bedrock sign in from the server (gcloud ADC / AWS), not an API key. Set the project or region, sign in on the server, then Enable — until a live check passes they stay out of the model pickers.")}
              </p>
              {setupCards.map((spec) => (
                <NeedsSetupCard
                  key={spec.ids[0]}
                  spec={spec}
                  providers={props.needsSetup.filter((p) => spec.ids.includes(p.id))}
                  client={props.client}
                  onVerified={props.onVerified}
                />
              ))}
            </>
          )}
          {props.readyGated.length > 0 && (
            <div className="settings-connected">
              {props.readyGated.map((p) => (
                <div key={p.id} className="settings-conn">
                  <span className="settings-conn-name">{p.name}</span>
                  <span className="settings-conn-meta muted">{t("Connected")}</span>
                  <button className="btn-sm ghost" onClick={() => props.onUseAsDefault(p.id)}>
                    {t("Use as default")}
                  </button>
                  <button className="btn-sm ghost" onClick={() => props.onUseAsFast(p.id)}>
                    {t("Use as fast")}
                  </button>
                  <button className="btn-sm ghost" onClick={() => props.onUnverify(p.id)}>
                    {t("Reconfigure")}
                  </button>
                </div>
              ))}
            </div>
          )}
          {setupCards.length === 0 && props.readyGated.length === 0 && (
            <p className="muted">{t("No host-credential setups available.")}</p>
          )}
        </div>
      )}
    </section>
  )
}

type CloudField = {
  key: string
  label: string
  placeholder: string
  required: boolean
  fallback?: string
  options?: string[]
  suggest?: "gcp-projects" | "aws-profiles"
}
type CloudSpec = { ids: string[]; name: string; signin: string; fields: CloudField[] }

function vertexAnthropicBaseURL(project: string, location: string) {
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/anthropic/models`
}

const VERTEX_LOCATIONS = [
  "global", "us-central1", "us-east1", "us-east4", "us-east5", "us-west1", "us-west4",
  "northamerica-northeast1", "southamerica-east1", "europe-west1", "europe-west2",
  "europe-west3", "europe-west4", "europe-west9", "europe-north1", "asia-east1",
  "asia-northeast1", "asia-northeast3", "asia-south1", "asia-southeast1",
  "australia-southeast1", "me-central1",
]

const BEDROCK_REGIONS = [
  "us-east-1", "us-east-2", "us-west-2", "ca-central-1", "sa-east-1", "eu-central-1",
  "eu-central-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1", "ap-northeast-1",
  "ap-northeast-2", "ap-south-1", "ap-southeast-1", "ap-southeast-2",
]

const CLOUD_SETUPS: CloudSpec[] = [
  {
    ids: ["google-vertex", "google-vertex-anthropic"],
    name: "Google Vertex AI",
    signin: "gcloud auth application-default login",
    fields: [
      { key: "project", label: "GCP project id", placeholder: "my-gcp-project", required: true, suggest: "gcp-projects" },
      { key: "location", label: "Location", placeholder: "global", required: false, fallback: "global", options: VERTEX_LOCATIONS },
    ],
  },
  {
    ids: ["amazon-bedrock"],
    name: "Amazon Bedrock",
    signin: "aws configure (profile or role)",
    fields: [
      { key: "region", label: "AWS region", placeholder: "us-east-1", required: true, fallback: "us-east-1", options: BEDROCK_REGIONS },
      { key: "profile", label: "AWS profile", placeholder: "default", required: false, suggest: "aws-profiles" },
    ],
  },
]

function NeedsSetupCard(props: {
  spec: CloudSpec
  providers: Provider[]
  client: Client
  onVerified: (ids: string[]) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState("")
  const { spec } = props

  useEffect(() => {
    getProviderOptions(spec.ids[0]).then((opts) =>
      setValues(Object.fromEntries(spec.fields.map((f) => [f.key, opts[f.key] ?? f.fallback ?? ""]))),
    )
    spec.fields
      .filter((f) => f.suggest)
      .forEach((f) =>
        (f.suggest === "gcp-projects" ? listGcpProjects() : listAwsProfiles()).then((items) =>
          setSuggestions((s) => ({ ...s, [f.key]: items })),
        ),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec])

  const ready = spec.fields.every((f) => !f.required || values[f.key]?.trim() || f.fallback)

  const enable = async () => {
    setProbing(true)
    setError("")
    const options = Object.fromEntries(
      spec.fields.map((f) => [f.key, (values[f.key]?.trim() || f.fallback) ?? ""]).filter(([, v]) => v),
    )
    try {
      const results = await Promise.all(
        props.providers.map(async (p) => {
          const optionsFor =
            p.id === "google-vertex-anthropic" && options.project
              ? { ...options, baseURL: vertexAnthropicBaseURL(options.project, options.location || "global") }
              : options
          await setProviderOptions(p.id, optionsFor)
          const modelID = probeModelFor(p)
          if (!modelID) return { p, ok: false as const, error: t("Provider has no models to test.") }
          const vertex = p.id === "google-vertex" || p.id === "google-vertex-anthropic"
          const result =
            vertex && options.project
              ? await probeVertexHost({
                  project: options.project,
                  location: options.location || "global",
                  publisher: p.id === "google-vertex" ? "google" : "anthropic",
                  model: modelID,
                })
              : await probeProvider(props.client, p.id, modelID)
          return result.ok ? { p, ok: true as const, error: "" } : { p, ok: false as const, error: result.error || "Verification failed." }
        }),
      )
      const passed = results.filter((r) => r.ok)
      const failed = results.find((r) => !r.ok)
      if (!passed.length) {
        setError(failed?.error ?? t("Verification failed."))
        return
      }
      props.onVerified(passed.map((r) => r.p.id))
      toast("success", t("{providers} verified.", { providers: passed.map((r) => r.p.name).join(", ") }))
      if (failed) setError(failed.error)
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="settings-needs">
      <div className="row settings-row">
        <span className="settings-conn-name">{spec.name}</span>
        <span className="settings-conn-meta muted">{t("Server sign-in: {command}", { command: spec.signin })}</span>
      </div>
      {spec.fields.map((f) => {
        const set = (value: string) => setValues((v) => ({ ...v, [f.key]: value }))
        const listID = `${spec.ids[0]}-${f.key}`
        return (
          <div key={f.key} className="row settings-row settings-field">
            <label className="settings-label settings-field-label">{t(f.label)}</label>
            {f.options ? (
              <select value={values[f.key] ?? f.fallback ?? ""} onChange={(e) => set(e.target.value)}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                list={suggestions[f.key]?.length ? listID : undefined}
                onChange={(e) => set(e.target.value)}
              />
            )}
            {(suggestions[f.key]?.length ?? 0) > 0 && (
              <datalist id={listID}>
                {suggestions[f.key]?.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            )}
          </div>
        )
      })}
      <div className="row settings-row settings-field">
        <button className={`primary${probing ? " btn-loading" : ""}`} disabled={probing || !ready} onClick={enable}>
          {t("Enable")}
        </button>
      </div>
      {error && <span className="settings-error">{error}</span>}
    </div>
  )
}

// The cheapest real model the provider's catalog exposes for a probe call, so a
// gated provider can be verified without burning a premium model. Mirrors the
// curated probe picks from models.ts (fast > primary > first).
function probeModelFor(p: Provider) {
  const ids = Object.keys(p.models ?? {})
  const prefer = ["flash", "lite", "mini", "haiku", "nano", "small", "fast"]
  return (
    prefer.map((re) => ids.find((id) => id.toLowerCase().includes(re))).find(Boolean) ??
    ids.find((id) => id.toLowerCase().includes("gemini")) ??
    ids[0] ??
    ""
  )
}
