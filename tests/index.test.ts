import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import { connect as connectStandard, MqttClient as StandardMqttClient } from 'mqtt';
import { connect, connectAsync, MqttClient } from '../src';

const TEST_BROKER = 'wss://broker.itdata.nu/mqtt';

function generateTopic(): string {
    return `websocket-mqtt/test/${Date.now()}/${Math.random().toString(36).slice(2, 8)}`;
}

function waitForMessage(
    client: MqttClient | StandardMqttClient,
    expectedTopic?: string,
    timeout = 5000
): Promise<{ topic: string; payload: string }> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Message timeout')), timeout);
        client.on('message', (topic: string, payload: Buffer | Uint8Array) => {
            if (!expectedTopic || topic === expectedTopic) {
                clearTimeout(timer);
                const payloadStr =
                    payload instanceof Uint8Array
                        ? new TextDecoder().decode(payload)
                        : payload.toString();
                resolve({ topic, payload: payloadStr });
            }
        });
    });
}

describe('Connection Tests', () => {
    test('our library connects successfully', async () => {
        const client = await connectAsync(TEST_BROKER, {});
        expect(client.isConnected).toBe(true);
        await client.endAsync();
    });

    test('standard library connects successfully', async () => {
        const client = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => client.on('connect', () => resolve()));
        expect(client.connected).toBe(true);
        client.end();
    });

    test('both libraries connect with custom clientId', async () => {
        const clientId1 = `test-ours-${Date.now()}`;
        const clientId2 = `test-std-${Date.now()}`;

        const ours = await connectAsync(TEST_BROKER, { clientId: clientId1 });
        const std = connectStandard(TEST_BROKER, { clientId: clientId2 });
        await new Promise<void>((resolve) => std.on('connect', () => resolve()));

        expect(ours.isConnected).toBe(true);
        expect(std.connected).toBe(true);

        await ours.endAsync();
        std.end();
    });
});

describe('Cross-Library Communication', () => {
    let ourClient: MqttClient;
    let stdClient: StandardMqttClient;

    beforeEach(async () => {
        ourClient = await connectAsync(TEST_BROKER, {});
        stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));
    });

    afterEach(async () => {
        await ourClient.endAsync();
        stdClient.end();
    });

    test('our library publishes, standard library receives', async () => {
        const topic = generateTopic();
        const message = 'Hello from our library!';

        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, () => resolve());
        });

        const messagePromise = waitForMessage(stdClient, topic);
        await ourClient.publishAsync(topic, message);

        const received = await messagePromise;
        expect(received.topic).toBe(topic);
        expect(received.payload).toBe(message);
    });

    test('standard library publishes, our library receives', async () => {
        const topic = generateTopic();
        const message = 'Hello from standard library!';

        await ourClient.subscribeAsync(topic);

        const messagePromise = waitForMessage(ourClient, topic);
        stdClient.publish(topic, message);

        const received = await messagePromise;
        expect(received.topic).toBe(topic);
        expect(received.payload).toBe(message);
    });

    test('bidirectional communication', async () => {
        const topic1 = generateTopic();
        const topic2 = generateTopic();
        const message1 = 'Message from ours to standard';
        const message2 = 'Message from standard to ours';

        // Subscribe both
        await ourClient.subscribeAsync(topic2);
        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic1, () => resolve());
        });

        // Send messages in both directions
        const promise1 = waitForMessage(stdClient, topic1);
        const promise2 = waitForMessage(ourClient, topic2);

        await ourClient.publishAsync(topic1, message1);
        stdClient.publish(topic2, message2);

        const [received1, received2] = await Promise.all([promise1, promise2]);

        expect(received1.payload).toBe(message1);
        expect(received2.payload).toBe(message2);
    });
});

describe('QoS Behavior Comparison', () => {
    let ourClient: MqttClient;
    let stdClient: StandardMqttClient;

    beforeEach(async () => {
        ourClient = await connectAsync(TEST_BROKER, {});
        stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));
    });

    afterEach(async () => {
        await ourClient.endAsync();
        stdClient.end();
    });

    test('QoS 0: our library publishes, standard receives', async () => {
        const topic = generateTopic();
        const message = 'QoS 0 message';

        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, { qos: 0 }, () => resolve());
        });

        const messagePromise = waitForMessage(stdClient, topic);
        await ourClient.publishAsync(topic, message, { qos: 0 });

        const received = await messagePromise;
        expect(received.payload).toBe(message);
    });

    test('QoS 1: our library publishes, standard receives', async () => {
        const topic = generateTopic();
        const message = 'QoS 1 message';

        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, { qos: 1 }, () => resolve());
        });

        const messagePromise = waitForMessage(stdClient, topic);
        await ourClient.publishAsync(topic, message, { qos: 1 });

        const received = await messagePromise;
        expect(received.payload).toBe(message);
    });

    test('QoS 1: standard library publishes, our library receives', async () => {
        const topic = generateTopic();
        const message = 'QoS 1 from standard';

        await ourClient.subscribeAsync(topic, 1);

        const messagePromise = waitForMessage(ourClient, topic);
        await new Promise<void>((resolve, reject) => {
            stdClient.publish(topic, message, { qos: 1 }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const received = await messagePromise;
        expect(received.payload).toBe(message);
    });
});

describe('Subscribe Behavior Comparison', () => {
    let ourClient: MqttClient;
    let stdClient: StandardMqttClient;

    beforeEach(async () => {
        ourClient = await connectAsync(TEST_BROKER, {});
        stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));
    });

    afterEach(async () => {
        await ourClient.endAsync();
        stdClient.end();
    });

    test('both libraries receive same message on same topic', async () => {
        const topic = generateTopic();
        const message = 'Shared message';
        const publisher = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => publisher.on('connect', () => resolve()));

        // Both subscribe
        await ourClient.subscribeAsync(topic);
        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, () => resolve());
        });

        // Wait a bit for subscriptions to be established
        await new Promise((resolve) => setTimeout(resolve, 100));

        const promise1 = waitForMessage(ourClient, topic);
        const promise2 = waitForMessage(stdClient, topic);

        publisher.publish(topic, message);

        const [received1, received2] = await Promise.all([promise1, promise2]);

        expect(received1.payload).toBe(message);
        expect(received2.payload).toBe(message);

        publisher.end();
    });
});

