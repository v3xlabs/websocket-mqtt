<p align="center">
  <img width="1660" height="360" alt="websocket-mqtt" src="https://github.com/user-attachments/assets/8e23d640-c84e-400f-9895-61f5876fab3b" />
</p>

<p align="center">
A lightweight zero-dependency MQTT WebSocket implementation.
</p>

<p align="center">
    <a href="#"><img src="https://img.shields.io/github/actions/workflow/status/v3xlabs/websocket-mqtt/verify.yml?style=flat" alt="Tests: Passing"></a>
    <a href="#"><img src="https://img.shields.io/npm/d18m/websocket-mqtt?style=flat" alt="Tests: Passing"></a>
    <a href="#"><img src="https://img.shields.io/badge/Tests-Passing-lime?style=flat&color=63ba83" alt="Tests: Passing"></a>
    <a href="#"><img src="https://img.shields.io/badge/License-LGPL--3.0-hotpink?style=flat" alt="License: LGPL-3.0"></a>
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
