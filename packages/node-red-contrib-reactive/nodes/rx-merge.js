module.exports = function(RED) {
    function RxMergeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let count = 0;

        node.status({ fill: "grey", shape: "dot", text: "ready" });

        node.on('input', function(msg, send, done) {
            count++;
            msg._rxMerge = true;
            msg._mergeCount = count;

            send(msg);
            node.status({ fill: "green", shape: "dot", text: `merged: ${count}` });

            if (done) done();
        });

        node.on('close', function(done) {
            count = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-merge", RxMergeNode);
};
