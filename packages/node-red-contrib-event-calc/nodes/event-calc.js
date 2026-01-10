/**
 * event-calc - Calculation node for multi-topic expressions
 *
 * Features:
 * - Maps variables to exact topics
 * - Evaluates JavaScript expressions when inputs update
 * - Trigger modes: 'any' (any input updates) or 'all' (all inputs have values)
 * - Safe expression evaluation using Function constructor
 * - Dynamic expression update via input message
 * - Built-in helper functions for common operations
 */
module.exports = function(RED) {

    // Helper functions available in expressions
    const helpers = {
        // Math shortcuts
        min: (...args) => Math.min(...args.flat()),
        max: (...args) => Math.max(...args.flat()),
        abs: (x) => Math.abs(x),
        sqrt: (x) => Math.sqrt(x),
        pow: (base, exp) => Math.pow(base, exp),
        log: (x) => Math.log(x),
        log10: (x) => Math.log10(x),
        exp: (x) => Math.exp(x),
        floor: (x) => Math.floor(x),
        ceil: (x) => Math.ceil(x),
        sin: (x) => Math.sin(x),
        cos: (x) => Math.cos(x),
        tan: (x) => Math.tan(x),
        PI: Math.PI,
        E: Math.E,

        // Aggregation
        sum: (...args) => args.flat().reduce((a, b) => a + b, 0),
        avg: (...args) => {
            const flat = args.flat();
            return flat.length > 0 ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
        },
        count: (...args) => args.flat().length,

        // Utility
        round: (value, decimals = 0) => {
            const factor = Math.pow(10, decimals);
            return Math.round(value * factor) / factor;
        },
        clamp: (value, min, max) => Math.min(Math.max(value, min), max),
        map: (value, inMin, inMax, outMin, outMax) => {
            return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
        },
        lerp: (a, b, t) => a + (b - a) * t,

        // Boolean/conditional helpers
        ifelse: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
        between: (value, min, max) => value >= min && value <= max,

        // Delta/change detection (returns difference)
        delta: (current, previous) => current - previous,
        pctChange: (current, previous) => previous !== 0 ? ((current - previous) / previous) * 100 : 0
    };
    function EventCalcNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.cacheConfig = RED.nodes.getNode(config.cache);
        node.inputMappings = config.inputMappings || [];
        node.expression = config.expression || '';
        node.triggerOn = config.triggerOn || 'any';
        node.outputTopic = config.outputTopic || 'calc/result';

        const subscriptionIds = [];

        if (!node.cacheConfig) {
            node.status({ fill: "red", shape: "ring", text: "no cache configured" });
            return;
        }

        if (node.inputMappings.length === 0) {
            node.status({ fill: "yellow", shape: "ring", text: "no inputs defined" });
            return;
        }

        if (!node.expression) {
            node.status({ fill: "yellow", shape: "ring", text: "no expression" });
            return;
        }

        // Track subscribed topics to ignore updates from our own output
        const subscribedTopics = new Set();
        for (const input of node.inputMappings) {
            const topicName = input.topic || input.pattern;
            if (topicName) {
                subscribedTopics.add(topicName);
            }
        }

        /**
         * Attempt to calculate and output result
         */
        function tryCalculate(triggerTopic, latestValues) {
            // Ignore updates triggered by our own output
            if (triggerTopic === node.outputTopic) {
                return;
            }

            if (node.triggerOn === 'all') {
                for (const input of node.inputMappings) {
                    if (!latestValues.has(input.name)) {
                        return;
                    }
                }
            }

            if (latestValues.size === 0) {
                return;
            }

            const context = {};
            const inputDetails = {};
            const missingInputs = [];

            for (const input of node.inputMappings) {
                const data = latestValues.get(input.name);
                if (data && data.value !== undefined && data.value !== null) {
                    context[input.name] = data.value;
                    inputDetails[input.name] = {
                        topic: data.topic,
                        value: data.value,
                        ts: data.ts
                    };
                } else {
                    context[input.name] = undefined;
                    missingInputs.push(input.name);
                }
            }

            // Build topics mapping: variable name -> topic
            const topics = { _output: node.outputTopic };
            const timestamps = {};
            for (const [name, details] of Object.entries(inputDetails)) {
                topics[name] = details.topic;
                timestamps[name] = details.ts;
            }

            try {
                const allParams = { ...helpers, ...context };
                const paramNames = Object.keys(allParams);
                const paramValues = Object.values(allParams);

                const fn = new Function(...paramNames, `return ${node.expression};`);
                const result = fn(...paramValues);

                // Check for NaN or invalid result
                if (typeof result === 'number' && isNaN(result)) {
                    const errorMsg = {
                        topic: node.outputTopic,
                        payload: {
                            error: 'Expression resulted in NaN',
                            missingInputs: missingInputs,
                            expression: node.expression
                        },
                        inputs: inputDetails,
                        trigger: triggerTopic,
                        timestamp: Date.now()
                    };
                    node.send([null, errorMsg]);
                    node.status({ fill: "yellow", shape: "ring", text: "NaN" });
                    return;
                }

                const msg = {
                    topic: node.outputTopic,
                    payload: result,
                    topics: topics,
                    inputs: inputDetails,
                    timestamps: timestamps,
                    expression: node.expression,
                    trigger: triggerTopic,
                    timestamp: Date.now()
                };

                node.send([msg, null]);

                node.cacheConfig.setValue(node.outputTopic, result, {
                    source: 'event-calc',
                    expression: node.expression,
                    inputs: Object.keys(inputDetails)
                });

                const resultStr = String(result);
                const displayResult = resultStr.length > 15 ? resultStr.substring(0, 12) + '...' : resultStr;
                node.status({ fill: "green", shape: "dot", text: `= ${displayResult}` });

            } catch (err) {
                const errorMsg = {
                    topic: node.outputTopic,
                    payload: {
                        error: err.message,
                        expression: node.expression,
                        context: context
                    },
                    inputs: inputDetails,
                    trigger: triggerTopic,
                    timestamp: Date.now()
                };
                node.send([null, errorMsg]);
                node.status({ fill: "red", shape: "ring", text: "eval error" });
            }
        }

        // Subscribe to inputs
        const latestValues = new Map();

        for (const input of node.inputMappings) {
            const topicName = input.topic || input.pattern;
            if (!input.name || !topicName) continue;

            const subId = node.cacheConfig.subscribe(topicName, (topic, entry) => {
                latestValues.set(input.name, {
                    topic: topic,
                    value: entry.value,
                    ts: entry.ts
                });
                tryCalculate(topic, latestValues);
            });
            subscriptionIds.push(subId);
        }

        node.status({ fill: "green", shape: "dot", text: "ready" });

        // Handle input messages for dynamic updates
        node.on('input', function(msg, send, done) {
            // For Node-RED 0.x compatibility
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err, msg); };

            // Allow expression update via message
            if (msg.expression && typeof msg.expression === 'string') {
                node.expression = msg.expression;
                node.status({ fill: "blue", shape: "dot", text: "expr updated" });
            }

            // Force recalculation (use special topic to bypass self-output check)
            if (msg.payload === 'recalc' || msg.topic === 'recalc') {
                if (latestValues.size > 0) {
                    tryCalculate('_recalc', latestValues);
                }
            }

            done();
        });

        node.on('close', function(done) {
            for (const subId of subscriptionIds) {
                if (node.cacheConfig) {
                    node.cacheConfig.unsubscribe(subId);
                }
            }
            subscriptionIds.length = 0;
            done();
        });
    }

    RED.nodes.registerType("event-calc", EventCalcNode);
};
