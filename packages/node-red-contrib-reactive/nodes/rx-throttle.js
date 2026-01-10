const { Subject } = require('rxjs');
const { throttleTime } = require('rxjs/operators');

module.exports = function(RED) {
    function RxThrottleNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.time = parseInt(config.time) || 1000;
        node.leading = config.leading !== false;
        node.trailing = config.trailing === true;

        const subject = new Subject();
        let subscription = null;
        let inputCount = 0;
        let outputCount = 0;

        // Set up the throttled stream
        subscription = subject.pipe(
            throttleTime(node.time, undefined, {
                leading: node.leading,
                trailing: node.trailing
            })
        ).subscribe({
            next: (msg) => {
                outputCount++;
                msg._rxThrottle = true;
                node.send(msg);
                node.status({ fill: "green", shape: "dot", text: `${outputCount}/${inputCount}` });
            },
            error: (err) => {
                node.error(err.message);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }
        });

        node.status({ fill: "grey", shape: "dot", text: `${node.time}ms` });

        node.on('input', function(msg, send, done) {
            inputCount++;
            node.status({ fill: "yellow", shape: "ring", text: `throttling... ${inputCount}` });

            // Push to the subject
            subject.next(msg);

            if (done) done();
        });

        node.on('close', function(done) {
            if (subscription) {
                subscription.unsubscribe();
            }
            subject.complete();
            done();
        });
    }

    RED.nodes.registerType("rx-throttle", RxThrottleNode);
};
