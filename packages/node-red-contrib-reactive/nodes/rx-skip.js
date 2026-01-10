module.exports = function(RED) {
    function RxSkipNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.count = parseInt(config.count) || 5;

        let skipped = 0;
        let passed = 0;

        node.status({ fill: "grey", shape: "dot", text: `skip ${node.count}` });

        node.on('input', function(msg, send, done) {
            // Check for reset
            if (msg.reset === true) {
                skipped = 0;
                passed = 0;
                node.status({ fill: "blue", shape: "ring", text: "reset" });
                if (done) done();
                return;
            }

            if (skipped < node.count) {
                skipped++;
                node.status({ fill: "yellow", shape: "ring", text: `skipping: ${skipped}/${node.count}` });
            } else {
                passed++;
                msg._rxSkip = true;
                msg.skipPassed = passed;
                send(msg);
                node.status({ fill: "green", shape: "dot", text: `passed: ${passed}` });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            skipped = 0;
            passed = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-skip", RxSkipNode);
};
