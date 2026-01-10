const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');

module.exports = function(RED) {
    function RxDebounceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.time = parseInt(config.time) || 500;

        const subject = new Subject();
        let subscription = null;
        let inputCount = 0;
        let outputCount = 0;

        // Set up the debounced stream
        subscription = subject.pipe(
            debounceTime(node.time)
        ).subscribe({
            next: (msg) => {
                outputCount++;
                msg._rxDebounce = true;
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
            node.status({ fill: "yellow", shape: "ring", text: `waiting... ${inputCount}` });

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

    RED.nodes.registerType("rx-debounce", RxDebounceNode);
};
