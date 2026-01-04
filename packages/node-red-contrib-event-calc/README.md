# node-red-contrib-event-calc

Node-RED nodes for event caching and calculations with topic wildcard patterns.

## Overview

This package provides a central cache for event/streaming data values with reactive updates. It enables subscription to topic patterns and calculations when values change, making it easy to build event-driven data processing flows.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  event-cache (config node)                                   │
│  • Stores: Map<topic, {value, ts, metadata}>                │
│  • Event emitter for topic updates                           │
│  • Wildcard pattern matching                                 │
└──────────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
    │event-in │         │event-   │         │event-   │
    │         │         │topic    │         │calc     │
    │ pushes  │         │subscribes│        │multi-sub│
    │to cache │         │to pattern│        │+ expr   │
    └─────────┘         └─────────┘         └─────────┘
```

## Installation

```bash
npm install node-red-contrib-event-calc
```

Or install directly from the Node-RED palette manager.

## Nodes

### event-cache (Config Node)

Central cache that stores topic values and manages subscriptions. Configure:

- **Max Entries**: Maximum topics to cache (default: 10000). Oldest entries removed when exceeded.
- **TTL**: Time-to-live in milliseconds. Set to 0 for no expiry.

### event-in

Receives messages from any upstream node and pushes values to the cache.

**Properties:**
- **Topic Field**: Where to get the topic (default: `msg.topic`)
- **Value Field**: Where to get the value (default: `msg.payload`)

The original message passes through, allowing insertion into existing flows.

### event-topic

Subscribes to a topic pattern and outputs when matching topics update.

**Properties:**
- **Topic Pattern**: Pattern with wildcards (`?` for single level, `*` for any levels)
- **Output Format**:
  - *Value only*: `msg.payload` = value
  - *Full entry*: `msg.payload` = `{value, ts, metadata}`
  - *All matching*: `msg.payload` = `{topic1: value1, topic2: value2, ...}`
- **Output on deploy**: Emit cached values when flow starts

**Dynamic control via input:**
- `msg.pattern`: Change subscription pattern
- `msg.payload = 'refresh'`: Output all currently cached values

### event-calc

Subscribes to multiple topics and evaluates an expression when values update.

**Properties:**
- **Input Variables**: Map variable names to topic patterns
- **Expression**: JavaScript expression using the variables
- **Trigger**: When to calculate
  - *Any input updates*: Calculate on every update
  - *Only when all inputs have values*: Wait for all values

**Output:**
```json
{
  "topic": "calc/result",
  "payload": 21.5,
  "inputs": {
    "a": { "topic": "sensors/room1/temp", "value": 22, "ts": 1704000000000 },
    "b": { "topic": "sensors/room2/temp", "value": 21, "ts": 1704000001000 }
  },
  "expression": "(a + b) / 2",
  "trigger": "sensors/room1/temp"
}
```

## Wildcard Patterns

Two wildcards are supported:

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `sensor?` | `sensor1`, `sensorA` | `sensor`, `sensor12` |
| `sensors/*` | `sensors/temp`, `sensors/room1/temp` | `sensors` (nothing after /) |
| `*/temp` | `room/temp`, `sensors/temp` | `temp` (nothing before /) |
| `*` | Any topic with 1+ chars | Empty string |

- `?` matches exactly one character
- `*` matches one or more characters

## Examples

### Average Temperature

```
[inject: room1/temp] → [event-in] → [cache]
[inject: room2/temp] → [event-in] → [cache]

[event-calc] → [debug]
  inputs: a = sensors/room1/temp
          b = sensors/room2/temp
  expression: (a + b) / 2
  trigger: all
```

### Monitor All Sensors

```
[any-input: sensors/*] → [event-in] → [cache]

[event-topic: sensors/*] → [debug]
  outputFormat: all
```

### Calculate Power (Voltage × Current)

```
[event-calc]
  inputs: v = power/voltage
          i = power/current
  expression: v * i
  topic: power/watts
```

## Built-in Functions

### Math
| Function | Description |
|----------|-------------|
| `min(a, b, ...)` | Minimum value |
| `max(a, b, ...)` | Maximum value |
| `abs(x)` | Absolute value |
| `sqrt(x)` | Square root |
| `pow(base, exp)` | Power |
| `log(x)`, `log10(x)` | Logarithms |
| `floor(x)`, `ceil(x)` | Rounding |
| `sin(x)`, `cos(x)`, `tan(x)` | Trigonometry |
| `PI`, `E` | Constants |

### Aggregation
| Function | Description |
|----------|-------------|
| `sum(a, b, ...)` | Sum of values |
| `avg(a, b, ...)` | Average of values |
| `count(a, b, ...)` | Count of values |

### Utility
| Function | Description |
|----------|-------------|
| `round(value, decimals)` | Round to N decimals |
| `clamp(value, min, max)` | Constrain to range |
| `map(value, inMin, inMax, outMin, outMax)` | Scale between ranges |
| `lerp(a, b, t)` | Linear interpolation |
| `ifelse(cond, trueVal, falseVal)` | Conditional |
| `between(value, min, max)` | Range check (returns boolean) |
| `delta(current, previous)` | Difference |
| `pctChange(current, previous)` | Percentage change |

## Expression Examples

| Expression | Description |
|------------|-------------|
| `a + b` | Sum |
| `avg(a, b)` | Average |
| `max(a, b, c)` | Maximum |
| `sqrt(a*a + b*b)` | Pythagorean |
| `round(a, 2)` | Round to 2 decimals |
| `clamp(a, 0, 100)` | Constrain 0-100 |
| `map(a, 0, 1023, 0, 100)` | Scale ADC to % |
| `ifelse(a > b, 'high', 'low')` | Conditional |
| `pctChange(a, b)` | % change from b to a |

## Scalability

The event-cache is optimized for high subscriber counts:

| Subscription Type | Lookup Complexity | Best For |
|-------------------|-------------------|----------|
| Exact topic (e.g., `sensors/room1/temp`) | O(1) | High-frequency updates, many subscribers |
| Wildcard pattern (e.g., `sensors/*`) | O(w) | Flexible matching, fewer patterns |

Where `w` = number of wildcard subscriptions (typically much smaller than total subscribers).

**Example performance:**
- 1000 exact subscriptions to different topics: O(1) per update
- 10 wildcard patterns + 1000 exact subscriptions: O(10) per update
- Pure wildcard subscriptions: O(n) per update

**Recommendations for high scale:**
- Prefer exact topic matches when possible
- Use wildcards sparingly for monitoring/logging
- Check stats endpoint: `GET /event-cache/:id/stats`

## API (for custom nodes)

The event-cache node exposes methods for programmatic access:

```javascript
const cache = RED.nodes.getNode(configId);

// Set a value
cache.setValue('topic/path', 42, { source: 'sensor' });

// Get a value
const entry = cache.getValue('topic/path');
// { value: 42, ts: 1704000000000, metadata: { source: 'sensor' } }

// Get matching values
const temps = cache.getMatching('sensors/*');
// Map { 'sensors/room1/temp' => {...}, 'sensors/room2/temp' => {...} }

// Subscribe to updates
const subId = cache.subscribe('sensors/*', (topic, entry) => {
    console.log(`${topic} = ${entry.value}`);
});

// Unsubscribe
cache.unsubscribe(subId);

// Get all topics
const topics = cache.getTopics();

// Clear cache
cache.clear();
```

## License

MIT
