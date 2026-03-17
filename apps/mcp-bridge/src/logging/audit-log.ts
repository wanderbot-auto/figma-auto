import fs from "node:fs/promises";
import path from "node:path";

export type AuditMode = "dry_run" | "commit";

export interface AuditLogEntry {
  timestamp: string;
  mode: AuditMode;
  sessionId: string;
  requestId: string;
  tool: string;
  targetSummary: string;
  ok: boolean;
  errorCode?: string;
}

export class AuditLogger {
  constructor(private readonly filePath: string) {}

  async append(entry: AuditLogEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
