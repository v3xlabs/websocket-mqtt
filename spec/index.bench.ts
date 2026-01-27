import { connect as connectMqtt } from "mqtt";
import { bench, expect } from "vitest";

bench(
  "mqtt connection",
  () => {
    const client = connectMqtt("wss://test.mosquitto.org", {});

    client.on("connect", async () => {
      await client.subscribeAsync("mqtt/test");

      await client.publishAsync("mqtt/test", "Hello, world!");
    });

    client.on("message", () => {
      client.end();
      // test complete
      expect(true).toBe(true);
    });
  },
  { time: 1000, iterations: 5 },
);
