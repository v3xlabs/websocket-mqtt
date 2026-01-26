const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toUint8Array(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? textEncoder.encode(data) : data;
}

export function createPacketWriter(initialSize = 256) {
  let buffer = new Uint8Array(initialSize);
  let position = 0;

  /**
   * Ensures the buffer has enough capacity for the requested number of bytes.
   * If the buffer is too small, it doubles in size or expands to fit the needed bytes,
   * whichever is larger, and copies existing data to the new buffer.
   */
  function ensureCapacity(bytesNeeded: number): void {
    if (position + bytesNeeded > buffer.length) {
      const newSize = Math.max(buffer.length * 2, position + bytesNeeded);
      const newBuffer = new Uint8Array(newSize);

      newBuffer.set(buffer);
      buffer = newBuffer;
    }
  }

  const writer = {
    writeByte(value: number) {
      ensureCapacity(1);
      buffer[position++] = value;

      return writer;
    },

    writeUint16(value: number) {
      ensureCapacity(2);
      buffer[position++] = (value >> 8) & 0xff;
      buffer[position++] = value & 0xff;

      return writer;
    },

    writeBytes(data: Uint8Array) {
      ensureCapacity(data.length);
      buffer.set(data, position);
      position += data.length;

      return writer;
    },

    writeString(value: string) {
      const bytes = textEncoder.encode(value);

      writer.writeUint16(bytes.length);
      writer.writeBytes(bytes);

      return writer;
    },

    writeBinary(data: Uint8Array) {
      writer.writeUint16(data.length);
      writer.writeBytes(data);

      return writer;
    },

    writeVariableInt(value: number) {
      do {
        let byte = value % 128;

        value = Math.floor(value / 128);

        if (value > 0) byte |= 0x80;

        writer.writeByte(byte);
      } while (value > 0);

      return writer;
    },

    toUint8Array(): Uint8Array {
      return buffer.subarray(0, position);
    },

    get length(): number {
      return position;
    },
  };

  return writer;
}

export function createPacketReader(buffer: Uint8Array) {
  let position = 0;

  return {
    get remaining(): number {
      return buffer.length - position;
    },

    get position(): number {
      return position;
    },

    readByte(): number {
      return buffer[position++];
    },

    readUint16(): number {
      const value = (buffer[position] << 8) | buffer[position + 1];

      position += 2;

      return value;
    },

    readBytes(length: number): Uint8Array {
      const data = buffer.subarray(position, position + length);

      position += length;

      return data;
    },

    readString(): string {
      const length = (buffer[position] << 8) | buffer[position + 1];

      position += 2;
      const data = buffer.subarray(position, position + length);

      position += length;

      return textDecoder.decode(data);
    },

    readVariableInt(): number {
      let value = 0;
      let multiplier = 1;
      let byte: number;

      do {
        byte = buffer[position++];
        value += (byte & 0x7f) * multiplier;
        multiplier *= 128;
      } while (byte & 0x80);

      return value;
    },

    readRest(): Uint8Array {
      const data = buffer.subarray(position);

      position = buffer.length;

      return data;
    },
  };
}

export type PacketWriter = ReturnType<typeof createPacketWriter>;
export type PacketReader = ReturnType<typeof createPacketReader>;
