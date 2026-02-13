export type EventMap = Record<string, unknown[]>;

export type EventListener<E extends EventMap, K extends keyof E> = (
  ...args: E[K]
) => void;

export type EventEmitter<E extends EventMap> = {
  on<K extends keyof E>(event: K, listener: EventListener<E, K>): void;
  off<K extends keyof E>(event: K, listener: EventListener<E, K>): void;
  emit<K extends keyof E>(event: K, ...args: E[K]): void;
};

export const createEventEmitter = <E extends EventMap>(): EventEmitter<E> => {
  const listeners = new Map<keyof E, Set<EventListener<E, keyof E>>>();

  return {
    on<K extends keyof E>(event: K, listener: EventListener<E, K>) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }

      listeners.get(event)!.add(listener as EventListener<E, keyof E>);
    },
    off<K extends keyof E>(event: K, listener: EventListener<E, K>) {
      if (listeners.has(event)) {
        listeners.get(event)!.delete(listener as EventListener<E, keyof E>);
      }
    },
    emit<K extends keyof E>(event: K, ...args: E[K]) {
      if (listeners.has(event)) {
        listeners.get(event)!.forEach(listener => listener(...args));
      }
    },
  };
};
