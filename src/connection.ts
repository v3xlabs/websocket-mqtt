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
  message: [topic: string, payload: Uint8Array, packet: PublishPacket];
  packet: [packet: IncomingPacket];
  error: [error: unknown];
  close: [];
};

export const DEFAULT_CLIENT_ID = "websocket_mqtt_";

export const createConnection = (options: ConnectionOptions) => {
  const events = createEventEmitter<ConnectionEvents>();
  const log = createLogger(options);
  let lastMessageId = 1;
  let connected = false;
  let pingInterval: ReturnType<typeof setInterval> | undefined;
  let ws: WebSocket | undefined;

  const {
    clientId = DEFAULT_CLIENT_ID + Math.random().toString(36)
      .slice(2, 15),
    username,
    password,
    keepalive = DEFAULT_KEEPALIVE_SECONDS,
    clean = true,
    url,
    signal,
  } = options;
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

  const startPingInterval = (): void => {
    log("starting ping interval");

    if (keepalive > 0) {
      const pingIntervalMs = (keepalive * 1000) / 2;

      pingInterval = setInterval(() => {
        sendRaw(encodePingreq());
      }, pingIntervalMs);
    }
  };

  let receiveBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  const handlePacket2 = (packet: IncomingPacket) => {
    log("handlePacket2", packet);

    switch (packet.type) {
      case PacketType.CONNACK: {
        if (packet.returnCode === 0) {
          connected = true;
          startPingInterval();
          events.emit("connect", packet);
          log("connected");
        }
        else {
          const message = getConnackErrorMessage(packet.returnCode);

          console.error(message);
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

  const close = () => {
    log("closing connection");

    if (connected && ws) {
      sendRaw(encodeDisconnect());
    }

    ws?.close();
    connected = false;

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = undefined;
    }
  };

  const open = () => {
    ws = new WebSocket(url, ["mqtt"]);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      //   sendConnect();
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
    });

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
        log("packet", packet);

        handlePacket2(packet);
      }
    });

    ws.addEventListener("error", (event) => {
      events.emit("error", event);
    });

    ws.addEventListener("close", () => {
      log("ws:onclose");
      close();
    });
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