describe('Message Ordering', () => {
    let ourClient: MqttClient;
    let stdClient: StandardMqttClient;

    beforeEach(async () => {
        ourClient = await connectAsync(TEST_BROKER, {});
        stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));
    });

    afterEach(async () => {
        await ourClient.endAsync();
        stdClient.end();
    });

    test('messages arrive in order when published by our library', async () => {
        const topic = generateTopic();
        const messages = ['first', 'second', 'third', 'fourth', 'fifth'];
        const received: string[] = [];

        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, () => resolve());
        });

        const allReceived = new Promise<void>((resolve) => {
            stdClient.on('message', (_topic: string, payload: Buffer) => {
                received.push(payload.toString());
                if (received.length === messages.length) {
                    resolve();
                }
            });
        });

        for (const msg of messages) {
            await ourClient.publishAsync(topic, msg);
        }

        await allReceived;
        expect(received).toEqual(messages);
    });

    test('messages arrive in order when published by standard library', async () => {
        const topic = generateTopic();
        const messages = ['first', 'second', 'third', 'fourth', 'fifth'];
        const received: string[] = [];

        await ourClient.subscribeAsync(topic);

        const allReceived = new Promise<void>((resolve) => {
            ourClient.on('message', (_topic: unknown, payload: unknown) => {
                const payloadStr =
                    payload instanceof Uint8Array
                        ? new TextDecoder().decode(payload)
                        : String(payload);
                received.push(payloadStr);
                if (received.length === messages.length) {
                    resolve();
                }
            });
        });

        for (const msg of messages) {
            stdClient.publish(topic, msg);
        }

        await allReceived;
        expect(received).toEqual(messages);
    });
});

describe('Binary Payload Handling', () => {
    let ourClient: MqttClient;
    let stdClient: StandardMqttClient;

    beforeEach(async () => {
        ourClient = await connectAsync(TEST_BROKER, {});
        stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));
    });

    afterEach(async () => {
        await ourClient.endAsync();
        stdClient.end();
    });

    test('binary data from our library to standard', async () => {
        const topic = generateTopic();
        const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

        await new Promise<void>((resolve) => {
            stdClient.subscribe(topic, () => resolve());
        });

        const messagePromise = new Promise<Buffer>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
            stdClient.on('message', (_topic: string, payload: Buffer) => {
                clearTimeout(timer);
                resolve(payload);
            });
        });

        await ourClient.publishAsync(topic, binaryData);

        const received = await messagePromise;
        expect(Array.from(received)).toEqual(Array.from(binaryData));
    });

    test('binary data from standard library to ours', async () => {
        const topic = generateTopic();
        const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

        await ourClient.subscribeAsync(topic);

        const messagePromise = new Promise<Uint8Array>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
            ourClient.on('message', (_topic: unknown, payload: unknown) => {
                clearTimeout(timer);
                resolve(payload as Uint8Array);
            });
        });

        stdClient.publish(topic, binaryData);

        const received = await messagePromise;
        expect(Array.from(received)).toEqual(Array.from(binaryData));
    });
});

describe('Retained Messages', () => {
    test('our library publishes retained, standard receives on subscribe', async () => {
        const topic = generateTopic();
        const message = 'Retained message';

        const publisher = await connectAsync(TEST_BROKER, {});
        await publisher.publishAsync(topic, message, { retain: true });
        await publisher.endAsync();

        // Small delay to ensure broker has processed retained message
        await new Promise((resolve) => setTimeout(resolve, 200));

        const subscriber = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => subscriber.on('connect', () => resolve()));

        const messagePromise = waitForMessage(subscriber, topic);
        await new Promise<void>((resolve) => {
            subscriber.subscribe(topic, () => resolve());
        });

        const received = await messagePromise;
        expect(received.payload).toBe(message);

        // Clean up retained message
        await new Promise<void>((resolve) => {
            subscriber.publish(topic, '', { retain: true }, () => resolve());
        });
        subscriber.end();
    });
});

describe('Error Handling Comparison', () => {
    test('both libraries handle disconnect gracefully', async () => {
        const ourClient = await connectAsync(TEST_BROKER, {});
        const stdClient = connectStandard(TEST_BROKER, {});
        await new Promise<void>((resolve) => stdClient.on('connect', () => resolve()));

        // Both should disconnect without throwing
        await expect(ourClient.endAsync()).resolves.toBeUndefined();
        await new Promise<void>((resolve) => {
            stdClient.end(false, {}, () => resolve());
        });
    });
});
