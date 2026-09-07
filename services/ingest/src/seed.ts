import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs"
import path from "node:path"
import { createMatter, listMatters, readProductConfig, WORKSPACE_ROOT } from "./matter"
import { ingestDocument } from "./ingest"

const PLAYBOOKS_SRC = path.join(import.meta.dir, "..", "..", "..", "dochaus", "playbooks")

export function seedPlaybooks() {
  const product = readProductConfig()
  if (!product.activePlaybooks.length || !existsSync(PLAYBOOKS_SRC)) return
  const playbooksDir = path.join(WORKSPACE_ROOT, ".playbooks")
  const marker = path.join(playbooksDir, ".seeded")
  const seeded = new Set(existsSync(marker) ? readFileSync(marker, "utf8").split("\n").filter(Boolean) : [])
  const fresh = readdirSync(PLAYBOOKS_SRC)
    .filter((name) => product.activePlaybooks.includes(name))
    .filter((name) => existsSync(path.join(PLAYBOOKS_SRC, name, "SKILL.md")))
    .filter((name) => !seeded.has(name))
  if (!fresh.length) return
  fresh.filter((name) => !existsSync(path.join(playbooksDir, name, "SKILL.md"))).forEach((name) => {
    mkdirSync(path.join(playbooksDir, name), { recursive: true })
    copyFileSync(path.join(PLAYBOOKS_SRC, name, "SKILL.md"), path.join(playbooksDir, name, "SKILL.md"))
  })
  mkdirSync(playbooksDir, { recursive: true })
  writeFileSync(marker, [...seeded, ...fresh].join("\n") + "\n")
}

const DEMO_TITLE = "重庆劳动争议演示案件"
const DEMO_DOCUMENT = "解除劳动合同通知书（演示）.docx"

export async function seedDemo() {
  if (listMatters().some((matter) => matter.title === DEMO_TITLE)) {
    console.log(`演示案件“${DEMO_TITLE}”已存在，跳过创建。`)
    return
  }
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "解除劳动合同通知书（虚构演示材料）", heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: "员工：张某", bold: true })] }),
        new Paragraph("本公司以您连续旷工为由，通知自2026年8月31日起解除劳动合同。"),
        new Paragraph("劳动合同签订日期：2023年9月1日。岗位：招商主管。月工资：人民币12,000元。"),
        new Paragraph("公司规章制度规定连续旷工三日可解除劳动合同，但现有材料未载明制度的民主制定、公示或送达情况。"),
        new Paragraph("本材料完全虚构，仅用于测试文档提取、证据梳理和重庆劳动争议分析流程，不构成法律意见。"),
      ],
    }],
  })
  const matter = createMatter(DEMO_TITLE, "CQ-LABOR-DEMO", ["CN-CQ"])
  const result = await ingestDocument(matter.dir, DEMO_DOCUMENT, Buffer.from(await Packer.toBuffer(document)))
  console.log(`已创建“${DEMO_TITLE}”（${matter.id}），提取 ${result.sections} 个章节、${result.chunks} 个片段。`)
}

if (import.meta.main) {
  seedPlaybooks()
  await seedDemo()
}
