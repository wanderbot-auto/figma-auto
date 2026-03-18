import fs from "node:fs/promises";
import path from "node:path";

export type BridgeLogLevel = "INFO" | "WARN" | "ERROR";

function formatDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  const parts = Object.entries(details).flatMap(([key, value]) => {
    if (value === undefined) {
      return [];
    }

    return [`${key}=${JSON.stringify(value)}`];
  });

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export class BridgeLogger {
  constructor(private readonly filePath: string) {}

  info(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.append("INFO", event, details);
  }

  warn(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.append("WARN", event, details);
  }

  error(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.append("ERROR", event, details);
  }

  private async append(level: BridgeLogLevel, event: string, details?: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = `${new Date().toISOString()} ${level} ${event}${formatDetails(details)}\n`;
    await fs.appendFile(this.filePath, line, "utf8");
  }
}
