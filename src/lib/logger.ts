const PREFIX = "[substrate]";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), event, ...data };
  switch (level) {
    case "debug": console.debug(PREFIX, event, entry); break;
    case "info":  console.info(PREFIX, event, entry); break;
    case "warn":  console.warn(PREFIX, event, entry); break;
    case "error": console.error(PREFIX, event, entry); break;
  }
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),
  info:  (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn:  (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
};
