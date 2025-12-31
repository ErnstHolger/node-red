# node-red-contrib-connect

Node-RED nodes for [AVEVA Connect](https://www.aveva.com/en/products/aveva-connect/) (Data Hub, OMF, Streams).

## Features

- **OAuth2 Authentication** with automatic token refresh
- **OMF Write** - Send data using OSIsoft Message Format
- **Streams Read** - Read data from streams with multiple modes
- **Events** - Subscribe to stream updates with polling
- **Full API support** for AVEVA Data Hub

## Installation

### Via Node-RED Palette Manager

1. Open Node-RED
2. Go to **Menu** > **Manage palette** > **Install**
3. Search for `node-red-contrib-connect`
4. Click **Install**

### Via npm

```bash
cd ~/.node-red
npm install node-red-contrib-connect
```

Then restart Node-RED.

## Configuration

### Setting up AVEVA Connect credentials

1. Log in to your AVEVA Connect portal
2. Navigate to **Developer Tools** > **Client Credentials**
3. Create a new client with appropriate permissions:
   - For OMF: `ocsapi.data.readwrite`
   - For Streams: `ocsapi.data.read` or `ocsapi.data.readwrite`
4. Note the **Client ID** and **Client Secret**

### Configuration Node Properties

| Property | Description |
|----------|-------------|
| Resource URL | AVEVA Connect base URL (default: `https://datahub.connect.aveva.com`) |
| Tenant ID | Your AVEVA Connect tenant ID |
| Namespace ID | The namespace to work with |
| Client ID | OAuth2 client ID |
| Client Secret | OAuth2 client secret |
| Token URL | OAuth2 token endpoint |

## Nodes

### OMF Write

Writes data to AVEVA Connect using the OSIsoft Message Format (OMF).

**OMF Message Types:**
- `type` - Define data types (schema)
- `container` - Define streams (containers)
- `data` - Send actual data values

**Example - Define Type:**
```javascript
msg.payload = [{
    "id": "Temperature",
    "type": "object",
    "classification": "dynamic",
    "properties": {
        "Timestamp": { "type": "string", "isindex": true, "format": "date-time" },
        "Value": { "type": "number", "format": "float64" }
    }
}];
msg.omfMessageType = "type";
```

**Example - Define Container:**
```javascript
msg.payload = [{
    "id": "Sensor1",
    "typeid": "Temperature"
}];
msg.omfMessageType = "container";
```

**Example - Send Data:**
```javascript
msg.payload = [{
    "containerid": "Sensor1",
    "values": [{
        "Timestamp": new Date().toISOString(),
        "Value": 23.5
    }]
}];
msg.omfMessageType = "data";
```

### Streams Read

Reads data from AVEVA Connect streams.

**Read Modes:**
- `last` - Get the most recent value
- `first` - Get the oldest value
- `range` - Get values between start and end timestamps
- `window` - Get the last N values
- `interpolated` - Get interpolated values at regular intervals

**Example - Read Last Value:**
```javascript
msg.streamId = "Sensor1";
msg.readMode = "last";
```

**Example - Read Range:**
```javascript
msg.streamId = "Sensor1";
msg.readMode = "range";
msg.startIndex = "2024-01-01T00:00:00Z";
msg.endIndex = "2024-01-02T00:00:00Z";
```

### Events

Subscribes to stream updates and emits messages when new data arrives.

**Control Commands:**
- `msg.payload = "start"` - Start polling
- `msg.payload = "stop"` - Stop polling
- `msg.payload = "status"` - Get polling status

**Example - Start with Dynamic Streams:**
```javascript
msg.payload = "start";
msg.streamIds = ["Sensor1", "Sensor2", "Sensor3"];
```

**Output Message Format:**
```javascript
{
    topic: "Sensor1",        // Stream ID
    payload: { ... },        // New data from stream
    streamId: "Sensor1",
    timestamp: "2024-...",
    eventType: "data"
}
```

## OMF Overview

OSIsoft Message Format (OMF) is a JSON-based format for sending time-series data. The typical workflow is:

1. **Define Types** - Create a schema for your data
2. **Define Containers** - Create streams that use the types
3. **Send Data** - Send actual values to the containers

For more information, see the [OMF Specification](https://docs.osisoft.com/bundle/omf/page/omf-index.html).

## Compatibility

- **Node-RED**: >= 2.0.0
- **Node.js**: >= 14.0.0
- **AVEVA Connect**: Data Hub API v1

## Troubleshooting

### Authentication Errors

1. Verify your Client ID and Client Secret are correct
2. Ensure the client has the necessary permissions
3. Check that the Token URL matches your region

### Connection Issues

1. Verify the Resource URL is correct for your region
2. Check network connectivity to AVEVA Connect
3. Ensure your tenant and namespace IDs are correct

### OMF Errors

1. Verify your type definitions are valid JSON
2. Ensure container IDs match existing containers
3. Check that data values match the defined types

## License

MIT

## Author

**Holger Amort**

## Links

- [AVEVA Connect Documentation](https://docs.aveva.com/)
- [OMF Specification](https://docs.osisoft.com/bundle/omf/page/omf-index.html)
- [GitHub Repository](https://github.com/ErnstHolger/node-red)
- [Report Issues](https://github.com/ErnstHolger/node-red/issues)
