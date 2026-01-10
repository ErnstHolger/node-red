const { combineLatest } = require('rxjs');

module.exports = function(RED) {
    function RxCombineNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.context = RED.nodes.getNode(config.context);
        node.streams = config.streams || [];

        let subscriptions = [];
        let latestValues = {};
        let hasAllValues = false;

        if (!node.context) {
            node.status({ fill: "red", shape: "ring", text: "no context" });
            return;
        }

        if (!node.streams || node.streams.length === 0) {
            node.status({ fill: "yellow", shape: "ring", text: "no streams" });
            return;
        }

        function checkAndEmit() {
            // Check if we have values for all streams
            const allStreams = node.streams.every(s => s.name in latestValues);

            if (allStreams) {
                hasAllValues = true;
                const combined = { ...latestValues };
                const msg = {
                    payload: combined,
                    _rxCombine: true,
                    _streamNames: node.streams.map(s => s.name)
                };
                node.send(msg);
                node.status({ fill: "green", shape: "dot", text: `combined: ${Object.keys(combined).length} streams` });
            } else {
                const count = Object.keys(latestValues).length;
                node.status({ fill: "yellow", shape: "ring", text: `waiting: ${count}/${node.streams.length}` });
            }
        }

        function subscribe() {
            // Subscribe to each named stream
            for (const streamConfig of node.streams) {
                const streamName = streamConfig.name;

                if (!streamName) continue;

                // Wait for subject to be created
                const trySubscribe = () => {
                    if (node.context.hasSubject(streamName)) {
                        const subId = node.context.subscribe(streamName, (value) => {
                            latestValues[streamName] = value;
                            checkAndEmit();
                        });

                        if (subId) {
                            subscriptions.push(subId);
                        }
                    } else {
                        // Retry after a short delay
                        setTimeout(trySubscribe, 500);
                    }
                };

                trySubscribe();
            }
        }

        node.status({ fill: "grey", shape: "dot", text: `watching ${node.streams.length} streams` });

        // Start subscriptions after a short delay
        setTimeout(subscribe, 100);

        // Handle input for dynamic stream updates
        node.on('input', function(msg, send, done) {
            if (msg.streams && Array.isArray(msg.streams)) {
                // Unsubscribe from current streams
                for (const subId of subscriptions) {
                    node.context.unsubscribe(subId);
                }
                subscriptions = [];
                latestValues = {};
                hasAllValues = false;

                // Update streams and resubscribe
                node.streams = msg.streams.map(name => ({ name }));
                subscribe();
            }

            if (done) done();
        });

        node.on('close', function(done) {
            for (const subId of subscriptions) {
                node.context.unsubscribe(subId);
            }
            subscriptions = [];
            done();
        });
    }

    RED.nodes.registerType("rx-combine", RxCombineNode);
};
