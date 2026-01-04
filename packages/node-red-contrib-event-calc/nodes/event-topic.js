/**
 * event-topic - Subscription node for topic patterns
 *
 * Features:
 * - Subscribes to cache using MQTT-style topic patterns
 * - Outputs when matching topics update
 * - Multiple output formats: value only, full entry, or all matching
 * - Optional output of existing values on start
 * - Dynamic pattern change via input message
 */
module.exports = function(RED) {
    function EventTopicNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.cacheConfig = RED.nodes.getNode(config.cache);
        node.pattern = config.pattern || '#';
        node.outputFormat = config.outputFormat || 'value';
        node.outputOnStart = config.outputOnStart || false;

        let subscriptionId = null;

        if (!node.cacheConfig) {
            node.status({ fill: "red", shape: "ring", text: "no cache configured" });
            return;
        }

        /**
         * Build output message based on configured format
         */
        function buildOutputMessage(topic, entry) {
            switch (node.outputFormat) {
                case 'value':
                    return {
                        topic: topic,
                        payload: entry.value,
                        timestamp: entry.ts
                    };
                case 'full':
                    return {
                        topic: topic,
                        payload: {
                            value: entry.value,
                            ts: entry.ts,
                            metadata: entry.metadata
                        }
                    };
                case 'all':
                    const all = node.cacheConfig.getMatching(node.pattern);
                    const values = {};
                    for (const [t, e] of all) {
                        values[t] = e.value;
                    }
                    return {
                        topic: topic,
                        payload: values,
                        trigger: {
                            topic: topic,
                            value: entry.value
                        },
                        timestamp: entry.ts
                    };
                default:
                    return {
                        topic: topic,
                        payload: entry.value
                    };
            }
        }

        /**
         * Subscribe to the current pattern
         */
        function subscribe() {
            subscriptionId = node.cacheConfig.subscribe(node.pattern, (topic, entry) => {
                const msg = buildOutputMessage(topic, entry);
                node.send(msg);

                // Truncate topic for status display
                const displayTopic = topic.length > 20 ? topic.substring(0, 17) + '...' : topic;
                node.status({ fill: "green", shape: "dot", text: displayTopic });
            });
        }

        // Initial subscription
        subscribe();
        node.status({ fill: "green", shape: "dot", text: node.pattern });

        // Output existing values on start if configured
        if (node.outputOnStart) {
            setImmediate(() => {
                const matching = node.cacheConfig.getMatching(node.pattern);
                for (const [topic, entry] of matching) {
                    const msg = buildOutputMessage(topic, entry);
                    node.send(msg);
                }
            });
        }

        // Handle input messages for dynamic pattern change
        node.on('input', function(msg, send, done) {
            // For Node-RED 0.x compatibility
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err, msg); };

            if (msg.pattern && typeof msg.pattern === 'string') {
                // Unsubscribe from old pattern
                if (subscriptionId && node.cacheConfig) {
                    node.cacheConfig.unsubscribe(subscriptionId);
                }

                // Update pattern and resubscribe
                node.pattern = msg.pattern;
                subscribe();

                node.status({ fill: "blue", shape: "dot", text: node.pattern });
            }

            // Allow manual trigger to output all current values
            if (msg.topic === 'refresh' || msg.payload === 'refresh') {
                const matching = node.cacheConfig.getMatching(node.pattern);
                for (const [topic, entry] of matching) {
                    const outMsg = buildOutputMessage(topic, entry);
                    send(outMsg);
                }
            }

            done();
        });

        node.on('close', function(done) {
            if (subscriptionId && node.cacheConfig) {
                node.cacheConfig.unsubscribe(subscriptionId);
            }
            done();
        });
    }

    RED.nodes.registerType("event-topic", EventTopicNode);
};
