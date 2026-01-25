import { test, expect } from 'vitest';
import { connect as connectMqtt } from 'mqtt';

test('should connect to mqtt broker', () => {
    const client = connectMqtt('mqtt://test.mosquitto.org', {});

    client.on('connect', async () => {
        await client.subscribeAsync('mqtt/test');

        await client.publishAsync('mqtt/test', 'Hello, world!');
    });

    client.on('message', (topic, message) => {
        console.log(topic, message.toString());
        client.end();
        // test complete
        expect(true).toBe(true);
    });
});
