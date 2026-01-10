module.exports = function(RED) {
    function RxFilterNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.condition = config.condition || "true";

        let filterFn = null;
        let index = 0;
        let passedCount = 0;

        // Compile the condition
        function compileCondition() {
            try {
                filterFn = new Function('value', 'index', 'msg', `return !!(${node.condition});`);
                return true;
            } catch (err) {
                node.error(`Invalid condition: ${err.message}`);
                node.status({ fill: "red", shape: "ring", text: "invalid condition" });
                return false;
            }
        }

        if (!compileCondition()) {
            return;
        }

        node.status({ fill: "grey", shape: "dot", text: "ready" });

        node.on('input', function(msg, send, done) {
            try {
                const value = msg.payload;
                const pass = filterFn(value, index, msg);
                index++;

                if (pass) {
                    passedCount++;
                    msg._rxFilter = true;
                    send(msg);
                    node.status({ fill: "green", shape: "dot", text: `passed: ${passedCount}/${index}` });
                } else {
                    node.status({ fill: "yellow", shape: "ring", text: `passed: ${passedCount}/${index}` });
                }
            } catch (err) {
                node.error(`Filter error: ${err.message}`, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            index = 0;
            passedCount = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-filter", RxFilterNode);
};
