import type {
  BatchEditPayload,
  BatchEditResult,
  BatchEditV2Operation,
  BatchEditV2Payload
} from "@figma-auto/protocol";

import { batchEditV2 } from "./batch-v2.js";

function toBatchEditV2Payload(payload: BatchEditPayload): BatchEditV2Payload {
  return {
    dryRun: payload.dryRun,
    confirm: payload.confirm,
    compactResults: payload.compactResults,
    ops: payload.ops.map((operation) => operation as BatchEditV2Operation)
  };
}

export async function batchEdit(payload: BatchEditPayload): Promise<BatchEditResult> {
  // Keep the original surface as a compatibility layer over the v2 engine.
  const result = await batchEditV2(toBatchEditV2Payload(payload));

  return {
    dryRun: result.dryRun,
    summary: result.summary,
    results: result.results,
    stoppedAt: result.stoppedAt
  };
}
