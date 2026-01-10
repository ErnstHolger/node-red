const { Subject } = require('rxjs');
const { delay } = require('rxjs/operators');

module.exports = function(RED) {
    function RxDelayNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.time = parseInt(config.time) || 1000;

        const subject = new Subject();
        let subscription = null;
        let pending = 0;
        let sent = 0;

        // Set up the delayed stream
        subscription = subject.pipe(
            delay(node.time)
        ).subscribe({
            next: (msg) => {
                pending--;
                sent++;
                msg._rxDelay = true;
                node.send(msg);
                node.status({ fill: "green", shape: "dot", text: `sent: ${sent}, pending: ${pending}` });
            },
            error: (err) => {
                node.error(err.message);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }
        });

        node.status({ fill: "grey", shape: "dot", text: `${node.time}ms delay` });

        node.on('input', function(msg, send, done) {
            pending++;
            node.status({ fill: "yellow", shape: "ring", text: `pending: ${pending}` });

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

    RED.nodes.registerType("rx-delay", RxDelayNode);
};
