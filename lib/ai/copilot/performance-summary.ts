export type PerformanceSummaryRow = {
  member_count: number | string
  activity_count: number | string
  submission_count: number | string
  average_score: number | string | null
  distinct_submitter_count: number | string
}

export function performanceSummaryFromRow(row: PerformanceSummaryRow): Record<string, number | null> {
  const memberCount = Number(row.member_count ?? 0)
  const distinctSubmitterCount = Number(row.distinct_submitter_count ?? 0)
  return {
    activityCount: Number(row.activity_count ?? 0),
    submissionCount: Number(row.submission_count ?? 0),
    averageScore: row.average_score === null ? null : Number(row.average_score),
    deliveryRate: memberCount === 0 ? null : distinctSubmitterCount / memberCount,
  }
}
