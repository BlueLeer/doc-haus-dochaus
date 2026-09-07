import { tool } from "@opencode-ai/plugin"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { docxodus } from "../lib/docxodus"
import { lintTemplateBody, splitHeadingBlocks } from "../lib/markdown"

// doc.haus create-template tool. Adds a new reusable drafting template to the
// firm's global library. A template carries NO real client data: every variable
// term — party names, dates, amounts, addresses, reference numbers — is a unique
// descriptive bracketed placeholder, e.g. "[insert disclosing party]". The body is
// composed exactly like draft-document's from-scratch mode (markdown onto the
// styled blank seed _base.docx), then uploaded to the ingest service, which owns
// the library (WORKSPACE_ROOT/.templates) and returns the placeholders it found.

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates")
const ingestUrl = process.env.INGEST_URL ?? "http://127.0.0.1:4500"

export default tool({
  description:
    'Create a reusable China labor-dispute document template. Before saving, replace all case-specific names, dates, amounts, addresses, contacts, and reference numbers with unique descriptive placeholders. Have the labor-reviewer subagent review the proposed body once, apply every must-fix finding, and do not claim that unverified local rules are current. Returns the placeholders exposed by the template.',
  args: {
    name: tool.schema
      .string()
      .describe('File name for the new template, e.g. "consulting-agreement.docx" (".docx" is appended if missing)'),
    content: tool.schema.string().describe("The complete template body as markdown, with every variable term a unique [insert ...] placeholder"),
    description: tool.schema
      .string()
      .describe('A one-line summary of what this template is for, e.g. "Mutual NDA for vendor evaluations". Helps future template selection.'),
  },
  async execute(args, ctx) {
    const name = path.basename(args.name.endsWith(".docx") ? args.name : `${args.name}.docx`)

    // Deterministic gate: defects that multiply into every future draft are
    // rejected before anything is built or asked of the user.
    const problems = lintTemplateBody(args.content)
    if (problems.length) return `Template body fails lint — fix the body and retry: ${problems.join("; ")}.`

    const existing = (await (await fetch(`${ingestUrl}/templates`)).json()) as { templates: { name: string }[] }
    if (existing.templates.some((t) => t.name === name)) return `A template named ${name} already exists. Pick a different name.`

    // Adding a template to the firm's shared library is gated on the user's
    // approval. Asked before any Docxodus work so a rejection costs nothing.
    await ctx.ask({ always: [], permission: "create-template", patterns: [name], metadata: { template: name } })

    const dx = await docxodus()
    const session = dx.openDocxSession(await Bun.file(path.join(templatesDir, "_base.docx")).bytes(), {})

    // The seed's single empty paragraph is the insertion anchor; the whole markdown
    // body goes in as one multi-block insert, then the seed paragraph is dropped.
    const anchor = Object.keys(session.project().anchorIndex).find((id) => id.startsWith("p:"))!
    const inserted = session.insertParagraph(anchor, "after", splitHeadingBlocks(args.content))
    if (!inserted.success) {
      session.close()
      return `Template build failed: ${inserted.error?.message ?? JSON.stringify(inserted.error)}`
    }
    session.deleteBlock(anchor)

    const placeholders = session.findPlaceholders().map((p) => p.match.text)
    const bytes = session.save()
    session.close()

    const form = new FormData()
    form.append("file", new File([bytes], name))
    form.append("description", args.description)
    const res = await fetch(`${ingestUrl}/templates`, { method: "POST", body: form })
    if (!res.ok) return `Template composed but upload failed (${res.status}): ${await res.text()}`

    return {
      title: `Created template ${name}`,
      output: [
        `Added ${name} to the firm template library.`,
        placeholders.length
          ? `Placeholders: ${placeholders.join(", ")}.`
          : "It exposes no placeholders — confirm every variable term is a [insert ...] placeholder.",
      ].join(" "),
      metadata: { template: name, placeholders },
    }
  },
})
