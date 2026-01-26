import { test, expect, bench } from 'vitest';
import { connect as connectMqtt } from 'mqtt';

bench('mqtt connection', () => {
    const client = connectMqtt('wss://test.mosquitto.org', {});

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
}, { time: 1000, iterations: 5 });