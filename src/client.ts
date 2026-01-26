import { ConnectionOptions } from ".";
import { createEventEmitter, EventEmitter } from "./events";
import {
  type ConnackPacket,
  decodeAll,
  DEFAULT_KEEPALIVE_SECONDS,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePuback,
  encodePublish,
  encodeSubscribe,
  type IncomingPacket,
  PacketType,
  type PublishPacket,
  QoS,
  type QoSLevel,
  type SubackPacket,
} from "./packets";
import { toUint8Array } from "./utils/buffer";

export type MqttClientOptions = ConnectionOptions & {
  url: string;
};

export type MqttClientEvents = {
  connect: [packet: ConnackPacket];
  message: [topic: string, payload: Uint8Array, packet: PublishPacket];
  error: [error: unknown];
  close: [];
};

export type MqttClient = EventEmitter<MqttClientEvents>;

export function createMqttClient(options: MqttClientOptions) {
  let ws: WebSocket | null = null;
  let connected = false;
  let messageIdCounter = 1;
  let receiveBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const events = createEventEmitter<MqttClientEvents>();

  const pendingSubscribes = new Map<
    number,
    { resolve: (granted: number[]) => void; reject: (err: Error) => void }
  >();
  const pendingPublishes = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();

  const mergedOptions = {
    keepalive: DEFAULT_KEEPALIVE_SECONDS,
    clean: true,
    clientId:
      options.clientId || `mqtt_${Math.random().toString(36).slice(2, 10)}`,
    ...options,
  };

  function send(data: Uint8Array): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }

  function cleanup(): void {
    connected = false;

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    const error = new Error("Connection closed");

    pendingSubscribes.forEach((pending) => pending.reject(error));
    pendingSubscribes.clear();
    pendingPublishes.forEach((pending) => pending.reject(error));
    pendingPublishes.clear();
  }

  function nextMessageId(): number {
    const messageId = messageIdCounter;

    messageIdCounter = (messageIdCounter % 65535) + 1;

    return messageId;
  }

  function startPingInterval(): void {
    if (mergedOptions.keepalive && mergedOptions.keepalive > 0) {
      const pingIntervalMs = (mergedOptions.keepalive * 1000) / 2;

      pingInterval = setInterval(() => {
        if (connected) {
          send(encodePingreq());
        }
      }, pingIntervalMs);
    }
  }

  function getConnackErrorMessage(returnCode: number): string {
    const errorMessages: Record<number, string> = {
      1: "Connection refused: unacceptable protocol version",
      2: "Connection refused: identifier rejected",
      3: "Connection refused: server unavailable",
      4: "Connection refused: bad username or password",
      5: "Connection refused: not authorized",
    };

    return errorMessages[returnCode] || `Connection refused: ${returnCode}`;
  }

  function handleConnack(packet: ConnackPacket): void {
    if (packet.returnCode === 0) {
      connected = true;
      startPingInterval();
      events.emit("connect", packet);
    } else {
      const message = getConnackErrorMessage(packet.returnCode);

      events.emit("error", new Error(message));
      end();
    }
  }

  function handleSuback(packet: SubackPacket): void {
    const pending = pendingSubscribes.get(packet.messageId);

    if (pending) {
      pendingSubscribes.delete(packet.messageId);
      const hasFailure = packet.granted.some((qos) => qos === 0x80);

      if (hasFailure) {
        pending.reject(new Error("Subscription failed"));
      } else {
        pending.resolve(packet.granted);
      }
    }
  }

  function handlePublish(packet: PublishPacket): void {
    if (packet.qos === 1 && packet.messageId !== undefined) {
      send(
        encodePuback({
          type: PacketType.PUBACK,
          messageId: packet.messageId,
        }),
      );
    }

    events.emit("message", packet.topic, packet.payload, packet);
  }

  function handlePuback(packet: { messageId: number }): void {
    const pending = pendingPublishes.get(packet.messageId);

    if (pending) {
      pendingPublishes.delete(packet.messageId);
      pending.resolve();
    }
  }

  function handlePacket(packet: IncomingPacket): void {
    switch (packet.type) {
      case PacketType.CONNACK:
        handleConnack(packet as ConnackPacket);
        break;
      case PacketType.SUBACK:
        handleSuback(packet as SubackPacket);
        break;
      case PacketType.PUBLISH:
        handlePublish(packet as PublishPacket);
        break;
      case PacketType.PUBACK:
        handlePuback(packet as { messageId: number });
        break;
      case PacketType.PINGRESP:
        break;
    }
  }

  function handleData(data: Uint8Array): void {
    const combined = new Uint8Array(receiveBuffer.length + data.length);

    combined.set(receiveBuffer);
    combined.set(data, receiveBuffer.length);
    receiveBuffer = combined;

    const { packets, remaining } = decodeAll(receiveBuffer);

    receiveBuffer = remaining;

    for (const packet of packets) {
      handlePacket(packet);
    }
  }

  function sendConnect(): void {
    const packet = encodeConnect({
      type: PacketType.CONNECT,
      clientId: mergedOptions.clientId!,
      username: mergedOptions.username,
      password: mergedOptions.password,
      keepalive: mergedOptions.keepalive!,
      clean: mergedOptions.clean!,
      will: mergedOptions.will
        ? {
            topic: mergedOptions.will.topic,
            payload: toUint8Array(mergedOptions.will.payload),
            qos: mergedOptions.will.qos ?? QoS.AT_MOST_ONCE,
            retain: mergedOptions.will.retain ?? false,
          }
        : undefined,
    });

    send(packet);
  }

  // Public API functions
  function connect(): void {
    ws = new WebSocket(mergedOptions.url, ["mqtt"]);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      sendConnect();
    };

    ws.onmessage = (event) => {
      handleData(new Uint8Array(event.data as ArrayBuffer));
    };

    ws.onerror = (event) => {
      events.emit("error", event);
    };

    ws.onclose = () => {
      cleanup();
      events.emit("close");
    };
  }

  function subscribe(topic: string, qos: QoSLevel = QoS.AT_MOST_ONCE): void {
    subscribeAsync(topic, qos).catch((err) => {
      events.emit("error", err);
    });
  }

  function subscribeAsync(
    topic: string,
    qos: QoSLevel = QoS.AT_MOST_ONCE,
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const messageId = nextMessageId();

      pendingSubscribes.set(messageId, { resolve, reject });

      const packet = encodeSubscribe({
        type: PacketType.SUBSCRIBE,
        messageId,
        subscriptions: [{ topic, qos }],
      });

      send(packet);
    });
  }

  function publish(
    topic: string,
    payload: string | Uint8Array,
    options?: { qos?: QoSLevel; retain?: boolean },
  ): void {
    publishAsync(topic, payload, options).catch((err) => {
      events.emit("error", err);
    });
  }

  function publishAsync(
    topic: string,
    payload: string | Uint8Array,
    options?: { qos?: QoSLevel; retain?: boolean },
  ): Promise<void> {
    const qos = options?.qos ?? QoS.AT_MOST_ONCE;
    const retain = options?.retain ?? false;
    const messageId = qos > 0 ? nextMessageId() : undefined;

    const packet = encodePublish({
      type: PacketType.PUBLISH,
      topic,
      payload: toUint8Array(payload),
      qos,
      retain,
      dup: false,
      messageId,
    });

    send(packet);

    if (qos === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      pendingPublishes.set(messageId!, { resolve, reject });
    });
  }

  function end(): void {
    if (connected && ws) {
      send(encodeDisconnect());
    }

    ws?.close();
    cleanup();
  }

  function endAsync(): Promise<void> {
    return new Promise((resolve) => {
      const onClose = () => {
        events.off("close", onClose);
        resolve();
      };

      events.on("close", onClose);
      end();

      if (!ws || ws.readyState === WebSocket.CLOSED) {
        events.off("close", onClose);
        resolve();
      }
    });
  }

  // Return public API
  const client = {
    connect,
    subscribe,
    subscribeAsync,
    publish,
    publishAsync,
    end,
    endAsync,
    get isConnected() {
      return connected;
    },
  };

  return Object.assign(client, events);
}
