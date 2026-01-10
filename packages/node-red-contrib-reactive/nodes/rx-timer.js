const { timer, Subscription } = require('rxjs');

module.exports = function(RED) {
    function RxTimerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.delay = parseInt(config.delay) || 1000;
        node.period = parseInt(config.period) || 0;
        node.startOnDeploy = config.startOnDeploy !== false;

        let subscription = null;
        let count = 0;

        function start() {
            if (subscription) {
                subscription.unsubscribe();
            }

            count = 0;
            const source = node.period > 0
                ? timer(node.delay, node.period)
                : timer(node.delay);

            subscription = source.subscribe({
                next: (value) => {
                    count++;
                    const msg = {
                        payload: value,
                        count: count,
                        _rxTimer: true
                    };
                    node.send(msg);

                    if (node.period > 0) {
                        node.status({ fill: "green", shape: "dot", text: `count: ${count}` });
                    } else {
                        node.status({ fill: "blue", shape: "ring", text: "fired" });
                    }
                },
                complete: () => {
                    if (node.period === 0) {
                        node.status({ fill: "blue", shape: "ring", text: "complete" });
                    }
                    subscription = null;
                },
                error: (err) => {
                    node.error(err.message);
                    node.status({ fill: "red", shape: "ring", text: "error" });
                }
            });

            node.status({ fill: "yellow", shape: "ring", text: `waiting ${node.delay}ms` });
        }

        function stop() {
            if (subscription) {
                subscription.unsubscribe();
                subscription = null;
            }
            node.status({ fill: "grey", shape: "ring", text: "stopped" });
        }

        // Start on deploy if configured
        if (node.startOnDeploy) {
            start();
        } else {
            node.status({ fill: "grey", shape: "ring", text: "stopped" });
        }

        node.on('input', function(msg, send, done) {
            const command = (msg.payload || "").toString().toLowerCase();

            switch (command) {
                case 'start':
                    start();
                    break;
                case 'stop':
                    stop();
                    break;
                default:
                    // Update delay/period if provided
                    if (typeof msg.delay === 'number') {
                        node.delay = msg.delay;
                    }
                    if (typeof msg.period === 'number') {
                        node.period = msg.period;
                    }
            }

            if (done) done();
        });

        node.on('close', function(done) {
            stop();
            done();
        });
    }

    RED.nodes.registerType("rx-timer", RxTimerNode);
};
