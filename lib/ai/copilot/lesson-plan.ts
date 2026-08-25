import { z } from "zod"
import {
  citationSchema,
  safetyResultSchema,
  usageSchema,
  type Citation,
} from "../contracts.ts"

const boundedText = (max: number) => z.string().trim().min(1).max(max)

export const lessonPlanInputSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  audience: z.string().trim().max(160).default(""),
  durationMinutes: z.number().int().min(15).max(300),
  objective: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2_000).default(""),
  contentIds: z.array(z.string().uuid()).max(20).default([]),
})

export const lessonPlanStepSchema = z.object({
  title: boundedText(160),
  minutes: z.number().int().min(1).max(300),
  description: boundedText(1_000),
})

export const lessonPlanDraftSchema = z.object({
  title: boundedText(240),
  objectives: z.array(boundedText(500)).min(1).max(8),
  prerequisites: z.array(boundedText(300)).max(8),
  durationMinutes: z.number().int().min(15).max(300),
  steps: z.array(lessonPlanStepSchema).min(1).max(12),
  materials: z.array(boundedText(200)).max(12),
  activity: boundedText(2_000),
  assessment: boundedText(2_000),
  adaptations: z.array(boundedText(500)).max(8),
  citations: z.array(citationSchema).max(20),
})

export const lessonPlanStatusSchema = z.enum([
  "proposed",
  "rejected",
  "saved",
  "blocked",
  "failed",
])

export const lessonPlanProposalSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    status: lessonPlanStatusSchema,
    draft: lessonPlanDraftSchema,
    citations: z.array(citationSchema).max(20),
    model: z.string().trim().min(1).max(160),
    usage: usageSchema,
    safety: safetyResultSchema,
    contentItemId: z.string().uuid().nullable().optional(),
  })
  .superRefine((proposal, context) => {
    if (JSON.stringify(proposal.citations) !== JSON.stringify(proposal.draft.citations)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citations"],
        message: "Proposal citations must match draft citations",
      })
    }

    const hasContentItem = proposal.contentItemId !== null && proposal.contentItemId !== undefined
    if (proposal.status === "saved" && !hasContentItem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentItemId"],
        message: "Saved proposals require a content item",
      })
    }
    if (proposal.status !== "saved" && hasContentItem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentItemId"],
        message: "Only saved proposals may reference a content item",
      })
    }
  })

export type LessonPlanInput = z.infer<typeof lessonPlanInputSchema>
export type LessonPlanStep = z.infer<typeof lessonPlanStepSchema>
export type LessonPlanDraft = z.infer<typeof lessonPlanDraftSchema>
export type LessonPlanStatus = z.infer<typeof lessonPlanStatusSchema>
export type LessonPlanProposal = z.infer<typeof lessonPlanProposalSchema>
export type LessonPlanCitation = Citation
