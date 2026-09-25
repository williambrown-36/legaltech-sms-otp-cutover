import assert from "node:assert/strict";
import { deadlineFollowUp, intakeSchema } from "../src/legal_login.js";

const intake = intakeSchema.parse({ matterId: "m-1", phone: "+14155550123", documentId: "doc-9", deadline: "2025-01-01T00:00:00Z" });
assert.equal(deadlineFollowUp(intake, new Date("2025-01-02T00:00:00Z")), "follow_up_now");
assert.throws(() => intakeSchema.parse({ matterId: "m-1", phone: "555", documentId: "doc-9", deadline: "2030-01-01" }));
console.log("legal login decision test passed");
