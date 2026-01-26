import { createMqttClient, type MqttClient } from "./client";
import { QoSLevel } from "./packets";

export { createMqttClient, type MqttClient } from "./client";
export type { MqttPacket, QoSLevel } from "./packets";
export { QoS } from "./packets";

export type ConnectionOptions = {
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
};

export function connect(
  url: string,
  options: ConnectionOptions = {},
): MqttClient {
  const client = createMqttClient({ url, ...options });

  client.connect();

  return client;
}

export function connectAsync(
  url: string,
  options: ConnectionOptions = {},
): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = createMqttClient({ url, ...options });

    const onConnect = () => {
      client.off("error", onError);
      resolve(client);
    };

    const onError = (err: unknown) => {
      client.off("connect", onConnect);
      reject(err);
    };

    client.on("connect", onConnect);
    client.on("error", onError);
    client.connect();
  });
}
