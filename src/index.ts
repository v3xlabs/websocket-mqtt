import { createMqttClient, type MqttClient } from './client';

export type { ConnectionOptions, MqttPacket, QoSLevel } from './packets';
export { QoS } from './packets';
export { createMqttClient, type MqttClient } from './client';

export interface ConnectOptions {
    clientId?: string;
    username?: string;
    password?: string;
    keepalive?: number;
    clean?: boolean;
    will?: {
        topic: string;
        payload: string | Uint8Array;
        qos?: 0 | 1 | 2;
        retain?: boolean;
    };
}

export function connect(url: string, options: ConnectOptions = {}): MqttClient {
    const client = createMqttClient({ url, ...options });
    client.connect();
    return client;
}

export function connectAsync(
    url: string,
    options: ConnectOptions = {}
): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
        const client = createMqttClient({ url, ...options });

        const onConnect = () => {
            client.off('error', onError);
            resolve(client);
        };

        const onError = (err: unknown) => {
            client.off('connect', onConnect);
            reject(err);
        };

        client.on('connect', onConnect);
        client.on('error', onError);
        client.connect();
    });
}
