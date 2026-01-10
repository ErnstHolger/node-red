module.exports = function(RED) {
    function RxScanNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.expression = config.expression || "acc + value";
        node.initialValue = config.initialValue || "0";

        let scanFn = null;
        let accumulator = null;
        let index = 0;

        // Parse initial value
        function parseInitialValue() {
            try {
                return JSON.parse(node.initialValue);
            } catch (e) {
                return node.initialValue;
            }
        }

        // Compile the expression
        function compileExpression() {
            try {
                scanFn = new Function('acc', 'value', 'index', 'msg', `return (${node.expression});`);
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

        accumulator = parseInitialValue();
        node.status({ fill: "grey", shape: "dot", text: `acc: ${JSON.stringify(accumulator)}` });

        node.on('input', function(msg, send, done) {
            // Check for reset
            if (msg.reset === true) {
                accumulator = parseInitialValue();
                index = 0;
                node.status({ fill: "blue", shape: "ring", text: "reset" });
                if (done) done();
                return;
            }

            try {
                const value = msg.payload;
                accumulator = scanFn(accumulator, value, index, msg);
                index++;

                msg.payload = accumulator;
                msg._rxScan = true;
                msg.scanIndex = index;

                send(msg);

                // Truncate display for long values
                let displayValue = JSON.stringify(accumulator);
                if (displayValue.length > 20) {
                    displayValue = displayValue.substring(0, 17) + "...";
                }
                node.status({ fill: "green", shape: "dot", text: `acc: ${displayValue}` });
            } catch (err) {
                node.error(`Scan error: ${err.message}`, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            accumulator = parseInitialValue();
            index = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-scan", RxScanNode);
};
