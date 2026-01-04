/**
 * event-calc - Calculation node for multi-topic expressions
 *
 * Features:
 * - Maps multiple variables to topic patterns
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
        const latestValues = new Map(); // name -> { topic, value, ts }

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

        /**
         * Attempt to calculate and output result
         */
        function tryCalculate(triggerTopic) {
            // Check if we should trigger
            if (node.triggerOn === 'all') {
                // All inputs must have values
                for (const input of node.inputMappings) {
                    if (!latestValues.has(input.name)) {
                        return; // Not all values available yet
                    }
                }
            }

            // At least one value must exist to calculate
            if (latestValues.size === 0) {
                return;
            }

            // Build context object for expression evaluation
            const context = {};
            const inputDetails = {};

            for (const input of node.inputMappings) {
                const data = latestValues.get(input.name);
                if (data) {
                    context[input.name] = data.value;
                    inputDetails[input.name] = {
                        topic: data.topic,
                        value: data.value,
                        ts: data.ts
                    };
                } else {
                    context[input.name] = undefined;
                }
            }

            // Evaluate expression safely
            try {
                // Create a function with named parameters from context + helpers
                const allParams = { ...helpers, ...context };
                const paramNames = Object.keys(allParams);
                const paramValues = Object.values(allParams);

                // Build function body with helpers and variables available
                const fn = new Function(...paramNames, `return ${node.expression};`);
                const result = fn(...paramValues);

                const msg = {
                    topic: node.outputTopic,
                    payload: result,
                    inputs: inputDetails,
                    expression: node.expression,
                    trigger: triggerTopic,
                    timestamp: Date.now()
                };

                node.send(msg);

                // Store result back in cache so it can be used by other calculations
                node.cacheConfig.setValue(node.outputTopic, result, {
                    source: 'event-calc',
                    expression: node.expression,
                    inputs: Object.keys(inputDetails)
                });

                // Update status with result (truncate if too long)
                const resultStr = String(result);
                const displayResult = resultStr.length > 15 ? resultStr.substring(0, 12) + '...' : resultStr;
                node.status({ fill: "green", shape: "dot", text: `= ${displayResult}` });

            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: "eval error" });
                node.error(`Expression evaluation failed: ${err.message}`, { expression: node.expression, context: context });
            }
        }

        // Subscribe to each input pattern
        for (const input of node.inputMappings) {
            if (!input.name || !input.pattern) {
                continue;
            }

            const subId = node.cacheConfig.subscribe(input.pattern, (topic, entry) => {
                latestValues.set(input.name, {
                    topic: topic,
                    value: entry.value,
                    ts: entry.ts
                });

                tryCalculate(topic);
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

            // Force recalculation
            if (msg.payload === 'recalc' || msg.topic === 'recalc') {
                tryCalculate('manual');
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
            latestValues.clear();
            done();
        });
    }

    RED.nodes.registerType("event-calc", EventCalcNode);
};
