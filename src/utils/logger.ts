export type LogLevel = "silent" | "debug";

export type LogOptions = {
  debug?: boolean;
  logLevel?: LogLevel;
};

export type Logger = {
  debug: (...args: unknown[]) => void;
};

const isDebugEnabled = (options?: LogOptions): boolean => {
  if (options?.debug !== undefined) {
    return options.debug;
  }

  if (options?.logLevel !== undefined) {
    return options.logLevel === "debug";
  }

  return false;
};

export const createLogger = (options?: LogOptions): Logger => {
  const isDebug = isDebugEnabled(options);

  return {
    debug: (...args: unknown[]) => {
      if (isDebug) {
        console.log(...args);
      }
    },
  };
};
