module.exports = function(RED) {
    function RxSubscribeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.context = RED.nodes.getNode(config.context);
        node.streamName = config.streamName || "default";
        node.outputOnDeploy = config.outputOnDeploy !== false;

        let subscriptionId = null;

        if (!node.context) {
            node.status({ fill: "red", shape: "ring", text: "no context" });
            return;
        }

        function subscribe() {
            // Check if subject exists
            if (!node.context.hasSubject(node.streamName)) {
                node.status({ fill: "yellow", shape: "ring", text: "waiting: " + node.streamName });
                // Retry after a short delay
                setTimeout(subscribe, 1000);
                return;
            }

            subscriptionId = node.context.subscribe(node.streamName, function(value) {
                const msg = {
                    topic: node.streamName,
                    payload: value,
                    _rxStream: node.streamName
                };
                node.send(msg);
            });

            if (subscriptionId) {
                node.status({ fill: "green", shape: "dot", text: node.streamName });
            } else {
                node.status({ fill: "red", shape: "ring", text: "subscribe failed" });
            }
        }

        // Subscribe after a short delay to allow subjects to be created
        setTimeout(subscribe, 100);

        // Handle input for dynamic subscription changes
        node.on('input', function(msg, send, done) {
            if (msg.streamName && msg.streamName !== node.streamName) {
                // Unsubscribe from current
                if (subscriptionId) {
                    node.context.unsubscribe(subscriptionId);
                }

                // Subscribe to new stream
                node.streamName = msg.streamName;
                subscribe();
            }

            if (done) done();
        });

        node.on('close', function(done) {
            if (subscriptionId) {
                node.context.unsubscribe(subscriptionId);
            }
            done();
        });
    }

    RED.nodes.registerType("rx-subscribe", RxSubscribeNode);
};
