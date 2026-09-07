export type Progress = {
  stage: "extracting" | "rendering" | "ocr" | "preparing" | "indexing" | "complete"
  completed?: number
  total?: number
}
export type ReportProgress = (progress: Progress) => void
