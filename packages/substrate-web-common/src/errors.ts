import { z } from "zod";

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.any()).optional(),
  }),
  request_id: z.string().optional(),
});
export type ErrorResponseT = z.infer<typeof ErrorResponse>;

export class SubstrateApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
    public requestId?: string,
  ) {
    super(message);
    this.name = "SubstrateApiError";
  }
}
