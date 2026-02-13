import { createPacketReader, type PacketReader } from "../utils/buffer.js";
import { PacketType } from "./constants.js";
import type {
  ConnackPacket,
  IncomingPacket,
  PingrespPacket,
  PubackPacket,
  PublishPacket,
  SubackPacket,
} from "./types.js";

export interface DecodeResult {
  packet: IncomingPacket;
  bytesConsumed: number;
}

export const decode = (bytes: Uint8Array): DecodeResult | null => {
  // Preserve public API semantics: incomplete packets decode to null.
  // eslint-disable-next-line unicorn/no-null
  if (bytes.length < 2) return null;

  const reader = createPacketReader(bytes);
  const firstByte = reader.readByte();
  const packetType = firstByte >> 4;
  const flags = firstByte & 0x0F;

  const remainingLength = reader.readVariableInt();
  const headerLength = reader.position;
  const totalLength = headerLength + remainingLength;

  // eslint-disable-next-line unicorn/no-null
  if (bytes.length < totalLength) return null;

  const payload = reader.readBytes(remainingLength);
  const payloadReader = createPacketReader(payload);

  let packet: IncomingPacket;

  switch (packetType) {
    case PacketType.CONNACK: {
      packet = decodeConnack(payloadReader);
      break;
    }
    case PacketType.SUBACK: {
      packet = decodeSuback(payloadReader);
      break;
    }
    case PacketType.PUBLISH: {
      packet = decodePublish(payloadReader, flags);
      break;
    }
    case PacketType.PUBACK: {
      packet = decodePuback(payloadReader);
      break;
    }
    case PacketType.PINGRESP: {
      packet = { type: PacketType.PINGRESP } as PingrespPacket;
      break;
    }
    default: {
      throw new Error(`Unknown MQTT packet type: ${packetType}`);
    }
  }

  return { packet, bytesConsumed: totalLength };
};

const decodeConnack = (reader: PacketReader): ConnackPacket => {
  const flags = reader.readByte();

  return {
    type: PacketType.CONNACK,
    sessionPresent: (flags & 0x01) === 1,
    returnCode: reader.readByte(),
  };
};

const decodeSuback = (reader: PacketReader): SubackPacket => {
  const messageId = reader.readUint16();
  const granted: number[] = [];

  while (reader.remaining > 0) {
    granted.push(reader.readByte());
  }

  return { type: PacketType.SUBACK, messageId, granted };
};

const decodePublish = (reader: PacketReader, flags: number): PublishPacket => {
  const topic = reader.readString();
  const qos = ((flags >> 1) & 0x03) as 0 | 1 | 2;
  const messageId = qos > 0 ? reader.readUint16() : undefined;

  return {
    type: PacketType.PUBLISH,
    topic,
    payload: reader.readRest(),
    qos,
    retain: (flags & 0x01) !== 0,
    dup: (flags & 0x08) !== 0,
    messageId,
  };
};

const decodePuback = (reader: PacketReader): PubackPacket =>
  ({ type: PacketType.PUBACK, messageId: reader.readUint16() });

export const decodeAll = (bytes: Uint8Array): {
  packets: IncomingPacket[];
  remaining: Uint8Array;
} => {
  const packets: IncomingPacket[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const result = decode(bytes.subarray(offset));

    if (!result) break;

    packets.push(result.packet);
    offset += result.bytesConsumed;
  }

  return { packets, remaining: bytes.subarray(offset) };
};
