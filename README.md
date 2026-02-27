<p align="center">
  <img width="1660" height="360" alt="websocket-mqtt" src="https://github.com/user-attachments/assets/8e23d640-c84e-400f-9895-61f5876fab3b" />
</p>

<p align="center">
A lightweight zero-dependency MQTT WebSocket implementation.
</p>

## Features

- Zero-dependency
- Last-will support
- QoS support
- MQTT 3.1.1 support

## Installation

```
pnpm install websocket-mqtt
```

## Usage

```typescript
import { createMqtt } from "websocket-mqtt";

const client = createMqtt({
  url: "wss://example.com/mqtt",
});

await client.connect();

client.on("message", (topic, payload) => {
  console.log(topic, payload);
});

await client.subscribe("topic");

await client.publish("topic", "message");

await client.close();
```

## Attribution

We want to thank the incredible work done by [MQTT.js](https://github.com/mqttjs/MQTT.js/) and [eclipse-paho](https://github.com/eclipse-paho/paho.mqtt.javascript).
