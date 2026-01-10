module.exports = function(RED) {
    function EventChartNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.title = config.title || 'Event Chart';
        node.maxPoints = parseInt(config.maxPoints) || 200;
        node.timestampField = config.timestampField || 'timestamp';
        node.valueField = config.valueField || 'payload';
        node.seriesField = config.seriesField || 'topic';

        // Store data per series
        node.chartData = {};

        node.clearChart = function() {
            node.chartData = {};
            node.status({ fill: "grey", shape: "ring", text: "cleared" });
            emitData();
        };

        node.on('input', function(msg) {
            // Handle clear command
            if (msg.payload === '_clear' || msg.topic === '_clear') {
                node.clearChart();
                return;
            }

            const series = RED.util.getMessageProperty(msg, node.seriesField) || 'default';
            let timestamp = RED.util.getMessageProperty(msg, node.timestampField);
            let value = RED.util.getMessageProperty(msg, node.valueField);

            // Handle timestamp
            if (timestamp === undefined || timestamp === null) {
                timestamp = Date.now();
            } else if (typeof timestamp !== 'number') {
                timestamp = new Date(timestamp).getTime();
            }

            // Handle value
            if (value === undefined || value === null) {
                return;
            }

            if (typeof value !== 'number') {
                value = parseFloat(value);
                if (isNaN(value)) return;
            }

            if (!node.chartData[series]) {
                node.chartData[series] = [];
            }

            node.chartData[series].push({
                x: timestamp,
                y: value
            });

            // Limit points per series
            if (node.chartData[series].length > node.maxPoints) {
                node.chartData[series].shift();
            }

            const totalPoints = Object.values(node.chartData).reduce((sum, arr) => sum + arr.length, 0);
            const seriesCount = Object.keys(node.chartData).length;
            node.status({ fill: "green", shape: "dot", text: `${seriesCount} series, ${totalPoints} pts` });

            emitData();
        });

        function emitData() {
            RED.comms.publish("event-chart-data-" + node.id, {
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

    RED.nodes.registerType("event-chart", EventChartNode);

    // Clear chart data endpoint
    RED.httpAdmin.post("/event-chart/:id/clear", function(req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (node && node.clearChart) {
            node.clearChart();
            res.sendStatus(200);
        } else {
            res.status(404).send("Node not found");
        }
    });

    // Get chart data endpoint
    RED.httpAdmin.get("/event-chart/:id/data", function(req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (node) {
            res.json({ title: node.title, data: node.chartData || {} });
        } else {
            res.status(404).send("Node not found");
        }
    });
};
