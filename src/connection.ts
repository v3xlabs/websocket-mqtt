import {
  encodeConnect,
  encodeDisconnect,
  encodePacket,
  encodePingreq,
} from "./packets/encode.js";
import {
  ConnackPacket,
  decodeAll,
  DEFAULT_KEEPALIVE_SECONDS,
  IncomingPacket,
  OutgoingPacket,
  PacketType,
  PublishPacket,
  QoS,
  QoSLevel,
} from "./packets/index.js";
import { toUint8Array } from "./utils/buffer.js";
import { createEventEmitter } from "./utils/events.js";
import { createLogger, type LogOptions } from "./utils/logger.js";

const FORCE_CLOSE_TIMEOUT_MS = 2000;

export type RetryOptions = {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
};

export type ConnectionOptions = {
  url: string;
  clientId?: string;
  username?: string;
  password?: string;
  keepalive?: number;
  clean?: boolean;
  will?: {
    topic: string;
    payload: string | Uint8Array;
    qos?: QoSLevel;
    retain?: boolean;
  };
  signal?: AbortSignal;
  retry?: RetryOptions;
} & LogOptions;

export type HandlePacketFunction = (packet: IncomingPacket) => void;

export type Connection = {
  open: () => void;
  close: () => void;
  send: (packet: OutgoingPacket) => void;
  nextMessageId: () => number;
  isConnected: () => boolean;
};

export type ConnectionEvents = {
  connect: [packet: ConnackPacket];
  offline: [];
  reconnect: [attempt: number, delayMs: number];
  close: [];
  message: [topic: string, payload: Uint8Array, packet: PublishPacket];
  packet: [packet: IncomingPacket];
  error: [error: unknown];
};

export const DEFAULT_CLIENT_ID = "websocket_mqtt_";

