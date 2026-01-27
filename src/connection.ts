import { QoSLevel } from ".";
import { createEventEmitter } from "./events";
import {
  ConnackPacket,
  decodeAll,
  DEFAULT_KEEPALIVE_SECONDS,
  IncomingPacket,
  OutgoingPacket,
  PacketType,
  PublishPacket,
  QoS,
} from "./packets";
import {
  encodeConnect,
  encodeDisconnect,
  encodePacket,
  encodePingreq,
} from "./packets/encode";
import { toUint8Array } from "./utils/buffer";

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
};

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
  error: [error: unknown];
  close: [];
};

export const DEFAULT_CLIENT_ID = "websocket_mqtt_";

export const createConnection = (
  options: ConnectionOptions,
  handlePacket: HandlePacketFunction,
) => {
  const events = createEventEmitter<ConnectionEvents>();
  let lastMessageId = 0;
  let connected = false;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let ws: WebSocket | null = null;

  const nextMessageId = (): number => {
    const messageId = lastMessageId;

    lastMessageId = (lastMessageId % 65535) + 1;

    return messageId;
  };

  const startPingInterval = (): void => {
    if (options.keepalive && options.keepalive > 0) {
      const pingIntervalMs = (options.keepalive * 1000) / 2;

      pingInterval = setInterval(() => {
        sendRaw(encodePingreq());
      }, pingIntervalMs);
    }
  };

  const send = (packet: OutgoingPacket): void => {
    console.log("sending packet", packet);
    sendRaw(encodePacket(packet));
  };

  const sendRaw = (data: Uint8Array): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log("sending raw data", data);
      ws.send(data);
    }
  };

  const close = () => {
    if (connected && ws) {
      sendRaw(encodeDisconnect());
    }

    ws?.close();
    connected = false;

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  const open = () => {
    ws = new WebSocket(options.url, ["mqtt"]);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      //   sendConnect();
      const packet = encodeConnect({
        type: PacketType.CONNECT,
        clientId:
          options.clientId ??
          DEFAULT_CLIENT_ID + Math.random().toString(36).substring(2, 15),
        username: options.username,
        password: options.password,
        keepalive: options.keepalive ?? DEFAULT_KEEPALIVE_SECONDS,
        clean: options.clean ?? true,
        will: options.will
          ? {
              topic: options.will.topic,
              payload: toUint8Array(options.will.payload),
              qos: options.will.qos ?? QoS.AT_MOST_ONCE,
              retain: options.will.retain ?? false,
            }
          : undefined,
      });

      sendRaw(packet);
    };

    let receiveBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

    const handlePacket2 = (packet: IncomingPacket) => {
      console.log("handlePacket2", packet);

      switch (packet.type) {
        case PacketType.CONNACK:
          if (packet.returnCode === 0) {
            connected = true;
            startPingInterval();
            events.emit("connect", packet);
          } else {
            const message = getConnackErrorMessage(packet.returnCode);

            events.emit("error", new Error(message));
            close();
          }

          break;
        case PacketType.PUBLISH:
          if (packet.qos === 1 && packet.messageId !== undefined) {
            send({ type: PacketType.PUBACK, messageId: packet.messageId });
          }

          events.emit("message", packet.topic, packet.payload, packet);

          break;
        case PacketType.PINGRESP:
          break;
        default:
          handlePacket(packet);
          break;
      }
    };

    ws.onmessage = (event) => {
      console.log("onmessage");
      const data = new Uint8Array(event.data as ArrayBuffer);
      const combined = new Uint8Array(receiveBuffer.length + data.length);

      combined.set(receiveBuffer);
      combined.set(data, receiveBuffer.length);
      receiveBuffer = combined;

      const { packets, remaining } = decodeAll(receiveBuffer);

      receiveBuffer = remaining;

      console.log("packets to process ", packets.length);

      for (const packet of packets) {
        console.log("packet", packet);

        handlePacket2(packet);
      }
    };

    ws.onerror = (event) => {
      events.emit("error", event);
    };

    ws.onclose = () => {
      close();
    };
  };

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
