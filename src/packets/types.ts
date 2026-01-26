import type { QoSLevel } from "./constants";

export interface ConnectionOptions {
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
}
export interface BasePacket {
  type: number;
}

// CONNECT Packet (Client => Broker)
export interface ConnectPacket extends BasePacket {
  type: 1;
  clientId: string;
  username?: string;
  password?: string;
  keepalive: number;
  clean: boolean;
  will?: {
    topic: string;
    payload: Uint8Array;
    qos: QoSLevel;
    retain: boolean;
  };
}

// CONNACK Packet (Broker => Client)
export interface ConnackPacket extends BasePacket {
  type: 2;
  sessionPresent: boolean;
  returnCode: number;
}

// PUBLISH Packet (Both directions)
export interface PublishPacket extends BasePacket {
  type: 3;
  topic: string;
  payload: Uint8Array;
  qos: QoSLevel;
  retain: boolean;
  dup: boolean;
  messageId?: number; // Required for QoS > 0
}

// PUBACK Packet (Both directions)
export interface PubackPacket extends BasePacket {
  type: 4;
  messageId: number;
}

// SUBSCRIBE Packet (Client => Broker)
export interface SubscribePacket extends BasePacket {
  type: 8;
  messageId: number;
  subscriptions: Array<{
    topic: string;
    qos: QoSLevel;
  }>;
}

// SUBACK Packet (Broker => Client)
export interface SubackPacket extends BasePacket {
  type: 9;
  messageId: number;
  granted: number[]; // Array of granted QoS levels or 0x80 for failure
}

// PINGREQ Packet (Client => Broker)
export interface PingreqPacket extends BasePacket {
  type: 12;
}

// PINGRESP Packet (Broker => Client)
export interface PingrespPacket extends BasePacket {
  type: 13;
}

// DISCONNECT Packet (Client => Broker)
export interface DisconnectPacket extends BasePacket {
  type: 14;
}

export type MqttPacket =
  | ConnectPacket
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | SubscribePacket
  | SubackPacket
  | PingreqPacket
  | PingrespPacket
  | DisconnectPacket;

export type IncomingPacket =
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | SubackPacket
  | PingrespPacket;
