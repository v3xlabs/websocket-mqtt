import { test, expect, describe } from 'vitest';
import {
    encodeConnect,
    encodeSubscribe,
    encodePublish,
    encodePuback,
    encodePingreq,
    encodeDisconnect,
    decode,
    PacketType,
} from '../src/packets';
import { createPacketWriter, createPacketReader } from '../src/utils/buffer';

describe('Buffer Utilities', () => {
    test('writer/reader uint16', () => {
        const values = [0, 1, 255, 256, 65535];
        for (const value of values) {
            const writer = createPacketWriter();
            writer.writeUint16(value);
            const encoded = writer.toUint8Array();
            expect(encoded.length).toBe(2);

            const reader = createPacketReader(encoded);
            expect(reader.readUint16()).toBe(value);
        }
    });

    test('writer/reader variable int', () => {
        const testCases = [
            { value: 0, expectedBytes: 1 },
            { value: 127, expectedBytes: 1 },
            { value: 128, expectedBytes: 2 },
            { value: 16383, expectedBytes: 2 },
            { value: 16384, expectedBytes: 3 },
            { value: 2097151, expectedBytes: 3 },
            { value: 2097152, expectedBytes: 4 },
            { value: 268435455, expectedBytes: 4 },
        ];

        for (const { value, expectedBytes } of testCases) {
            const writer = createPacketWriter();
            writer.writeVariableInt(value);
            const encoded = writer.toUint8Array();
            expect(encoded.length).toBe(expectedBytes);

            const reader = createPacketReader(encoded);
            expect(reader.readVariableInt()).toBe(value);
        }
    });

    test('writer/reader string', () => {
        const testStrings = ['', 'hello', 'Hello, 世界!', 'a'.repeat(1000)];

        for (const str of testStrings) {
            const writer = createPacketWriter();
            writer.writeString(str);
            const encoded = writer.toUint8Array();

            const reader = createPacketReader(encoded);
            expect(reader.readString()).toBe(str);
        }
    });
});

describe('Packet Encoding', () => {
    test('encodeConnect', () => {
        const packet = encodeConnect({
            type: 1,
            clientId: 'test-client',
            keepalive: 60,
            clean: true,
        });

        expect(packet[0]).toBe(PacketType.CONNECT << 4);
        const packetStr = new TextDecoder().decode(packet);
        expect(packetStr).toContain('MQTT');
        expect(packetStr).toContain('test-client');
    });

    test('encodeConnect with username and password', () => {
        const packet = encodeConnect({
            type: 1,
            clientId: 'test-client',
            username: 'user',
            password: 'pass',
            keepalive: 60,
            clean: true,
        });

        const packetStr = new TextDecoder().decode(packet);
        expect(packetStr).toContain('user');
        expect(packetStr).toContain('pass');
    });

    test('encodeSubscribe', () => {
        const packet = encodeSubscribe({
            type: 8,
            messageId: 1,
            subscriptions: [{ topic: 'test/topic', qos: 0 }],
        });

        expect(packet[0]).toBe((PacketType.SUBSCRIBE << 4) | 0x02);
    });

    test('encodePublish QoS 0', () => {
        const packet = encodePublish({
            type: 3,
            topic: 'test/topic',
            payload: new TextEncoder().encode('hello'),
            qos: 0,
            retain: false,
            dup: false,
        });

        expect(packet[0] >> 4).toBe(PacketType.PUBLISH);
        expect((packet[0] >> 1) & 0x03).toBe(0);
    });

    test('encodePublish QoS 1', () => {
        const packet = encodePublish({
            type: 3,
            topic: 'test/topic',
            payload: new TextEncoder().encode('hello'),
            qos: 1,
            retain: false,
            dup: false,
            messageId: 42,
        });

        expect((packet[0] >> 1) & 0x03).toBe(1);
    });

    test('encodePublish with retain flag', () => {
        const packet = encodePublish({
            type: 3,
            topic: 'test/topic',
            payload: new TextEncoder().encode('hello'),
            qos: 0,
            retain: true,
            dup: false,
        });

        expect(packet[0] & 0x01).toBe(1);
    });

    test('encodePuback', () => {
        const packet = encodePuback({
            type: 4,
            messageId: 123,
        });

        expect(packet[0]).toBe(PacketType.PUBACK << 4);
        expect(packet.length).toBe(4);
    });

    test('encodePingreq', () => {
        const packet = encodePingreq();
        expect(packet[0]).toBe(PacketType.PINGREQ << 4);
        expect(packet[1]).toBe(0);
        expect(packet.length).toBe(2);
    });

    test('encodeDisconnect', () => {
        const packet = encodeDisconnect();
        expect(packet[0]).toBe(PacketType.DISCONNECT << 4);
        expect(packet[1]).toBe(0);
        expect(packet.length).toBe(2);
    });
});

describe('Packet Decoding', () => {
    test('decode CONNACK', () => {
        const bytes = new Uint8Array([0x20, 0x02, 0x00, 0x00]);
        const result = decode(bytes);

        expect(result).not.toBeNull();
        expect(result!.packet.type).toBe(PacketType.CONNACK);
        expect(result!.bytesConsumed).toBe(4);

        const connack = result!.packet as { sessionPresent: boolean; returnCode: number };
        expect(connack.sessionPresent).toBe(false);
        expect(connack.returnCode).toBe(0);
    });

    test('decode CONNACK with session present', () => {
        const bytes = new Uint8Array([0x20, 0x02, 0x01, 0x00]);
        const result = decode(bytes);

        const connack = result!.packet as { sessionPresent: boolean; returnCode: number };
        expect(connack.sessionPresent).toBe(true);
    });

    test('decode SUBACK', () => {
        const bytes = new Uint8Array([0x90, 0x03, 0x00, 0x01, 0x00]);
        const result = decode(bytes);

        expect(result).not.toBeNull();
        expect(result!.packet.type).toBe(PacketType.SUBACK);

        const suback = result!.packet as { messageId: number; granted: number[] };
        expect(suback.messageId).toBe(1);
        expect(suback.granted).toEqual([0]);
    });

    test('decode PUBLISH QoS 0', () => {
        const fixedBytes = new Uint8Array([0x30, 0x04, 0x00, 0x01, 0x61, 0x62]);
        const result = decode(fixedBytes);

        expect(result).not.toBeNull();
        expect(result!.packet.type).toBe(PacketType.PUBLISH);

        const publish = result!.packet as {
            topic: string;
            payload: Uint8Array;
            qos: number;
        };
        expect(publish.topic).toBe('a');
        expect(publish.qos).toBe(0);
    });

    test('decode PUBACK', () => {
        const bytes = new Uint8Array([0x40, 0x02, 0x00, 0x2a]);
        const result = decode(bytes);

        expect(result).not.toBeNull();
        expect(result!.packet.type).toBe(PacketType.PUBACK);

        const puback = result!.packet as { messageId: number };
        expect(puback.messageId).toBe(42);
    });

    test('decode PINGRESP', () => {
        const bytes = new Uint8Array([0xd0, 0x00]);
        const result = decode(bytes);

        expect(result).not.toBeNull();
        expect(result!.packet.type).toBe(PacketType.PINGRESP);
        expect(result!.bytesConsumed).toBe(2);
    });

    test('decode returns null for incomplete packet', () => {
        const bytes = new Uint8Array([0x20, 0x02, 0x00]);
        const result = decode(bytes);
        expect(result).toBeNull();
    });

    test('decode returns null for empty buffer', () => {
        const bytes = new Uint8Array([]);
        const result = decode(bytes);
        expect(result).toBeNull();
    });
});
