module.exports = function(RED) {
    function ChartNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.title = config.title || 'Chart';
        node.maxPoints = parseInt(config.maxPoints) || 100;
        node.timestampField = config.timestampField || 'timestamp';
        node.valueField = config.valueField || 'value';
        node.seriesField = config.seriesField || 'topic';

        // Store data per series on node instance for API access
        node.chartData = {};

        node.clearChart = function() {
            node.chartData = {};
            node.status({ fill: "grey", shape: "ring", text: "Cleared" });
            emitData();
        };

        node.on('input', function(msg) {
            // Handle clear command
            if (msg.payload === '_clear' || msg.topic === '_clear') {
                node.clearChart();
                return;
            }

            var series = RED.util.getMessageProperty(msg, node.seriesField) || 'default';
            var timestamp = RED.util.getMessageProperty(msg, node.timestampField) || Date.now();
            var value = RED.util.getMessageProperty(msg, node.valueField);

            // Determine if this is compressed data
            var isCompressed = msg.compressed === true;
            var seriesKey = isCompressed ? series + ' (compressed)' : series + ' (raw)';

            if (value === undefined || value === null) {
                return;
            }

            if (!node.chartData[seriesKey]) {
                node.chartData[seriesKey] = [];
            }

            node.chartData[seriesKey].push({
                x: timestamp,
                y: typeof value === 'number' ? value : parseFloat(value)
            });

            // Limit points per series
            if (node.chartData[seriesKey].length > node.maxPoints) {
                node.chartData[seriesKey].shift();
            }

            var totalPoints = Object.values(node.chartData).reduce((sum, arr) => sum + arr.length, 0);
            node.status({ fill: "green", shape: "dot", text: totalPoints + " points" });

            emitData();
        });

        function emitData() {
            RED.comms.publish("chart-data-" + node.id, {
                id: node.id,
                title: node.title,
                data: node.chartData
            });
        }

        node.on('close', function() {
            node.chartData = {};
            node.status({});
        });
    }

    RED.nodes.registerType("chart", ChartNode);

    // Clear chart data endpoint
    RED.httpAdmin.post("/chart/:id/clear", function(req, res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node && node.clearChart) {
            node.clearChart();
            res.sendStatus(200);
        } else {
            res.status(404).send("Node not found");
        }
    });

    // Get chart data endpoint
    RED.httpAdmin.get("/chart/:id/data", function(req, res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node) {
            res.json({ title: node.title, data: node.chartData || {} });
        } else {
            res.status(404).send("Node not found");
        }
    });
};
