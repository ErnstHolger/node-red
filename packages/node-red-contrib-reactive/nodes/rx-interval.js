const { interval, Subscription } = require('rxjs');
const { take } = require('rxjs/operators');

module.exports = function(RED) {
    function RxIntervalNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.interval = parseInt(config.interval) || 1000;
        node.startOnDeploy = config.startOnDeploy !== false;
        node.limit = parseInt(config.limit) || 0;

        let subscription = null;
        let count = 0;

        function start() {
            if (subscription) {
                subscription.unsubscribe();
            }

            count = 0;
            let source = interval(node.interval);

            if (node.limit > 0) {
                source = source.pipe(take(node.limit));
            }

            subscription = source.subscribe({
                next: (value) => {
                    count++;
                    const msg = {
                        payload: value,
                        count: count,
                        _rxInterval: true
                    };
                    node.send(msg);
                    node.status({ fill: "green", shape: "dot", text: `count: ${count}` });
                },
                complete: () => {
                    node.status({ fill: "blue", shape: "ring", text: "complete" });
                    subscription = null;
                },
                error: (err) => {
                    node.error(err.message);
                    node.status({ fill: "red", shape: "ring", text: "error" });
                }
            });

            node.status({ fill: "green", shape: "dot", text: "running" });
        }

        function stop() {
            if (subscription) {
                subscription.unsubscribe();
                subscription = null;
            }
            node.status({ fill: "grey", shape: "ring", text: "stopped" });
        }

        function reset() {
            stop();
            start();
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
                case 'reset':
                    reset();
                    break;
                default:
                    // If interval is provided, update it
                    if (typeof msg.interval === 'number') {
                        node.interval = msg.interval;
                        if (subscription) {
                            reset();
                        }
                    }
            }

            if (done) done();
        });

        node.on('close', function(done) {
            stop();
            done();
        });
    }

    RED.nodes.registerType("rx-interval", RxIntervalNode);
};
