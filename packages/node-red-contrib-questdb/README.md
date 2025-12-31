# node-red-contrib-questdb

Node-RED nodes for writing data to [QuestDB](https://questdb.io/) time-series database using the Influx Line Protocol (ILP).

## Features

- **High-performance writes** using QuestDB's native ILP protocol
- **Connection pooling** with automatic reconnection
- **Multiple protocols**: HTTP, HTTPS, TCP, TCPS
- **Authentication**: Basic auth and Bearer token support
- **TLS/SSL**: Full TLS support with certificate verification options
- **Flexible data mapping**: Map message fields to QuestDB columns
- **Type support**: Symbols, floats, integers, longs, booleans, strings, timestamps, arrays, and decimals
- **Auto-flush**: Configurable automatic flushing by row count or time interval
- **Examples included**: Ready-to-use flow examples

## Installation

### Via Node-RED Palette Manager

1. Open Node-RED
2. Go to **Menu** > **Manage palette** > **Install**
3. Search for `node-red-contrib-questdb`
4. Click **Install**

### Via npm

```bash
cd ~/.node-red
npm install node-red-contrib-questdb
```

Then restart Node-RED.

## Nodes

### QuestDB Write

Writes data to QuestDB using the ILP protocol.

#### Configuration

**Connection Settings:**
- **Protocol**: HTTP (default), HTTPS, TCP, or TCPS
- **Host**: QuestDB server hostname or IP
- **Port**: 9000 (HTTP) or 9009 (TCP)

**Security Settings:**
- **Enable Auth**: Toggle authentication
- **Auth Type**: Username/Password or Bearer Token
- **TLS Verify**: Verify server certificate (for HTTPS/TCPS)

**Advanced Settings:**
- **Auto Flush**: Enable automatic flushing
- **Flush Rows**: Number of rows before auto-flush (default: 75000)
- **Flush Interval**: Time interval for auto-flush in ms (default: 1000)
- **Request Timeout**: HTTP request timeout in ms
- **Buffer Size**: Initial and maximum buffer sizes

#### Input Message Format

```javascript
msg.topic = "table_name";
msg.payload = {
    symbols: {
        tag_name: "sensor1",      // Indexed string columns
        location: "warehouse"
    },
    columns: {
        temperature: 23.5,        // Auto-detected as float
        humidity: 65,             // Auto-detected as float
        status: "active",         // String column
        alert: true               // Boolean column
    },
    timestamp: Date.now()         // Optional: milliseconds or Date object
};
```

#### Explicit Type Specification

For precise control over column types:

```javascript
msg.payload = {
    symbols: { device: "sensor1" },
    columns: {
        value: { value: 123456789, type: "long" },
        price: { value: "123.456789", type: "decimal" },
        readings: { value: [1.1, 2.2, 3.3], type: "array", elementType: "double" }
    },
    timestamp: Date.now()
};
```

**Supported Types:**
- `int` / `integer` - 32-bit signed integer
- `long` - 64-bit signed integer
- `float` - 32-bit floating point
- `double` - 64-bit floating point
- `decimal` - Arbitrary precision decimal
- `string` - Text value
- `boolean` - true/false
- `timestamp` - Date/time value
- `array` - Array with auto-detected element type
- `array_double` - Array of doubles
- `array_long` - Array of longs
- `array_string` - Array of strings

### QuestDB Mapper

Maps incoming message fields to QuestDB ILP structure. Useful for transforming data from various sources.

#### Configuration

- **Table Name**: Target table (or use `msg.topic`)
- **Timestamp Field**: Path to timestamp field in message
- **Symbol Mappings**: Map source fields to QuestDB symbols
- **Column Mappings**: Map source fields to columns with type conversion

#### Example

Input message:
```javascript
{
    topic: "sensors",
    payload: {
        device: "sensor1",
        temp: 23.5,
        readings: [1.1, 2.2, 3.3],
        ts: 1699999999000
    }
}
```

With mappings:
- Symbol: `payload.device` → `device_id`
- Column: `payload.temp` → `temperature` (double)
- Column: `payload.readings` → `values` (array_double)
- Timestamp: `payload.ts`

Output:
```javascript
{
    topic: "sensors",
    payload: {
        symbols: { device_id: "sensor1" },
        columns: {
            temperature: { value: 23.5, type: "double" },
            values: { value: [1.1, 2.2, 3.3], type: "array", elementType: "double" }
        },
        timestamp: 1699999999000
    }
}
```

## Examples

The package includes ready-to-use examples. After installation:

1. Open Node-RED
2. Go to **Menu** > **Import**
3. Select **Examples** > **node-red-contrib-questdb**

### Available Examples

1. **Basic Write** - Simple sensor data write
2. **Batch Write** - Writing arrays of measurements
3. **Using Mapper** - Transform MQTT data for QuestDB
4. **Direct Value Write** - Simple numeric writes
5. **Multiple Tables** - Writing to different tables
6. **With Timestamp** - Custom timestamp handling
7. **Continuous Data** - Generating continuous metrics

## QuestDB Setup

### Using Docker

```bash
docker run -p 9000:9000 -p 9009:9009 questdb/questdb
```

### Connection String Format

The node uses QuestDB's connection string format internally:

```
http::addr=localhost:9000;auto_flush_rows=75000;auto_flush_interval=1000;
```

## Compatibility

- **Node-RED**: >= 2.0.0
- **Node.js**: >= 14.0.0
- **QuestDB**: >= 6.0 (recommended: latest)

## Troubleshooting

### Connection Issues

1. Verify QuestDB is running: `curl http://localhost:9000`
2. Check firewall settings for ports 9000/9009
3. For HTTPS/TCPS, ensure certificates are properly configured

### Data Not Appearing

1. Check the node status indicator (green = connected)
2. Verify table creation in QuestDB console
3. Enable debug output to see write confirmations

### Performance Tips

1. Use symbols for frequently queried columns (they're indexed)
2. Batch writes when possible using arrays
3. Adjust auto-flush settings based on your write patterns

## License

MIT

## Author

**Holger Amort**

## Links

- [QuestDB Documentation](https://questdb.io/docs/)
- [QuestDB Node.js Client](https://github.com/questdb/nodejs-questdb-client)
- [GitHub Repository](https://github.com/ErnstHolger/node-red)
- [Report Issues](https://github.com/ErnstHolger/node-red/issues)
