const fs = require('fs');
const path = require('path');

module.exports = function(RED) {

    const dataDir = path.join(RED.settings.userDir || '.', 'mapping-data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const tableDataStore = {};

    function getFilePath(nodeId) {
        return path.join(dataDir, `${nodeId}.json`);
    }

    function loadFromFile(nodeId) {
        const filePath = getFilePath(nodeId);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (err) {
                return [];
            }
        }
        return [];
    }

    function saveToFile(nodeId, data) {
        const filePath = getFilePath(nodeId);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    function MappingNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.tableName = config.tableName || 'Mapping';
        node.contextName = config.contextName || (config.tableName || 'mapping').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        node.contextType = config.contextType || 'global';

        tableDataStore[node.id] = {
            data: [],
            config: { name: node.tableName }
        };

        function updateContext(data) {
            var dict = {};
            var reverseDict = {};
            for (var i = 0; i < data.length; i++) {
                var row = data[i];
                if (row.id) {
                    dict[row.id.toLowerCase()] = {
                        name: row.name || '',
                        type: row.type || 'None',
                        deviation: parseFloat(row.deviation) || 0,
                        interval: parseInt(row.interval) || 0
                    };
                    if (row.name) {
                        reverseDict[row.name] = {
                            id: row.id,
                            type: row.type || 'None',
                            deviation: parseFloat(row.deviation) || 0,
                            interval: parseInt(row.interval) || 0
                        };
                    }
                }
            }
            var ctx = node.contextType === 'flow' ? node.context().flow : node.context().global;
            ctx.set(node.contextName, dict);
            ctx.set(node.contextName + '_reverse', reverseDict);
        }

        const savedData = loadFromFile(node.id);
        if (savedData && Array.isArray(savedData) && savedData.length > 0) {
            tableDataStore[node.id].data = savedData;
            updateContext(savedData);
            node.status({ fill: "blue", shape: "dot", text: `${savedData.length} mappings` });
        } else {
            updateContext([]);
            node.status({ fill: "grey", shape: "ring", text: "No mappings" });
        }

        function sendOutputs(data) {
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                node.send([
                    { topic: row.id, payload: row.id },
                    { topic: row.id, payload: row.name },
                    { topic: row.id, payload: row, type: row.type || 'None', deviation: parseFloat(row.deviation) || 0, interval: parseInt(row.interval) || 0 }
                ]);
            }
        }

        node.on('input', function(msg) {
            try {
                if (msg.payload === 'clear' || msg.clear === true) {
                    tableDataStore[node.id].data = [];
                    saveToFile(node.id, []);
                    updateContext([]);
                    node.status({ fill: "grey", shape: "ring", text: "Cleared" });
                    sendOutputs([]);
                    return;
                }

                if (msg.payload === 'get' || msg.get === true) {
                    sendOutputs(tableDataStore[node.id].data);
                    return;
                }

                if (msg.payload && Array.isArray(msg.payload)) {
                    tableDataStore[node.id].data = msg.payload;
                    saveToFile(node.id, msg.payload);
                    updateContext(msg.payload);
                    node.status({ fill: "green", shape: "dot", text: `${msg.payload.length} mappings set` });
                    sendOutputs(msg.payload);
                    return;
                }

                if (msg.id && msg.name) {
                    const newMapping = {
                        id: msg.id,
                        name: msg.name,
                        type: msg.type || 'None',
                        deviation: parseFloat(msg.deviation) || 0,
                        interval: parseInt(msg.interval) || 0
                    };
                    tableDataStore[node.id].data.push(newMapping);
                    saveToFile(node.id, tableDataStore[node.id].data);
                    updateContext(tableDataStore[node.id].data);
                    node.status({ fill: "green", shape: "dot", text: `Added: ${msg.id}` });
                    sendOutputs(tableDataStore[node.id].data);
                    return;
                }

                sendOutputs(tableDataStore[node.id].data);

            } catch (err) {
                node.error('Error processing message: ' + err.message);
            }
        });

        node.on('close', function() {
            delete tableDataStore[node.id];
        });
    }

    RED.nodes.registerType("mapping", MappingNode);

    RED.httpAdmin.get('/mapping/:id/data', function(req, res) {
        const nodeId = req.params.id;
        const data = tableDataStore[nodeId];
        if (!data) {
            res.json({ error: 'No data', data: [] });
            return;
        }
        res.json(data);
    });

    RED.httpAdmin.post('/mapping/:id/save', function(req, res) {
        const nodeId = req.params.id;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        try {
            const newData = req.body.data || [];
            tableDataStore[nodeId].data = newData;
            saveToFile(nodeId, newData);

            // Build both forward and reverse dicts
            var dict = {};
            var reverseDict = {};
            for (var i = 0; i < newData.length; i++) {
                var row = newData[i];
                if (row.id) {
                    dict[row.id.toLowerCase()] = {
                        name: row.name || '',
                        type: row.type || 'None',
                        deviation: parseFloat(row.deviation) || 0,
                        interval: parseInt(row.interval) || 0
                    };
                    if (row.name) {
                        reverseDict[row.name] = {
                            id: row.id,
                            type: row.type || 'None',
                            deviation: parseFloat(row.deviation) || 0,
                            interval: parseInt(row.interval) || 0
                        };
                    }
                }
            }
            var ctx = node.contextType === 'flow' ? node.context().flow : node.context().global;
            ctx.set(node.contextName, dict);
            ctx.set(node.contextName + '_reverse', reverseDict);
            node.status({ fill: "blue", shape: "dot", text: `${newData.length} mappings` });
            res.json({ success: true, count: newData.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    RED.httpAdmin.post('/mapping/:id/send', function(req, res) {
        const nodeId = req.params.id;
        const node = RED.nodes.getNode(nodeId);

        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }

        try {
            let data = [];
            if (tableDataStore[nodeId] && tableDataStore[nodeId].data) {
                data = tableDataStore[nodeId].data;
            } else {
                data = loadFromFile(nodeId);
                if (!tableDataStore[nodeId]) {
                    tableDataStore[nodeId] = { data: data, config: {} };
                } else {
                    tableDataStore[nodeId].data = data;
                }
            }

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                node.send([
                    { topic: row.id, payload: row.id },
                    { topic: row.id, payload: row.name },
                    { topic: row.id, payload: row, type: row.type || 'None', deviation: parseFloat(row.deviation) || 0, interval: parseInt(row.interval) || 0 }
                ]);
            }

            node.status({ fill: "green", shape: "dot", text: `Sent ${data.length} mappings` });
            res.json({ success: true, count: data.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    RED.httpAdmin.get('/mapping/:id', function(req, res) {
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
    <title>${node.tableName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%; height: 100%;
            font-family: Arial, sans-serif;
            background: #21222c; color: #f8f8f2;
        }
        #container {
            width: 100%; height: 100%;
            display: flex; flex-direction: column; padding: 15px;
        }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 15px; background: #2a2b36;
            border-radius: 6px; margin-bottom: 15px;
        }
        h2 { color: #f8f8f2; font-size: 18px; font-weight: normal; }
        .controls { display: flex; gap: 10px; align-items: center; }
        .info { color: #6272a4; font-size: 13px; }
        button {
            padding: 8px 16px; border: none; border-radius: 4px;
            cursor: pointer; font-size: 13px; transition: background 0.2s;
        }
        #add-btn { background: #4CAF50; color: white; }
        #add-btn:hover { background: #43A047; }
        #copy-btn { background: #1976D2; color: white; }
        #copy-btn:hover { background: #1565C0; }
        #paste-btn { background: #7B1FA2; color: white; }
        #paste-btn:hover { background: #6A1B9A; }
        #clear-btn { background: #D32F2F; color: white; }
        #clear-btn:hover { background: #b71c1c; }
        #close-btn { background: #303030; color: white; }
        #close-btn:hover { background: #212121; }
        .table-wrapper {
            flex: 1; overflow: auto;
            background: #282a36; border-radius: 6px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #44475a; }
        th { background: #44475a; color: #f8f8f2; font-weight: 600; position: sticky; top: 0; }
        tr:hover { background: #44475a; }
        input[type="text"], input[type="number"] {
            width: 100%; padding: 8px 10px;
            background: #21222c; border: 1px solid #44475a;
            border-radius: 4px; color: #f8f8f2; font-size: 14px;
        }
        input[type="text"]:focus, input[type="number"]:focus { outline: none; border-color: #1039b6; }
        input[type="number"] { width: 80px; }
        .delete-btn { background: #D32F2F; color: white; padding: 5px 10px; font-size: 12px; }
        .delete-btn:hover { background: #b71c1c; }
        .status {
            margin-top: 10px; padding: 10px 15px;
            background: #2a2b36; border-radius: 6px;
            color: #43A047; font-size: 13px;
        }
        .status.error { color: #D32F2F; }
    </style>
</head>
<body>
    <div id="container">
        <div class="header">
            <h2>${node.tableName}</h2>
            <div class="controls">
                <span id="info" class="info">Loading...</span>
                <button id="add-btn">+ Add Row</button>
                <button id="copy-btn">Copy</button>
                <button id="paste-btn">Paste</button>
                <button id="clear-btn">Clear All</button>
                <button id="close-btn">Close</button>
            </div>
        </div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width: 25%">Id</th>
                        <th style="width: 25%">Name</th>
                        <th style="width: 12%">Type</th>
                        <th style="width: 12%">Deviation</th>
                        <th style="width: 12%">Interval</th>
                        <th style="width: 14%">Action</th>
                    </tr>
                </thead>
                <tbody id="table-body"></tbody>
            </table>
        </div>
        <div id="status" class="status" style="display: none;"></div>
    </div>

    <script>
        const nodeId = '${nodeId}';
        let tableData = [];
        let saveTimeout = null;

        async function fetchData() {
            try {
                const response = await fetch('/mapping/' + nodeId + '/data');
                const result = await response.json();
                tableData = result.data || [];
                renderTable();
                updateInfo();
            } catch (err) {
                showStatus('Failed to load data: ' + err.message, true);
            }
        }

        function renderTable() {
            const tbody = document.getElementById('table-body');
            tbody.innerHTML = '';

            tableData.forEach((row, index) => {
                const type = row.type || 'None';
                const deviation = parseFloat(row.deviation) || 0;
                const interval = parseInt(row.interval) || 0;
                const tr = document.createElement('tr');
                tr.innerHTML = \`
                    <td><input type="text" value="\${escapeHtml(row.id || '')}" data-index="\${index}" data-field="id"></td>
                    <td><input type="text" value="\${escapeHtml(row.name || '')}" data-index="\${index}" data-field="name"></td>
                    <td>
                        <select data-index="\${index}" data-field="type" style="width:100%; padding:8px; background:#21222c; border:1px solid #44475a; border-radius:4px; color:#f8f8f2;">
                            <option value="None" \${type === 'None' ? 'selected' : ''}>None</option>
                            <option value="Dedup" \${type === 'Dedup' ? 'selected' : ''}>Dedup</option>
                            <option value="ExcDev" \${type === 'ExcDev' ? 'selected' : ''}>ExcDev</option>
                            <option value="ExcDev2" \${type === 'ExcDev2' ? 'selected' : ''}>ExcDev2</option>
                            <option value="Comp" \${type === 'Comp' ? 'selected' : ''}>Comp</option>
                            <option value="Sample" \${type === 'Sample' ? 'selected' : ''}>Sample</option>
                        </select>
                    </td>
                    <td><input type="number" value="\${deviation}" data-index="\${index}" data-field="deviation" step="0.01" min="0"></td>
                    <td><input type="number" value="\${interval}" data-index="\${index}" data-field="interval" min="0"></td>
                    <td><button class="delete-btn" onclick="deleteRow(\${index})">Delete</button></td>
                \`;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('input[type="text"]').forEach(input => {
                input.addEventListener('input', function() {
                    const index = parseInt(this.dataset.index);
                    const field = this.dataset.field;
                    tableData[index][field] = this.value;
                    scheduleAutoSave();
                });
            });

            tbody.querySelectorAll('input[type="number"]').forEach(input => {
                input.addEventListener('input', function() {
                    const index = parseInt(this.dataset.index);
                    const field = this.dataset.field;
                    if (field === 'deviation') {
                        tableData[index].deviation = parseFloat(this.value) || 0;
                    } else {
                        tableData[index].interval = parseInt(this.value) || 0;
                    }
                    scheduleAutoSave();
                });
            });

            tbody.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', function() {
                    const index = parseInt(this.dataset.index);
                    tableData[index].type = this.value;
                    scheduleAutoSave();
                });
            });
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        function scheduleAutoSave() {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(autoSave, 500);
        }

        async function autoSave() {
            try {
                const dataToSave = tableData.filter(row => row.id || row.name);
                const response = await fetch('/mapping/' + nodeId + '/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: dataToSave })
                });
                const result = await response.json();
                if (result.success) {
                    tableData = dataToSave;
                    updateInfo();
                    showStatus('Auto-saved', false);
                }
            } catch (err) {
                showStatus('Auto-save failed: ' + err.message, true);
            }
        }

        function addRow() {
            tableData.push({ id: '', name: '', type: 'None', deviation: 0, interval: 0 });
            renderTable();
            updateInfo();
            const inputs = document.querySelectorAll('#table-body input[type="text"]');
            if (inputs.length > 0) inputs[inputs.length - 2].focus();
        }

        function deleteRow(index) {
            tableData.splice(index, 1);
            renderTable();
            updateInfo();
            scheduleAutoSave();
        }

        async function clearData() {
            if (!confirm('Clear all mappings?')) return;
            tableData = [];
            renderTable();
            updateInfo();
            await autoSave();
        }

        function updateInfo() {
            document.getElementById('info').textContent = tableData.length + ' mapping(s)';
        }

        function showStatus(message, isError) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = 'status' + (isError ? ' error' : '');
            statusEl.style.display = 'block';
            setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
        }

        async function copyData() {
            try {
                // TSV format for Excel compatibility
                const header = 'Id\\tName\\tType\\tDeviation\\tInterval';
                const rows = tableData.map(row =>
                    [row.id || '', row.name || '', row.type || 'None', row.deviation || 0, row.interval || 0].join('\\t')
                );
                const tsv = [header, ...rows].join('\\n');
                await navigator.clipboard.writeText(tsv);
                showStatus('Copied ' + tableData.length + ' rows to clipboard (TSV)', false);
            } catch (err) {
                showStatus('Copy failed: ' + err.message, true);
            }
        }

        async function pasteData() {
            try {
                const text = await navigator.clipboard.readText();
                const lines = text.trim().split('\\n').filter(line => line.trim());
                if (lines.length === 0) {
                    showStatus('No data to paste', true);
                    return;
                }

                // Check if first line is a header (contains "Id" or "Name")
                let startIndex = 0;
                const firstLine = lines[0].toLowerCase();
                if (firstLine.includes('id') && firstLine.includes('name')) {
                    startIndex = 1; // Skip header row
                }

                const normalized = [];
                for (let i = startIndex; i < lines.length; i++) {
                    const cols = lines[i].split('\\t');
                    if (cols.length >= 2) {
                        normalized.push({
                            id: cols[0] || '',
                            name: cols[1] || '',
                            type: cols[2] || 'None',
                            deviation: parseFloat(cols[3]) || 0,
                            interval: parseInt(cols[4]) || 0
                        });
                    }
                }

                if (normalized.length === 0) {
                    showStatus('No valid rows found', true);
                    return;
                }

                tableData = normalized;
                renderTable();
                updateInfo();
                await autoSave();
                showStatus('Pasted ' + normalized.length + ' rows from TSV', false);
            } catch (err) {
                showStatus('Paste failed: ' + err.message, true);
            }
        }

        document.getElementById('add-btn').addEventListener('click', addRow);
        document.getElementById('copy-btn').addEventListener('click', copyData);
        document.getElementById('paste-btn').addEventListener('click', pasteData);
        document.getElementById('clear-btn').addEventListener('click', clearData);
        document.getElementById('close-btn').addEventListener('click', () => window.close());

        fetchData();
    </script>
</body>
</html>
        `);
    });
};
