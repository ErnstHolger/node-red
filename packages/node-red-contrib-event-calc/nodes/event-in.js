/**
 * event-in - Input node that pushes data to the event cache
 *
 * Features:
 * - Receives messages from any upstream Node-RED node
 * - Configurable topic and value extraction from message
 * - Pass-through: forwards original message after caching
 */
module.exports = function(RED) {
    function EventInNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.cacheConfig = RED.nodes.getNode(config.cache);
        node.topicField = config.topicField || 'topic';
        node.valueField = config.valueField || 'payload';

        if (!node.cacheConfig) {
            node.status({ fill: "red", shape: "ring", text: "no cache configured" });
            return;
        }

        node.status({ fill: "green", shape: "dot", text: "ready" });

        node.on('input', function(msg, send, done) {
            // For Node-RED 0.x compatibility
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err, msg); };

            try {
                // Extract topic using RED.util.getMessageProperty
                let topic;
                if (node.topicField.startsWith('msg.')) {
                    topic = RED.util.getMessageProperty(msg, node.topicField.substring(4));
                } else {
                    topic = RED.util.getMessageProperty(msg, node.topicField);
                }

                if (!topic || typeof topic !== 'string') {
                    node.status({ fill: "yellow", shape: "ring", text: "missing topic" });
                    done(new Error(`Topic not found at msg.${node.topicField} or not a string`));
                    return;
                }

                // Extract value
                let value;
                if (node.valueField.startsWith('msg.')) {
                    value = RED.util.getMessageProperty(msg, node.valueField.substring(4));
                } else {
                    value = RED.util.getMessageProperty(msg, node.valueField);
                }

                // Build metadata from msg properties
                const metadata = {
                    _msgid: msg._msgid
                };

                // Push to cache
                node.cacheConfig.setValue(topic, value, metadata);

                // Truncate topic for status display
                const displayTopic = topic.length > 20 ? topic.substring(0, 17) + '...' : topic;
                node.status({ fill: "green", shape: "dot", text: displayTopic });

                // Pass through the message
                send(msg);
                done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: "error" });
                done(err);
            }
        });

        node.on('close', function(done) {
            done();
        });
    }

    RED.nodes.registerType("event-in", EventInNode);
};
