import { startMatterLogin, deadlineFollowUp } from "../src/legal_login.js";

const input = {
  matterId: process.env.MATTER_ID ?? "matter-104",
  phone: process.env.MATTER_PHONE,
  documentId: process.env.DOCUMENT_ID ?? "engagement-letter-7",
  deadline: process.env.MATTER_DEADLINE ?? "2030-06-01T09:00:00Z"
};
if (!input.phone) throw new Error("MATTER_PHONE is required");
const result = await startMatterLogin(input);
console.log(result, deadlineFollowUp({ ...input, deadline: new Date(input.deadline), phone: input.phone }));
