import type {
  BatchEditItemResult,
  BatchEditPayload,
  BatchEditResult,
  BatchOperation,
  CreatePagePayload,
  RenameNodePayload,
  SetTextPayload
} from "@figma-auto/protocol";

import { createPage, renameNode, setText } from "./write.js";

function summarizeOperation(operation: BatchOperation): string {
  switch (operation.op) {
    case "rename_node":
      return `rename node ${operation.nodeId} to ${operation.name}`;
    case "create_page":
      return `create page ${operation.name}`;
    case "set_text":
      return `set text on node ${operation.nodeId}`;
  }
}

async function dryRunOperation(operation: BatchOperation): Promise<BatchEditItemResult> {
  switch (operation.op) {
    case "rename_node": {
      const node = figma.getNodeById(operation.nodeId);
      if (!node || !("name" in node)) {
        return {
          op: operation.op,
          ok: false,
          wouldChange: false,
          targetSummary: summarizeOperation(operation),
          error: {
            code: "node_not_found",
            message: `Node ${operation.nodeId} was not found`
          }
        };
      }

      return {
        op: operation.op,
        ok: true,
        wouldChange: node.name !== operation.name,
        targetSummary: summarizeOperation(operation)
      };
    }
    case "create_page":
      return {
        op: operation.op,
        ok: true,
        wouldChange: true,
        targetSummary: summarizeOperation(operation)
      };
    case "set_text": {
      const node = figma.getNodeById(operation.nodeId);
      if (!node || node.type !== "TEXT") {
        return {
          op: operation.op,
          ok: false,
          wouldChange: false,
          targetSummary: summarizeOperation(operation),
          error: {
            code: node ? "node_type_mismatch" : "node_not_found",
            message: node ? `Node ${operation.nodeId} is not a text node` : `Node ${operation.nodeId} was not found`
          }
        };
      }

      return {
        op: operation.op,
        ok: true,
        wouldChange: node.characters !== operation.text,
        targetSummary: summarizeOperation(operation)
      };
    }
  }
}

async function runOperation(operation: BatchOperation): Promise<BatchEditItemResult> {
  try {
    switch (operation.op) {
      case "rename_node": {
        const result = renameNode(operation as RenameNodePayload);
        return {
          op: operation.op,
          ok: true,
          wouldChange: true,
          targetSummary: summarizeOperation(operation),
          result: result as unknown as Record<string, unknown>
        };
      }
      case "create_page": {
        const result = createPage(operation as CreatePagePayload);
        return {
          op: operation.op,
          ok: true,
          wouldChange: true,
          targetSummary: summarizeOperation(operation),
          result: result as unknown as Record<string, unknown>
        };
      }
      case "set_text": {
        const result = await setText(operation as SetTextPayload);
        return {
          op: operation.op,
          ok: true,
          wouldChange: true,
          targetSummary: summarizeOperation(operation),
          result: result as unknown as Record<string, unknown>
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch operation error";
    const code =
      message.includes("not found")
        ? "node_not_found"
        : operation.op === "set_text" && message.includes("text node")
          ? "node_type_mismatch"
          : operation.op === "set_text" && message.includes("font")
            ? "font_load_failed"
            : "internal_error";

    return {
      op: operation.op,
      ok: false,
      wouldChange: false,
      targetSummary: summarizeOperation(operation),
      error: {
        code,
        message
      }
    };
  }
}

export async function batchEdit(payload: BatchEditPayload): Promise<BatchEditResult> {
  const dryRun = payload.dryRun ?? true;
  const results = dryRun
    ? await Promise.all(payload.ops.map((operation) => dryRunOperation(operation)))
    : await Promise.all(payload.ops.map((operation) => runOperation(operation)));
  const successful = results.filter((result) => result.ok).length;

  return {
    dryRun,
    summary: `${successful}/${results.length} operation(s) ${dryRun ? "validated" : "applied"}`,
    results
  };
}
