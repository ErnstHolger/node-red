const { Subject, interval } = require('rxjs');
const { buffer, bufferCount, bufferTime } = require('rxjs/operators');

module.exports = function(RED) {
    function RxBufferNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.mode = config.mode || "count";
        node.bufferSize = parseInt(config.bufferSize) || 5;
        node.timeSpan = parseInt(config.timeSpan) || 1000;

        const subject = new Subject();
        let subscription = null;
        let inputCount = 0;
        let outputCount = 0;

        // Set up the buffered stream based on mode
        let buffered$;
        if (node.mode === "time") {
            buffered$ = subject.pipe(bufferTime(node.timeSpan));
        } else {
            buffered$ = subject.pipe(bufferCount(node.bufferSize));
        }

        subscription = buffered$.subscribe({
            next: (buffer) => {
                if (buffer.length > 0) {
                    outputCount++;
                    const msg = {
                        payload: buffer,
                        bufferSize: buffer.length,
                        _rxBuffer: true
                    };
                    node.send(msg);
                    node.status({ fill: "green", shape: "dot", text: `buffers: ${outputCount} (${inputCount} items)` });
                }
            },
            error: (err) => {
                node.error(err.message);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }
        });

        if (node.mode === "time") {
            node.status({ fill: "grey", shape: "dot", text: `time: ${node.timeSpan}ms` });
        } else {
            node.status({ fill: "grey", shape: "dot", text: `count: ${node.bufferSize}` });
        }

        node.on('input', function(msg, send, done) {
            inputCount++;

            if (node.mode === "count") {
                node.status({ fill: "yellow", shape: "ring", text: `buffering: ${inputCount % node.bufferSize}/${node.bufferSize}` });
            }

            // Push the payload to the subject
            subject.next(msg.payload);

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

    RED.nodes.registerType("rx-buffer", RxBufferNode);
};
