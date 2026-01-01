module.exports = function(RED) {
    const EPSILON = 1e-15;

    function getSnapshot(node, key) {
        return node.context().global.get(key) || {};
    }
    function setSnapshot(node, key, data) {
        node.context().global.set(key, data);
    }

    function CompressionNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.algorithm = config.algorithm || 'deduplicate';
        node.deviation = parseFloat(config.deviation) || 0.1;
        node.minDuration = parseFloat(config.minDuration) || 0;
        node.maxDuration = parseFloat(config.maxDuration) || 86400;
        node.snapshotKey = config.snapshotKey || 'snapshot';
        node.timestampField = config.timestampField || 'timestamp';
        node.valueField = config.valueField || 'value';

        node.on('input', function(msg) {
            var state = getSnapshot(node, node.snapshotKey);
            var topic = msg.topic || 'default';

            // Read timestamp and value from configured fields
            var rawTs = RED.util.getMessageProperty(msg, node.timestampField) || Date.now();
            var t = rawTs > 1e12 ? rawTs / 1000 : rawTs;
            var rawValue = RED.util.getMessageProperty(msg, node.valueField);
            var z = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);

            if (isNaN(z)) {
                node.warn("Invalid value - not a number");
                node.status({ fill: "red", shape: "ring", text: "Invalid" });
                return;
            }

            if (!state[topic]) {
                if (node.algorithm === 'swinging-door' || node.algorithm.includes('+prev')) {
                    state[topic] = { t: t, z: z, minSlope: -Infinity, maxSlope: Infinity, prevT: t, prevZ: z, count: 0 };
                } else {
                    state[topic] = { t: t, z: z, count: 0 };
                }
                setSnapshot(node, node.snapshotKey, state);
                node.status({ fill: "green", shape: "dot", text: "Init: " + z.toFixed(2) });
                var outMsg = RED.util.cloneMessage(msg);
                outMsg.compressed = true;
                outMsg.skippedCount = 0;
                node.send([msg, outMsg]);
                return;
            }

            var s = state[topic];
            if (t <= s.t) {
                var outMsg = RED.util.cloneMessage(msg);
                outMsg.compressed = true;
                outMsg.outOfOrder = true;
                node.send([msg, outMsg]);
                return;
            }

            s.count++;
            var dt = t - s.t;
            var shouldOutput = false;
            var outputPrev = false;

            switch (node.algorithm) {
                case 'deduplicate':
                    shouldOutput = (Math.abs(z - s.z) >= EPSILON && dt >= node.minDuration) || dt >= node.maxDuration;
                    break;
                case 'deduplicate+prev':
                    shouldOutput = (Math.abs(z - s.z) >= EPSILON && dt >= node.minDuration) || dt >= node.maxDuration;
                    outputPrev = shouldOutput && Math.abs(s.t - (s.prevT || s.t)) >= 1e-6;
                    break;
                case 'timedelta':
                    shouldOutput = dt >= node.minDuration;
                    break;
                case 'exception':
                    shouldOutput = (Math.abs(z - s.z) >= node.deviation && dt >= node.minDuration) || dt >= node.maxDuration;
                    break;
                case 'exception+prev':
                    shouldOutput = (Math.abs(z - s.z) >= node.deviation && dt >= node.minDuration) || dt >= node.maxDuration;
                    outputPrev = shouldOutput && Math.abs(s.t - (s.prevT || s.t)) >= 1e-6;
                    break;
                case 'swinging-door':
                    if (dt < EPSILON) break;
                    var minSlope = (z - node.deviation - s.z) / dt;
                    var maxSlope = (z + node.deviation - s.z) / dt;
                    var slopeCondition = minSlope > s.maxSlope || maxSlope < s.minSlope;
                    shouldOutput = (slopeCondition && dt >= node.minDuration) || dt >= node.maxDuration;
                    if (!shouldOutput) {
                        s.minSlope = Math.max(s.minSlope, minSlope);
                        s.maxSlope = Math.min(s.maxSlope, maxSlope);
                    }
                    break;
            }

            if (shouldOutput) {
                var skipped = s.count;

                if (outputPrev && s.prevT && s.prevZ !== undefined) {
                    var prevMsg = RED.util.cloneMessage(msg);
                    RED.util.setMessageProperty(prevMsg, node.valueField, s.prevZ);
                    RED.util.setMessageProperty(prevMsg, node.timestampField, s.prevT * 1000);
                    prevMsg.compressed = true;
                    prevMsg.isPreviousPoint = true;
                    prevMsg.skippedCount = skipped;
                    node.send([msg, prevMsg]);
                    skipped = 0;
                }

                if (node.algorithm === 'swinging-door') {
                    var outMsg = RED.util.cloneMessage(msg);
                    RED.util.setMessageProperty(outMsg, node.valueField, s.prevZ);
                    RED.util.setMessageProperty(outMsg, node.timestampField, s.prevT * 1000);
                    outMsg.compressed = true;
                    outMsg.skippedCount = skipped;
                    s.t = s.prevT;
                    s.z = s.prevZ;
                    var newDt = t - s.t;
                    if (newDt > EPSILON) {
                        s.minSlope = (z - node.deviation - s.z) / newDt;
                        s.maxSlope = (z + node.deviation - s.z) / newDt;
                    } else {
                        s.minSlope = -Infinity;
                        s.maxSlope = Infinity;
                    }
                    node.status({ fill: "green", shape: "dot", text: "Door: " + outMsg[node.valueField].toFixed(2) });
                    node.send([msg, outMsg]);
                } else {
                    var outMsg = RED.util.cloneMessage(msg);
                    RED.util.setMessageProperty(outMsg, node.valueField, z);
                    RED.util.setMessageProperty(outMsg, node.timestampField, t * 1000);
                    outMsg.compressed = true;
                    outMsg.skippedCount = skipped;
                    s.t = t;
                    s.z = z;
                    node.status({ fill: "green", shape: "dot", text: z.toFixed(2) });
                    node.send([msg, outMsg]);
                }

                s.prevT = t;
                s.prevZ = z;
                s.count = 0;
                setSnapshot(node, node.snapshotKey, state);
            } else {
                s.prevT = t;
                s.prevZ = z;
                setSnapshot(node, node.snapshotKey, state);
                node.status({ fill: "yellow", shape: "dot", text: "Skip: " + z.toFixed(2) });
                node.send([msg, null]);
            }
        });

        node.on('close', function() { node.status({}); });
    }
    RED.nodes.registerType("compression", CompressionNode);
};
