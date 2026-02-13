import {
  Connection,
  ConnectionOptions,
  createConnection,
} from "./connection.js";
import {
  type ConnackPacket,
  PacketType,
  type PublishPacket,
  QoS,
  type QoSLevel,
} from "./packets/index.js";
import { toUint8Array } from "./utils/buffer.js";
import { createEventEmitter, type EventEmitter } from "./utils/events.js";
import { createLogger } from "./utils/logger.js";

export type MqttEvents = {
  connect: [packet: ConnackPacket];
  message: [topic: string, payload: Uint8Array, packet: PublishPacket];
  error: [error: unknown];
  close: [];
};

export type MqttOptions = {
  url: string;
} & ConnectionOptions;

export type MqttClient = EventEmitter<MqttEvents> & {
  connection: Connection;
  isConnected: () => boolean;
  publish: (
    topic: string,
    payload: string | Uint8Array,
    options?: { qos?: QoSLevel; retain?: boolean; },
  ) => Promise<void>;
  subscribe: (topic: string, qos?: QoSLevel) => Promise<number[]>;
  connect: () => Promise<void>;
  close: () => void;
};

export type MqttClientInternalRequest<K> = {
  resolve: (value: K) => void;
  reject: (err: Error) => void;
};
export type MqttClientInternalPending = {
  sub: Map<number, MqttClientInternalRequest<number[]>>;
  pub: Map<number, MqttClientInternalRequest<void>>;
};

export const createMqtt = (options: MqttOptions): MqttClient => {
  const pending: MqttClientInternalPending = {
    sub: new Map(),
    pub: new Map(),
  };
  const events = createEventEmitter<MqttEvents>();
  const log = createLogger(options);
  const connection = createConnection(options);

  connection.on("connect", (packet) => {
    events.emit("connect", packet);
  });
  connection.on("message", (topic, payload, packet) => {
    events.emit("message", topic, payload, packet);
  });

  connection.on("packet", (packet) => {
    switch (packet.type) {
      case PacketType.SUBACK: {
        log("SUBACK", packet);
        const request = pending.sub.get(packet.messageId);

        if (request) {
          pending.sub.delete(packet.messageId);
          const hasFailure = packet.granted.includes(0x80);

          if (hasFailure) {
            request.reject(new Error("Subscription failed"));
          }
          else {
            request.resolve(packet.granted);
          }
        }

        break;
      }
      case PacketType.PUBACK: {
        log("PUBACK", packet);
        const request = pending.pub.get(packet.messageId);

        if (request) {
          pending.pub.delete(packet.messageId);
          request.resolve();
        }

        break;
      }
    }
  });

  connection.on("error", (err) => {
    console.error("error", err);
    events.emit("error", err);
  });

  connection.on("close", () => {
    for (const request of pending.sub.values()) {
      request.reject(new Error("Connection closed"));
    }
    pending.sub.clear();

    for (const request of pending.pub.values()) {
      request.reject(new Error("Connection closed"));
    }
    pending.pub.clear();

    events.emit("close");
  });

  const publish = (
    topic: string,
    payload: string | Uint8Array,
    options?: { qos?: QoSLevel; retain?: boolean; },
  ): Promise<void> => {
    const qos = options?.qos ?? QoS.AT_MOST_ONCE;
    const retain = options?.retain ?? false;
    const messageId = qos > 0 ? connection.nextMessageId() : undefined;

    connection.send({
      type: PacketType.PUBLISH,
      topic,
      payload: toUint8Array(payload),
      qos,
      retain,
      dup: false,
      messageId,
    });

    if (qos === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      if (messageId) pending.pub.set(messageId, { resolve, reject });
    });
  };
  const subscribe = (
    topic: string,
    qos: QoSLevel = QoS.AT_MOST_ONCE,
  ): Promise<number[]> => new Promise((resolve, reject) => {
    const messageId = connection.nextMessageId();

    pending.sub.set(messageId, { resolve, reject });

    connection.send({
      type: PacketType.SUBSCRIBE,
      messageId,
      subscriptions: [{ topic, qos }],
    });
  });

  const connect = (): Promise<void> => new Promise((resolve, reject) => {
    connection.open();
    connection.on("connect", () => resolve());
    connection.on("error", err => reject(err));
  });

  return {
    ...events,
    publish,
    subscribe,
    connection,
    isConnected: () => connection.isConnected(),
    connect,
    close: () => {
      log("closing from up above");
      connection.close();
    },
  };
};
