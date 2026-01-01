module.exports = function(RED) {
    
    // QuestDB Chart Node with uPlot visualization
    function QuestDBChartNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.chartTitle = config.chartTitle || 'Data Chart';
        node.maxPoints = parseInt(config.maxPoints) || 100;
        node.yMin = config.yMin !== '' ? parseFloat(config.yMin) : null;
        node.yMax = config.yMax !== '' ? parseFloat(config.yMax) : null;
        node.chartHeight = parseInt(config.chartHeight) || 300;
        node.chartWidth = parseInt(config.chartWidth) || 600;
        node.updateInterval = parseInt(config.updateInterval) || 100;
        node.alignInterval = parseInt(config.alignInterval) || 1000;

        // Store data for multiple series
        node.dataSeries = {};
        node.seriesOrder = [];

        // Round timestamp to align data from multiple sources
        function alignTimestamp(ts) {
            return Math.round(ts / node.alignInterval) * node.alignInterval;
        }

        // Handle incoming messages
        node.on('input', function(msg) {
            try {
                // Extract tag name and value
                let tagName, value, timestamp;
                
                if (msg.payload && msg.payload.symbols && msg.payload.columns) {
                    // QuestDB format
                    tagName = msg.payload.symbols.tag_name || msg.topic || 'default';
                    value = msg.payload.columns.value;
                    timestamp = alignTimestamp(msg.payload.timestamp ? new Date(msg.payload.timestamp).getTime() : Date.now());
                } else if (msg.topic && typeof msg.payload === 'number') {
                    // Simple format from simulator
                    tagName = msg.topic;
                    value = msg.payload;
                    timestamp = alignTimestamp(msg.timestamp || Date.now());
                } else if (typeof msg.payload === 'number') {
                    tagName = msg.topic || 'default';
                    value = msg.payload;
                    timestamp = alignTimestamp(msg.timestamp || Date.now());
                } else {
                    node.warn('Unsupported message format');
                    return;
                }
                
                // Initialize series if needed
                if (!node.dataSeries[tagName]) {
                    node.dataSeries[tagName] = {
                        timestamps: [],
                        values: [],
                        color: getColorForSeries(node.seriesOrder.length)
                    };
                    node.seriesOrder.push(tagName);
                }
                
                const series = node.dataSeries[tagName];

                // Check if this aligned timestamp already exists (update instead of add)
                const existingIdx = series.timestamps.indexOf(timestamp);
                if (existingIdx >= 0) {
                    series.values[existingIdx] = value;
                } else {
                    series.timestamps.push(timestamp);
                    series.values.push(value);

                    // Limit data points
                    if (series.timestamps.length > node.maxPoints) {
                        series.timestamps.shift();
                        series.values.shift();
                    }
                }
                
                // Update status
                const lastValues = node.seriesOrder
                    .map(name => `${name}:${node.dataSeries[name].values[node.dataSeries[name].values.length-1].toFixed(1)}`)
                    .join(' | ');
                
                node.status({
                    fill: "blue", 
                    shape: "dot", 
                    text: lastValues.substring(0, 40)
                });
                
            } catch (err) {
                node.error('Error processing message: ' + err.message);
            }
        });

        // Helper function to generate colors for series
        function getColorForSeries(index) {
            const colors = [
                '#3498db', // blue
                '#e74c3c', // red
                '#2ecc71', // green
                '#f39c12', // orange
                '#9b59b6', // purple
                '#1abc9c', // teal
                '#e67e22', // dark orange
                '#34495e'  // dark gray
            ];
            return colors[index % colors.length];
        }
        
        node.on('close', function() {
            node.dataSeries = {};
            node.seriesOrder = [];
        });
    }
    
    RED.nodes.registerType("qdb-chart", QuestDBChartNode);

    // Store reference to nodes for HTTP access
    const chartNodes = {};

    RED.events.on("nodes:add", function(n) {
        if (n.type === "qdb-chart") chartNodes[n.id] = n;
    });
    RED.events.on("nodes:remove", function(n) {
        if (n.type === "qdb-chart") delete chartNodes[n.id];
    });

    // HTTP endpoint to reset chart data
    RED.httpAdmin.post('/qdb-chart/:id/reset', function(req, res) {
        const nodeId = req.params.id;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        node.dataSeries = {};
        node.seriesOrder = [];
        node.status({ fill: "grey", shape: "ring", text: "Reset" });
        res.json({ success: true });
    });

    // HTTP endpoint to get chart data
    RED.httpAdmin.get('/qdb-chart/:id/data', function(req, res) {
        const nodeId = req.params.id;
        const node = RED.nodes.getNode(nodeId);

        if (!node || !node.dataSeries) {
            res.json({ data: [[]], series: [], config: {} });
            return;
        }

        // Prepare uPlot data
        if (node.seriesOrder.length === 0) {
            res.json({ data: [[]], series: [], config: {
                title: node.chartTitle,
                height: node.chartHeight,
                width: node.chartWidth,
                yMin: node.yMin,
                yMax: node.yMax
            }});
            return;
        }

        const allTimestamps = new Set();
        node.seriesOrder.forEach(name => {
            node.dataSeries[name].timestamps.forEach(ts => allTimestamps.add(ts));
        });

        const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
        const uplotData = [sortedTimestamps.map(ts => ts / 1000)];

        node.seriesOrder.forEach(name => {
            const series = node.dataSeries[name];
            const seriesData = sortedTimestamps.map(ts => {
                const idx = series.timestamps.indexOf(ts);
                return idx >= 0 ? series.values[idx] : null;
            });
            uplotData.push(seriesData);
        });

        res.json({
            data: uplotData,
            series: node.seriesOrder.map(name => ({
                label: name,
                stroke: node.dataSeries[name].color,
                width: 2,
                spanGaps: true
            })),
            config: {
                title: node.chartTitle,
                height: node.chartHeight,
                width: node.chartWidth,
                yMin: node.yMin,
                yMax: node.yMax
            }
        });
    });

    // HTTP endpoint for chart UI
    RED.httpAdmin.get('/qdb-chart/:id', function(req, res) {
        const nodeId = req.params.id;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).send('Node not found. Deploy the flow first.');
            return;
        }

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>${node.chartTitle}</title>
    <script src="https://cdn.jsdelivr.net/npm/uplot@1.6.24/dist/uPlot.iife.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/uplot@1.6.24/dist/uPlot.min.css">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow: hidden; }
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; }
        #chart-container { background: #16213e; padding: 15px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0; }
        h2 { color: #eee; font-size: 18px; }
        .btn { background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 8px; }
        .btn:hover { background: #c0392b; }
        .btn-toggle { background: #3498db; }
        .btn-toggle:hover { background: #2980b9; }
        #chart { flex: 1; min-height: 0; overflow: hidden; }
        #chart.multiplot { overflow-y: auto; }
        .subplot { margin-bottom: 8px; }
        .info { color: #888; font-size: 12px; padding-top: 8px; flex-shrink: 0; }
        .u-legend { background: #1a1a2e !important; }
        .u-legend th, .u-legend td { color: #eee !important; }
        .u-wrap { overflow: hidden !important; }
    </style>
</head>
<body>
    <div id="chart-container">
        <div class="header">
            <h2>${node.chartTitle}</h2>
            <div>
                <button class="btn btn-toggle" id="toggleBtn" onclick="toggleMode()">Single Axis</button>
                <button class="btn" onclick="resetChart()">Reset</button>
            </div>
        </div>
        <div id="chart"></div>
        <div class="info" id="info">Connecting...</div>
    </div>
    <script>
        let charts = [];
        let mode = 0; // 0=single, 1=dual, 2=multi
        const modes = ['Single Axis', 'Dual Axes', 'Multi-Plot'];
        const nodeId = '${nodeId}';
        const updateInterval = ${node.updateInterval || 100};

        function toggleMode() {
            mode = (mode + 1) % 3;
            document.getElementById('toggleBtn').textContent = modes[mode];
            document.getElementById('chart').classList.toggle('multiplot', mode === 2);
            destroyCharts();
        }

        function destroyCharts() {
            charts.forEach(c => c.destroy());
            charts = [];
            document.getElementById('chart').innerHTML = '';
        }

        async function resetChart() {
            try {
                await fetch('/qdb-chart/' + nodeId + '/reset', { method: 'POST' });
                destroyCharts();
                document.getElementById('info').textContent = 'Reset - waiting for data...';
            } catch (err) {
                document.getElementById('info').textContent = 'Reset error: ' + err.message;
            }
        }

        async function fetchData() {
            try {
                const response = await fetch('/qdb-chart/' + nodeId + '/data');
                const result = await response.json();
                updateChart(result);
            } catch (err) {
                document.getElementById('info').textContent = 'Error: ' + err.message;
            }
        }

        function getChartSize() {
            const container = document.getElementById('chart');
            return { width: Math.max(200, container.clientWidth - 10), height: Math.max(150, container.clientHeight - 10) };
        }

        function updateChart(result) {
            const chartData = result.data;
            const series = result.series;
            const config = result.config;

            if (!chartData || chartData.length === 0 || chartData[0].length === 0) {
                document.getElementById('info').textContent = 'Waiting for data...';
                return;
            }

            const container = document.getElementById('chart');
            const size = getChartSize();

            if (mode === 2) {
                // Multi-Plot mode: separate chart per series
                container.classList.add('multiplot');
                const plotHeight = 150;

                if (charts.length !== series.length) {
                    destroyCharts();
                    series.forEach((s, idx) => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'subplot';
                        wrapper.id = 'subplot-' + idx;
                        container.appendChild(wrapper);

                        const singleData = [chartData[0], chartData[idx + 1]];
                        const opts = {
                            width: size.width,
                            height: plotHeight,
                            scales: { x: { time: true }, y: { auto: true } },
                            series: [{ label: 'Time' }, { label: s.label, stroke: s.stroke, width: 2, spanGaps: true }],
                            axes: [
                                { stroke: '#888', grid: { stroke: '#333' }, size: 40 },
                                { stroke: s.stroke, grid: { stroke: '#333' }, size: 50, values: (u, vals) => vals.map(v => v != null ? v.toFixed(1) : '') }
                            ],
                            legend: { show: true }
                        };
                        charts.push(new uPlot(opts, singleData, wrapper));
                    });
                } else {
                    series.forEach((s, idx) => {
                        const singleData = [chartData[0], chartData[idx + 1]];
                        charts[idx].setData(singleData);
                    });
                }
            } else {
                // Single or Dual Axes mode
                container.classList.remove('multiplot');
                const seriesWithScale = series.map((s, idx) => ({
                    ...s,
                    scale: mode === 1 ? (idx % 2 === 0 ? 'y' : 'y2') : 'y',
                    spanGaps: true
                }));

                const scales = { x: { time: true }, y: { auto: true } };
                const axes = [
                    { stroke: '#888', grid: { stroke: '#333' } },
                    { scale: 'y', stroke: '#3498db', grid: { stroke: '#333' }, values: (u, vals) => vals.map(v => v != null ? v.toFixed(2) : '') }
                ];

                if (mode === 1) {
                    scales.y2 = { auto: true };
                    axes.push({ scale: 'y2', side: 1, stroke: '#e74c3c', grid: { show: false }, values: (u, vals) => vals.map(v => v != null ? v.toFixed(2) : '') });
                }

                const opts = {
                    width: size.width,
                    height: size.height,
                    scales: scales,
                    series: [{ label: 'Time' }, ...seriesWithScale],
                    axes: axes
                };

                if (charts.length === 0) {
                    charts.push(new uPlot(opts, chartData, container));
                } else {
                    charts[0].setData(chartData);
                }
            }

            document.getElementById('info').textContent = series.length + ' series, ' + chartData[0].length + ' points (' + modes[mode] + ')';
        }

        setInterval(fetchData, updateInterval);
        fetchData();

        window.addEventListener('resize', () => {
            if (charts.length > 0) {
                destroyCharts();
            }
        });
    </script>
</body>
</html>
        `);
    });
};
