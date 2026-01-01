module.exports = function(RED) {
    function SampleNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.stateKey = config.stateKey || config.cacheKey || 'cache';
        node.outputMode = config.outputMode || 'individual';
        var contextStore = node.context().global;

        node.on('input', function(msg) {
            // Handle status request
            if (msg.topic === '_status' || msg.payload === '_status') {
                var state = contextStore.get(node.stateKey) || {};
                node.send({
                    payload: {
                        stateKey: node.stateKey,
                        count: Object.keys(state).length,
                        keys: Object.keys(state)
                    },
                    topic: 'status'
                });
                return;
            }

            // Sample all key-value pairs from state dictionary
            // Structure: { key1: value1, key2: value2, ... }
            var state = contextStore.get(node.stateKey) || {};
            var keys = Object.keys(state);

            if (keys.length === 0) {
                node.status({ fill: "yellow", shape: "ring", text: "State empty" });
                return;
            }

            var messages = [];
            var now = Date.now();

            keys.forEach(function(key) {
                var value = state[key];
                // Flatten: spread all fields from value, then override topic with dictionary key
                var flatMsg = Object.assign({}, value, {
                    topic: key,
                    _sampledAt: now
                });
                messages.push(flatMsg);
            });

            if (node.outputMode === 'bulk') {
                node.send({ payload: messages, topic: 'bulk', count: messages.length });
            } else {
                messages.forEach(function(m) { node.send(m); });
            }

            node.status({ fill: "green", shape: "dot", text: "Sent: " + messages.length });
        });

        node.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType("sample", SampleNode);
};
