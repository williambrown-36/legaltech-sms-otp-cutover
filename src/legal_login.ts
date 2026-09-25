import { z } from "zod";
import { infrai } from "./infrai.js";

export const intakeSchema = z.object({
  matterId: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  documentId: z.string().min(1),
  deadline: z.coerce.date()
});

export type Intake = z.infer<typeof intakeSchema>;

export async function startMatterLogin(input: unknown) {
  const intake = intakeSchema.parse(input);
  await infrai.sms.otp(intake.phone);
  return { matterId: intake.matterId, status: "code_sent", documentId: intake.documentId, deadline: intake.deadline.toISOString() } as const;
}

export async function verifyMatterLogin(phone: string, code: string) {
  const result = await infrai.sms.verify(phone, code);
  return result.verified ? { authenticated: true, next: "signed_document_delivery" as const } : { authenticated: false, next: "retry_code" as const };
}

export function deadlineFollowUp(intake: Intake, now = new Date()) {
  return intake.deadline.getTime() <= now.getTime() ? "follow_up_now" as const : "follow_up_scheduled" as const;
}
