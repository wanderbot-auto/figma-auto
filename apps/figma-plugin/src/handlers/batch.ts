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
      const node = await figma.getNodeByIdAsync(operation.nodeId);
      if (!node || !("name" in node)) {
        return {
          index: -1,
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
        index: -1,
        op: operation.op,
        ok: true,
        wouldChange: node.name !== operation.name,
        targetSummary: summarizeOperation(operation),
        preview: {
          before: {
            name: node.name
          },
          after: {
            name: operation.name
          }
        }
      };
    }
    case "create_page":
      return {
        index: -1,
        op: operation.op,
        ok: true,
        wouldChange: true,
        targetSummary: summarizeOperation(operation),
        preview: {
          after: {
            name: operation.name
          }
        }
      };
    case "set_text": {
      const node = await figma.getNodeByIdAsync(operation.nodeId);
      if (!node || node.type !== "TEXT") {
        return {
          index: -1,
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
        index: -1,
        op: operation.op,
        ok: true,
        wouldChange: node.characters !== operation.text,
        targetSummary: summarizeOperation(operation),
        preview: {
          before: {
            text: node.characters
          },
          after: {
            text: operation.text
          }
        }
      };
    }
  }
}

async function runOperation(operation: BatchOperation): Promise<BatchEditItemResult> {
  try {
    switch (operation.op) {
      case "rename_node": {
        const result = await renameNode(operation as RenameNodePayload);
        return {
          index: -1,
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
          index: -1,
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
          index: -1,
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
      index: -1,
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
  if (!dryRun && payload.confirm !== true) {
    throw new Error("Committed batch_edit requires confirm=true");
  }

  const results = dryRun
    ? await Promise.all(payload.ops.map((operation, index) => dryRunOperation(operation).then((result) => ({ ...result, index }))))
    : await Promise.all(payload.ops.map((operation, index) => runOperation(operation).then((result) => ({ ...result, index }))));
  const successful = results.filter((result) => result.ok).length;

  return {
    dryRun,
    summary: `${successful}/${results.length} operation(s) ${dryRun ? "validated" : "applied"}`,
    results
  };
}