export const createConnection = (options: ConnectionOptions) => {
  const events = createEventEmitter<ConnectionEvents>();
  const log = createLogger(options);
  let lastMessageId = 1;
  let connected = false;
  let ws: WebSocket | undefined;
  let activeAc: AbortController | undefined;

  const timers = {
    pingInterval: undefined as ReturnType<typeof setInterval> | undefined,
    pingTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
    retry: undefined as ReturnType<typeof setTimeout> | undefined,
    forceClose: undefined as ReturnType<typeof setTimeout> | undefined,

    clearAll() {
      if (this.pingInterval) clearInterval(this.pingInterval);

      if (this.pingTimeout) clearTimeout(this.pingTimeout);

      if (this.retry) clearTimeout(this.retry);

      if (this.forceClose) clearTimeout(this.forceClose);

      this.pingInterval = undefined;
      this.pingTimeout = undefined;
      this.retry = undefined;
      this.forceClose = undefined;
    },
  };

  const {
    clientId = DEFAULT_CLIENT_ID + Math.random().toString(36)
      .slice(2, 15),
    username,
    password,
    keepalive = DEFAULT_KEEPALIVE_SECONDS,
    clean = true,
    url,
    signal,
    retry,
  } = options;

  const maxRetries = Math.max(0, retry?.retries ?? 0);
  const initialDelayMs = retry?.initialDelayMs ?? 1000;
  const maxDelayMs = retry?.maxDelayMs ?? 30_000;
  const jitter = retry?.jitter ?? true;

  let intentionalClose = false;
  let retryAttempt = 0;

  const will = options.will
    ? {
        topic: options.will.topic,
        payload: toUint8Array(options.will.payload),
        qos: options.will.qos ?? QoS.AT_MOST_ONCE,
        retain: options.will.retain ?? false,
      }
    : undefined;

  const nextMessageId = (): number => {
    const messageId = lastMessageId;

    lastMessageId = (messageId % 65_535) + 1;

    return lastMessageId;
  };

  let receiveBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  const send = (packet: OutgoingPacket): void => {
    log("sending packet", packet);
    sendRaw(encodePacket(packet));
  };

  const sendRaw = (data: Uint8Array): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      log("sending raw data", data);
      ws.send(data);
    }
    else {
      log("not sending raw data", data);
    }
  };

  const scheduleRetry = () => {
    if (maxRetries === 0 || (maxRetries !== Infinity && retryAttempt >= maxRetries)) {
      events.emit("close");

      return;
    }

    retryAttempt++;
    const exponentialDelay = Math.min(
      initialDelayMs * 2 ** (retryAttempt - 1),
      maxDelayMs,
    );
    const delay = jitter
      ? exponentialDelay * (0.5 + Math.random() * 0.5)
      : exponentialDelay;

    log(`scheduling retry #${retryAttempt} in ${Math.round(delay)}ms`);
    events.emit("reconnect", retryAttempt, Math.round(delay));

    timers.retry = setTimeout(() => {
      timers.retry = undefined;
      open();
    }, delay);
  };

  const close = () => {
    log("closing connection");
    intentionalClose = true;
    timers.clearAll();

    // Detach all WebSocket listeners before closing to prevent handleDisconnect
    if (activeAc) {
      activeAc.abort();
      activeAc = undefined;
    }

    if (connected && ws) {
      sendRaw(encodeDisconnect());
    }

    ws?.close();
    ws = undefined;
    connected = false;
    events.emit("close");
  };

  const open = () => {
    intentionalClose = false;
    receiveBuffer = new Uint8Array(0);

    // Abort previous WebSocket listeners and close socket if open() is called again
    if (activeAc) {
      activeAc.abort();
    }

    ws?.close();

    const ac = new AbortController();

    activeAc = ac;

    const { signal: wsSignal } = ac;

    let disconnected = false;

    const handleDisconnect = () => {
      if (disconnected) return;

      disconnected = true;

      ac.abort();
      activeAc = undefined;
      log("ws:disconnect");
      connected = false;
      timers.clearAll();

      if (!intentionalClose) {
        events.emit("offline");
        scheduleRetry();
      }
    };

    const handleConnectionLost = (): void => {
      connected = false;
      timers.clearAll();
      ws?.close();

      timers.forceClose = setTimeout(() => {
        log("force closing stale connection");
        timers.forceClose = undefined;
        ws = undefined;
        handleDisconnect();
      }, FORCE_CLOSE_TIMEOUT_MS);
    };

    const startPingInterval = (): void => {
      if (keepalive <= 0) return;

      log("starting ping interval");
      const pingIntervalMs = (keepalive * 1000) / 2;
      const pingTimeoutMs = keepalive * 1000;

      timers.pingInterval = setInterval(() => {
        sendRaw(encodePingreq());

        if (!timers.pingTimeout) {
          timers.pingTimeout = setTimeout(() => {
            log("ping timeout, connection lost");
            handleConnectionLost();
          }, pingTimeoutMs);
        }
      }, pingIntervalMs);
    };

    const handlePacket = (packet: IncomingPacket) => {
      log("handlePacket", packet);

      // Any incoming packet proves the connection is alive, so reset the
      // ping timeout (not just PINGRESP — the spec only requires PINGRESP,
      // but any data is a valid liveness signal).
      if (timers.pingTimeout) {
        clearTimeout(timers.pingTimeout);
        timers.pingTimeout = undefined;
      }

      switch (packet.type) {
        case PacketType.CONNACK: {
          if (packet.returnCode === 0) {
            connected = true;
            retryAttempt = 0;
            startPingInterval();
            events.emit("connect", packet);
            log("connected");
          }
          else {
            const message = getConnackErrorMessage(packet.returnCode);

            events.emit("error", new Error(message));
            close();
          }

          break;
        }
        case PacketType.PUBLISH: {
          log("received a publish packet");

          if (packet.qos === 1 && packet.messageId !== undefined) {
            send({ type: PacketType.PUBACK, messageId: packet.messageId });
          }

          events.emit("message", packet.topic, packet.payload, packet);

          break;
        }
        case PacketType.PINGRESP: {
          log("PINGRESP");
          break;
        }
        default: {
          log("received a default packet");
          events.emit("packet", packet);
          break;
        }
      }
    };

    try {
      ws = new WebSocket(url, ["mqtt"]);
    }
    catch (error) {
      log("WebSocket constructor threw", error);
      events.emit("error", error);
      scheduleRetry();

      return;
    }

    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      const packet = encodeConnect({
        type: PacketType.CONNECT,
        clientId,
        username,
        password,
        keepalive,
        clean,
        will,
      });

      sendRaw(packet);
    }, { signal: wsSignal });

    ws.addEventListener("message", (event) => {
      log("onmessage");
      const data = new Uint8Array(event.data as ArrayBuffer);
      const combined = new Uint8Array(receiveBuffer.length + data.length);

      combined.set(receiveBuffer);
      combined.set(data, receiveBuffer.length);
      receiveBuffer = combined;

      const { packets, remaining } = decodeAll(receiveBuffer);

      receiveBuffer = remaining;

      log("packets to process", packets.length);

      for (const packet of packets) {
        handlePacket(packet);
      }
    }, { signal: wsSignal });

    ws.addEventListener("error", (event) => {
      events.emit("error", event);

      // If we were never connected, the close event may not fire (e.g. Node.js
      // WebSocket on a failed connection attempt), so treat it as a disconnect.
      if (!connected) {
        handleDisconnect();
      }
    }, { signal: wsSignal });

    ws.addEventListener("close", handleDisconnect, { signal: wsSignal });
  };

  signal?.addEventListener("abort", () => {
    log("abort signal received");
    close();
  });

  return {
    close,
    open,
    send,
    nextMessageId,
    isConnected: () => connected,
    ...events,
  };
};

const getConnackErrorMessage = (returnCode: number): string => {
  const errorMessages: Record<number, string> = {
    1: "Connection refused: unacceptable protocol version",
    2: "Connection refused: identifier rejected",
    3: "Connection refused: server unavailable",
    4: "Connection refused: bad username or password",
    5: "Connection refused: not authorized",
  };

  return errorMessages[returnCode] || `Connection refused: ${returnCode}`;
};
