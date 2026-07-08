import { z } from "zod";

export const createCommentSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
