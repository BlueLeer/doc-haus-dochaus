// Creates a private, additive baseline outside all legal asset discovery paths.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

const root = process.cwd()
const destination = path.join(root, '.p0-backups', new Date().toISOString().replaceAll(':', '-'))
fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
const excluded = new Set(['node_modules', 'dist', '.git', '.env', '.DS_Store'])
const manifest = []
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
function copy(source, relative) {
  const stat = fs.lstatSync(source)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(source).sort()) {
      if (excluded.has(name) || name.startsWith('.env')) continue
      copy(path.join(source, name), path.join(relative, name))
    }
    return
  }
  if (!stat.isFile()) return
  const bytes = fs.readFileSync(source)
  const target = path.join(destination, 'files', relative)
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  fs.writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' })
  manifest.push({ path: relative, sha256: hash(bytes), bytes: bytes.length, originalMode: stat.mode & 0o777 })
}
for (const name of ['dochaus', 'apps/web', 'services/ingest', 'docs', 'start.sh', 'AGENTS.md', 'package.json', 'bun.lock', 'tsconfig.json']) {
  if (fs.existsSync(path.join(root, name))) copy(path.join(root, name), path.join('project', name))
}
const workspace = process.env.WORKSPACE_ROOT || path.join(root, 'workspace')
const bindings = []
if (fs.existsSync(workspace)) {
  for (const name of fs.readdirSync(workspace).sort()) {
    const dir = path.join(workspace, name)
    const metadata = path.join(dir, 'matter.json')
    if (fs.existsSync(metadata)) {
      const data = JSON.parse(fs.readFileSync(metadata, 'utf8'))
      bindings.push({ id: data.id, jurisdictions: data.jurisdictions, playbook: data.playbook })
      copy(metadata, path.join('workspace', name, 'matter.json'))
    }
    if (['.skills', '.playbooks', '.templates', '.preferences'].includes(name)) copy(dir, path.join('workspace', name))
  }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'dochaus/opencode.json'), 'utf8'))
const registry = (name) => {
  const file = path.join(root, 'dochaus', name + '.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).map((item) => ({ name: item.name, steps: item.steps?.map((step) => step.agent) })) : []
}
const inventory = {
  workspace, workspaceExists: fs.existsSync(workspace), workspaceProvenance: process.env.WORKSPACE_ROOT ? 'shell environment' : 'start.sh default; live process override not proven',
  jurisdictions: fs.readdirSync(path.join(root, 'dochaus/jurisdiction')).filter((name) => fs.existsSync(path.join(root, 'dochaus/jurisdiction', name, 'profile.json'))),
  agents: fs.readdirSync(path.join(root, 'dochaus/agent')).filter((name) => name.endsWith('.md')),
  skills: fs.readdirSync(path.join(root, 'dochaus/skill')),
  playbooks: fs.readdirSync(path.join(root, 'dochaus/playbooks')),
  tools: fs.readdirSync(path.join(root, 'dochaus/tool')).filter((name) => name.endsWith('.ts')),
  customAgents: registry('agents'), customWorkflows: registry('workflows'), bindings,
  skillPaths: config.skills?.paths, instructions: config.instructions,
  mcp: Object.entries(config.mcp ?? {}).map(([name, value]) => ({ name, enabled: value.enabled, type: value.type })),
  disabledAgents: Object.entries(config.agent ?? {}).filter(([, value]) => value.disable).map(([name]) => name),
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
fs.writeFileSync(path.join(destination, 'inventory.json'), JSON.stringify(inventory, null, 2), { mode: 0o600 })
// Full restore rehearsal to an isolated directory; leave it available for inspection.
const restored = fs.mkdtempSync(path.join(os.tmpdir(), 'dochaus-p0-restore-'))
for (const item of manifest) {
  const saved = path.join(destination, 'files', item.path)
  const target = path.join(restored, item.path)
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  fs.copyFileSync(saved, target)
  fs.chmodSync(target, 0o600)
  if (hash(fs.readFileSync(target)) !== item.sha256) throw new Error('Restore mismatch: ' + item.path)
}
fs.writeFileSync(path.join(destination, 'restore-check.json'), JSON.stringify({ restored, verified: manifest.length, timestamp: new Date().toISOString() }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ destination, restored, verified: manifest.length, bytes: manifest.reduce((sum, item) => sum + item.bytes, 0), inventory }, null, 2))
