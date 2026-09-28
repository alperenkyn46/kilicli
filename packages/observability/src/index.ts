export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createSilentLogger(): Logger {
  return {
    info() {},
    error() {},
  };
}

export function createConsoleLogger(service: string): Logger {
  return {
    info(event, fields) {
      console.info(JSON.stringify({ service, level: "info", event, ...fields }));
    },
    error(event, fields) {
      console.error(JSON.stringify({ service, level: "error", event, ...fields }));
    },
  };
}
