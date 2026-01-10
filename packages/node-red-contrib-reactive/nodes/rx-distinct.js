module.exports = function(RED) {
    function RxDistinctNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.mode = config.mode || "untilChanged";
        node.keySelector = config.keySelector || "";

        let lastKey = undefined;
        let seenKeys = new Set();
        let keyFn = null;
        let count = 0;
        let distinctCount = 0;

        // Compile key selector if provided
        if (node.keySelector && node.keySelector.trim()) {
            try {
                keyFn = new Function('value', 'msg', `return (${node.keySelector});`);
            } catch (err) {
                node.error(`Invalid key selector: ${err.message}`);
                node.status({ fill: "red", shape: "ring", text: "invalid key" });
                return;
            }
        }

        function getKey(value, msg) {
            if (keyFn) {
                return keyFn(value, msg);
            }
            // Default: use JSON stringify for objects, direct value otherwise
            if (typeof value === 'object' && value !== null) {
                return JSON.stringify(value);
            }
            return value;
        }

        node.status({ fill: "grey", shape: "dot", text: "ready" });

        node.on('input', function(msg, send, done) {
            // Check for reset
            if (msg.reset === true) {
                lastKey = undefined;
                seenKeys.clear();
                count = 0;
                distinctCount = 0;
                node.status({ fill: "blue", shape: "ring", text: "reset" });
                if (done) done();
                return;
            }

            count++;

            try {
                const value = msg.payload;
                const key = getKey(value, msg);

                let isDistinct = false;

                if (node.mode === "all") {
                    // Distinct all-time: only pass if never seen before
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        isDistinct = true;
                    }
                } else {
                    // Distinct until changed: only pass if different from last
                    if (key !== lastKey) {
                        lastKey = key;
                        isDistinct = true;
                    }
                }

                if (isDistinct) {
                    distinctCount++;
                    msg._rxDistinct = true;
                    send(msg);
                    node.status({ fill: "green", shape: "dot", text: `${distinctCount}/${count} distinct` });
                } else {
                    node.status({ fill: "yellow", shape: "ring", text: `${distinctCount}/${count} distinct` });
                }
            } catch (err) {
                node.error(`Distinct error: ${err.message}`, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }

            if (done) done();
        });

        node.on('close', function(done) {
            lastKey = undefined;
            seenKeys.clear();
            count = 0;
            distinctCount = 0;
            done();
        });
    }

    RED.nodes.registerType("rx-distinct", RxDistinctNode);
};
