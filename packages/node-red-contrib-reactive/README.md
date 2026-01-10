# node-red-contrib-reactive

Node-RED nodes for [RxJS](https://rxjs.dev/) reactive programming.

## Features

- **Stream Sources**: Create observable streams with intervals, timers, or named subjects
- **Transformations**: Map, filter, scan (reduce), and buffer values
- **Rate Limiting**: Debounce and throttle message flow
- **Filtering**: Take, skip, and distinct value filtering
- **Combination**: Merge streams and combine latest values
- **Named Streams**: Publish/subscribe pattern with rx-subject and rx-subscribe

## Installation

### Via Node-RED Palette Manager

1. Open Node-RED
2. Go to **Menu** > **Manage palette** > **Install**
3. Search for `node-red-contrib-reactive`
4. Click **Install**

### Via npm

```bash
cd ~/.node-red
npm install node-red-contrib-reactive
```

Then restart Node-RED.

## Nodes

### Sources

#### rx-interval
Emits incrementing numbers at a specified interval.

- **Interval**: Time between emissions (ms)
- **Start on Deploy**: Begin emitting when flow starts
- **Limit**: Maximum number of emissions (0 = unlimited)

Control via input:
- `msg.payload = "start"` - Start emitting
- `msg.payload = "stop"` - Stop emitting
- `msg.payload = "reset"` - Reset counter and restart

#### rx-timer
Emits after an initial delay, optionally repeating.

- **Delay**: Initial delay before first emission (ms)
- **Period**: Time between subsequent emissions (0 = emit once)

#### rx-subject
Creates or publishes to a named subject stream.

- **Name**: Stream identifier
- **Type**: Subject, BehaviorSubject, or ReplaySubject

Input messages are pushed to the subject and passed through.

### Transformations

#### rx-map
Transforms each value using a JavaScript expression.

- **Expression**: JavaScript expression (variables: `value`, `index`, `msg`)

Examples:
- `value * 2` - Double the value
- `value.toUpperCase()` - Convert to uppercase
- `{...msg.payload, processed: true}` - Add property

#### rx-filter
Filters values based on a condition.

- **Condition**: JavaScript expression returning boolean

Examples:
- `value > 10` - Only values greater than 10
- `value.status === 'active'` - Only active items
- `index % 2 === 0` - Every other value

#### rx-scan
Accumulates values like reduce, emitting each intermediate result.

- **Expression**: Accumulator expression (variables: `acc`, `value`, `index`)
- **Initial Value**: Starting accumulator value

Examples:
- Expression: `acc + value`, Initial: `0` - Running sum
- Expression: `acc.concat(value)`, Initial: `[]` - Collect into array
- Expression: `(acc * index + value) / (index + 1)`, Initial: `0` - Running average

#### rx-buffer
Buffers values and emits as arrays.

- **Mode**: `time` or `count`
- **Time Span**: Buffer duration in ms (time mode)
- **Buffer Size**: Number of values to collect (count mode)

### Rate Limiting

#### rx-debounce
Emits a value only after a specified period of silence.

- **Time**: Debounce period (ms)

Use cases: Search input, window resize, form validation

#### rx-throttle
Emits at most once per time window.

- **Time**: Throttle period (ms)
- **Leading**: Emit on leading edge
- **Trailing**: Emit on trailing edge

Use cases: Rate limiting API calls, scroll events

### Filtering

#### rx-take
Takes only the first N values.

- **Count**: Number of values to take

Send `msg.reset = true` to reset the counter.

#### rx-skip
Skips the first N values.

- **Count**: Number of values to skip

#### rx-distinct
Emits only when values change.

- **Mode**: `untilChanged` (consecutive) or `all` (ever seen)
- **Key Selector**: Optional expression to extract comparison key

Examples:
- Key: `value.id` - Distinct by ID property
- Key: `JSON.stringify(value)` - Distinct by full object

### Timing

#### rx-delay
Delays each emission by a specified time.

- **Time**: Delay duration (ms)

### Combination

#### rx-merge
Merges values from multiple input wires into a single stream.

Connect multiple wires to this node - all inputs emit to the single output.

#### rx-combine
Combines the latest values from multiple named streams.

- **Streams**: List of stream names to combine

Emits an object with all latest values whenever any stream updates:
```javascript
{
  "stream1": latestValue1,
  "stream2": latestValue2,
  ...
}
```

### Pub/Sub

#### rx-subscribe
Subscribes to a named stream and outputs its values.

- **Stream Name**: Name of the stream to subscribe to
- **Output on Deploy**: Emit current value when flow starts (BehaviorSubject only)

### Configuration

#### rx-context
Configuration node that manages named streams. Add one to your flow and reference it from rx-subject, rx-subscribe, and rx-combine nodes.

## Examples

After installation, import examples from **Menu** > **Import** > **Examples** > **node-red-contrib-reactive**.

### Basic Interval
```
[rx-interval (1s)] → [rx-map (value * 2)] → [debug]
```

### Debounced Search
```
[inject] → [rx-debounce (500ms)] → [http request] → [debug]
```

### Running Sum
```
[inject numbers] → [rx-scan (acc + value, 0)] → [debug]
```

### Combine Sensors
```
[sensor1] → [rx-subject "temp"]
[sensor2] → [rx-subject "humidity"]
[rx-combine ["temp", "humidity"]] → [calculate comfort index] → [debug]
```

### Buffered Batch Processing
```
[rapid events] → [rx-buffer (5 items)] → [batch process] → [database]
```

### Throttled API Calls
```
[user input] → [rx-throttle (1000ms)] → [http request] → [debug]
```

## Compatibility

- **Node-RED**: >= 2.0.0
- **Node.js**: >= 14.0.0
- **RxJS**: 7.x

## License

MIT

## Author

**Holger Amort**

## Links

- [RxJS Documentation](https://rxjs.dev/)
- [GitHub Repository](https://github.com/ErnstHolger/node-red)
- [Report Issues](https://github.com/ErnstHolger/node-red/issues)
