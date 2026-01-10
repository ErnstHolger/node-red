module.exports = function(RED) {
    function RxMapNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.expression = config.expression || "value";

        let mapFn = null;
        let index = 0;

        // Compile the expression
        function compileExpression() {
            try {
                mapFn = new Function('value', 'index', 'msg', `return (${node.expression});`);
                return true;
            } catch (err) {
                node.error(`Invalid expression: ${err.message}`);
                node.status({ fill: "red", shape: "ring", text: "invalid expression" });
                return false;
            }
        }

        if (!compileExpression()) {
            return;
        }

        node.status({ fill: "grey", shape: "dot", text: "ready" });

        node.on('input', function(msg, send, done) {
            try {
                const value = msg.payload;
                const result = mapFn(value, index, msg);
                index++;

                msg.payload = result;
                msg._rxMap = true;

                send(msg);
                node.status({ fill: "green", shape: "dot", text: `mapped: ${index}` });
            } catch (err) {
                node.error(`Map error: ${err.message}`, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            index = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-map", RxMapNode);
};
