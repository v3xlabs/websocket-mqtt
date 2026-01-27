import {
  createPacketWriter,
  type PacketWriter,
  toUint8Array,
} from "../utils/buffer";
import {
  ConnectFlags,
  DEFAULT_KEEPALIVE_SECONDS,
  PacketType,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
} from "./constants";
import type {
  ConnectPacket,
  OutgoingPacket,
  PubackPacket,
  PublishPacket,
  SubscribePacket,
} from "./types";

function writePacket(
  type: number,
  flags: number,
  writeBody: (writer: PacketWriter) => void,
): Uint8Array {
  const body = createPacketWriter();

  writeBody(body);

  const packet = createPacketWriter();

  packet.writeByte((type << 4) | (flags & 0x0f));
  packet.writeVariableInt(body.length);
  packet.writeBytes(body.toUint8Array());

  return packet.toUint8Array();
}

export function encodeConnect(packet: ConnectPacket): Uint8Array {
  return writePacket(PacketType.CONNECT, 0, (writer) => {
    // Variable header
    writer.writeString(PROTOCOL_NAME);
    writer.writeByte(PROTOCOL_VERSION);

    // Connect flags
    let flags = 0;

    if (packet.clean) flags |= ConnectFlags.CLEAN_SESSION;

    if (packet.will) {
      flags |= ConnectFlags.WILL_FLAG;
      flags |= packet.will.qos << 3;

      if (packet.will.retain) flags |= ConnectFlags.WILL_RETAIN;
    }

    if (packet.password !== undefined) flags |= ConnectFlags.PASSWORD;

    if (packet.username !== undefined) flags |= ConnectFlags.USERNAME;

    writer.writeByte(flags);
    writer.writeUint16(packet.keepalive ?? DEFAULT_KEEPALIVE_SECONDS);

    // Payload
    writer.writeString(packet.clientId);

    if (packet.will) {
      writer.writeString(packet.will.topic);
      writer.writeBinary(packet.will.payload);
    }

    if (packet.username !== undefined) writer.writeString(packet.username);

    if (packet.password !== undefined) writer.writeString(packet.password);
  });
}

export function encodeSubscribe(packet: SubscribePacket): Uint8Array {
  return writePacket(PacketType.SUBSCRIBE, 0x02, (writer) => {
    writer.writeUint16(packet.messageId);

    for (const sub of packet.subscriptions) {
      writer.writeString(sub.topic);
      writer.writeByte(sub.qos);
    }
  });
}

export function encodePublish(packet: PublishPacket): Uint8Array {
  let flags = 0;

  if (packet.dup) flags |= 0x08;

  flags |= (packet.qos & 0x03) << 1;

  if (packet.retain) flags |= 0x01;

  return writePacket(PacketType.PUBLISH, flags, (writer) => {
    writer.writeString(packet.topic);

    if (packet.qos > 0 && packet.messageId !== undefined) {
      writer.writeUint16(packet.messageId);
    }

    writer.writeBytes(toUint8Array(packet.payload));
  });
}

export function encodePuback(packet: PubackPacket): Uint8Array {
  return writePacket(PacketType.PUBACK, 0, (writer) => {
    writer.writeUint16(packet.messageId);
  });
}

export function encodePingreq(): Uint8Array {
  return new Uint8Array([PacketType.PINGREQ << 4, 0]);
}

export function encodeDisconnect(): Uint8Array {
  return new Uint8Array([PacketType.DISCONNECT << 4, 0]);
}

export const encodePacket = (packet: OutgoingPacket): Uint8Array => {
  switch (packet.type) {
    case PacketType.CONNECT:
      return encodeConnect(packet);
    case PacketType.SUBSCRIBE:
      return encodeSubscribe(packet);
    case PacketType.PUBLISH:
      return encodePublish(packet);
    case PacketType.PUBACK:
      return encodePuback(packet);
    // case PacketType.DISCONNECT:
    //   return encodeDisconnect();
    // case PacketType.PINGREQ:
    //   return encodePingreq();
    default:
      throw new Error(`Unknown packet type: ${packet["type"]}`);
  }
};
