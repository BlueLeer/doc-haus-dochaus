// Shared product contract. No server imports: safe for browser and agent tools.
export const CASE_FIELDS = {
  stance: "委托立场", stage: "争议阶段", worker: "劳动者", employer: "用人单位",
  workplace: "工作地", employerAddress: "单位所在地", performancePlace: "合同履行地",
  joined: "入职日期", departed: "离职日期", serviceDate: "送达日期", applicationDate: "申请日期",
  hearingDate: "开庭日期", awardDate: "裁决日期", salary: "工资结构及发放口径",
  baseSalary: "基本工资", performancePay: "绩效工资", bonus: "奖金", allowances: "津贴及补贴",
  salaryCycle: "工资支付周期", actualPay: "实发工资及对应期间",
  tenure: "工作年限（用户陈述）",
} as const
export type CaseField = keyof typeof CASE_FIELDS
export type CaseSource = { document: string; quote: string; fingerprint?: string }
export type CaseRow = {
  id: string
  kind: "profile" | "fact" | "evidence" | "claim"
  field?: CaseField
  title: string
  date: string
  detail: string
  position: "neutral" | "worker" | "employer" | "disputed"
  status: "pending" | "confirmed"
  source?: CaseSource
  links: string[]
  gap: string
  modifiedInVersion?: number
}
export type CaseAnalysis = { id: string; text: string; revision: number; createdAt: number }
export type CaseSummaryVersion = { id: string; text: string; revision: number; rowIds: string[]; createdAt: number }
export type CaseSummary = { draft: string; basedOnRevision: number; updatedAt: number; confirmed: CaseSummaryVersion[] }
export type Casebook = { version: 1; revision: number; rows: CaseRow[]; analyses: CaseAnalysis[]; summary?: CaseSummary }
export type CasebookView = Casebook & { staleSources: string[] }
