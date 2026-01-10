module.exports = function(RED) {
    function RxTakeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.count = parseInt(config.count) || 5;

        let taken = 0;

        node.status({ fill: "grey", shape: "dot", text: `0/${node.count}` });

        node.on('input', function(msg, send, done) {
            // Check for reset
            if (msg.reset === true) {
                taken = 0;
                node.status({ fill: "blue", shape: "ring", text: "reset" });
                if (done) done();
                return;
            }

            if (taken < node.count) {
                taken++;
                msg._rxTake = true;
                msg.takeIndex = taken;
                send(msg);
                node.status({ fill: "green", shape: "dot", text: `${taken}/${node.count}` });

                if (taken >= node.count) {
                    node.status({ fill: "blue", shape: "ring", text: "complete" });
                }
            } else {
                node.status({ fill: "grey", shape: "ring", text: `complete (${taken})` });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            taken = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-take", RxTakeNode);
};
