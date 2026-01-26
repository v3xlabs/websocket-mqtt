export const PacketType = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

export const PROTOCOL_NAME = "MQTT";
export const PROTOCOL_VERSION = 4; // MQTT version "4" actually refers to 3.1.1 (https://www.jensd.de/wordpress/?p=2667)

export const ConnectFlags = {
  CLEAN_SESSION: 0x02,
  WILL_FLAG: 0x04,
  WILL_QOS_0: 0x00,
  WILL_QOS_1: 0x08,
  WILL_QOS_2: 0x10,
  WILL_RETAIN: 0x20,
  PASSWORD: 0x40,
  USERNAME: 0x80,
} as const;

export const QoS = {
  AT_MOST_ONCE: 0,
  AT_LEAST_ONCE: 1,
  EXACTLY_ONCE: 2,
} as const;

export type QoSLevel = (typeof QoS)[keyof typeof QoS];

export const ConnackReturnCode = {
  ACCEPTED: 0,
  UNACCEPTABLE_PROTOCOL_VERSION: 1,
  IDENTIFIER_REJECTED: 2,
  SERVER_UNAVAILABLE: 3,
  BAD_USERNAME_OR_PASSWORD: 4,
  NOT_AUTHORIZED: 5,
} as const;

export const SubackReturnCode = {
  SUCCESS_QOS_0: 0,
  SUCCESS_QOS_1: 1,
  SUCCESS_QOS_2: 2,
  FAILURE: 0x80,
} as const;

export const DEFAULT_KEEPALIVE_SECONDS = 60;
