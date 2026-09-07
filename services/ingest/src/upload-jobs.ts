import type { Progress, ReportProgress } from "./progress"

export type UploadJob = {
  id: string; matter: string; name: string; status: "running" | "success" | "error"
  progress: Progress; error?: string; result?: unknown
}
const jobs = new Map<string, UploadJob>()

export function listUploadJobs(matter: string) {
  return [...jobs.values()].filter((job) => job.matter === matter)
}

export function startUploadJob(matter: string, name: string, run: (report: ReportProgress) => Promise<unknown>) {
  if (listUploadJobs(matter).some((job) => job.name === name && job.status === "running"))
    throw new Error("该文件正在处理中，请等待完成")
  // Only retain a bounded recent history, never evict active work.
  for (const job of [...jobs.values()].filter((item) => item.status !== "running").slice(0, -50)) jobs.delete(job.id)
  const job: UploadJob = { id: crypto.randomUUID(), matter, name, status: "running", progress: { stage: "extracting" } }
  jobs.set(job.id, job)
  Promise.resolve().then(() => run((progress) => { job.progress = progress })).then((result) => {
    job.result = result
    job.progress = { stage: "complete", completed: 1, total: 1 }
    job.status = "success"
  }).catch((error) => {
    job.error = error instanceof Error ? error.message : String(error)
    job.status = "error"
  })
  return job
}
