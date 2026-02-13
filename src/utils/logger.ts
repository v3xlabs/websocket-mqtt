export type LogOptions = {
  debug?: boolean;
};

export type Logger = (...args: unknown[]) => void;

export const createLogger
  = (options?: LogOptions): Logger =>
    (...args: unknown[]) => {
      if (options?.debug) {
        console.log(...args);
      }
    };
