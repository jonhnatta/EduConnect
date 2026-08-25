import { z } from "zod"

export const copilotMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
})

export const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
})

export const feedbackSchema = z.object({
  rating: z.enum(["positive", "negative"]),
  comment: z.string().trim().max(1_000).optional(),
})

export type CopilotMessageInput = z.infer<typeof copilotMessageInputSchema>
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>
export type FeedbackInput = z.infer<typeof feedbackSchema>
