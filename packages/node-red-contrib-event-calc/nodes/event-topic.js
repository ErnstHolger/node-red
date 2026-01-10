/**
 * event-topic - Subscription node for exact topics
 *
 * Features:
 * - Subscribes to cache for a specific topic
 * - Outputs when the topic updates
 * - Multiple output formats: value only or full entry
 * - Optional output of existing value on start
 * - Dynamic topic change via input message
 */
module.exports = function(RED) {
    function EventTopicNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.cacheConfig = RED.nodes.getNode(config.cache);
        // Support both old 'pattern' and new 'topic' config
        node.topic = config.topic || config.pattern || '';
        node.outputFormat = config.outputFormat || 'value';
        node.outputOnStart = config.outputOnStart || false;

        let subscriptionId = null;

        if (!node.cacheConfig) {
            node.status({ fill: "red", shape: "ring", text: "no cache configured" });
            return;
        }

        if (!node.topic) {
            node.status({ fill: "yellow", shape: "ring", text: "no topic" });
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
                default:
                    return {
                        topic: topic,
                        payload: entry.value
                    };
            }
        }

        /**
         * Subscribe to the current topic
         */
        function subscribe() {
            subscriptionId = node.cacheConfig.subscribe(node.topic, (topic, entry) => {
                const msg = buildOutputMessage(topic, entry);
                node.send(msg);

                // Truncate topic for status display
                const displayTopic = topic.length > 20 ? topic.substring(0, 17) + '...' : topic;
                node.status({ fill: "green", shape: "dot", text: displayTopic });
            });
        }

        // Initial subscription
        subscribe();
        const displayTopic = node.topic.length > 20 ? node.topic.substring(0, 17) + '...' : node.topic;
        node.status({ fill: "green", shape: "dot", text: displayTopic });

        // Output existing value on start if configured
        if (node.outputOnStart) {
            setImmediate(() => {
                const entry = node.cacheConfig.getValue(node.topic);
                if (entry) {
                    const msg = buildOutputMessage(node.topic, entry);
                    node.send(msg);
                }
            });
        }

        // Handle input messages for dynamic topic change
        node.on('input', function(msg, send, done) {
            // For Node-RED 0.x compatibility
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err, msg); };

            if (msg.topic && typeof msg.topic === 'string' && msg.payload === 'subscribe') {
                // Unsubscribe from old topic
                if (subscriptionId && node.cacheConfig) {
                    node.cacheConfig.unsubscribe(subscriptionId);
                }

                // Update topic and resubscribe
                node.topic = msg.topic;
                subscribe();

                const dt = node.topic.length > 20 ? node.topic.substring(0, 17) + '...' : node.topic;
                node.status({ fill: "blue", shape: "dot", text: dt });
            }

            // Allow manual trigger to output current value
            if (msg.payload === 'refresh') {
                const entry = node.cacheConfig.getValue(node.topic);
                if (entry) {
                    const outMsg = buildOutputMessage(node.topic, entry);
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
