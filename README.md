# websocket-mqtt

A lightweight zero-dependency MQTT WebSocket implementation.

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
