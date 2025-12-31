module.exports = function(RED) {

    function EventsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name;
        node.connectConfig = RED.nodes.getNode(config.connect);
        node.streamIds = config.streamIds || '';
        node.pollInterval = parseInt(config.pollInterval) || 5000;
        node.startOnDeploy = config.startOnDeploy !== false;

        // State
        let pollTimer = null;
        let lastTimestamps = new Map();
        let isPolling = false;

        if (!node.connectConfig) {
            node.status({ fill: "red", shape: "ring", text: "not configured" });
            return;
        }

        // Parse stream IDs (comma-separated or from msg)
        function parseStreamIds(input) {
            if (!input) return [];
            if (Array.isArray(input)) return input;
            return input.split(',').map(s => s.trim()).filter(s => s);
        }

        // Poll for new data
        async function pollStreams() {
            if (isPolling) return;
            isPolling = true;

            const streamIds = parseStreamIds(node.streamIds);
            if (streamIds.length === 0) {
                node.status({ fill: "yellow", shape: "ring", text: "no streams" });
                isPolling = false;
                return;
            }

            try {
                const baseUrl = node.connectConfig.getBaseUrl();

                for (const streamId of streamIds) {
                    try {
                        const url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/last`;

                        const response = await node.connectConfig.request({
                            method: 'GET',
                            url: url
                        });

                        const data = response.data;
                        const lastTs = lastTimestamps.get(streamId);

                        // Check if this is new data
                        let timestamp = null;
                        if (data && data.Timestamp) {
                            timestamp = data.Timestamp;
                        } else if (data && data.timestamp) {
                            timestamp = data.timestamp;
                        } else if (Array.isArray(data) && data.length > 0) {
                            timestamp = data[0].Timestamp || data[0].timestamp;
                        }

                        if (timestamp && timestamp !== lastTs) {
                            lastTimestamps.set(streamId, timestamp);

                            // Only send if we have a previous timestamp (avoid initial flood)
                            if (lastTs !== undefined) {
                                const msg = {
                                    topic: streamId,
                                    payload: data,
                                    streamId: streamId,
                                    timestamp: timestamp,
                                    eventType: 'data'
                                };
                                node.send(msg);
                            }
                        }
                    } catch (streamErr) {
                        // Log individual stream errors but continue polling
                        node.warn(`Error polling stream ${streamId}: ${streamErr.message}`);
                    }
                }

                node.status({ fill: "green", shape: "dot", text: `polling ${streamIds.length} streams` });
            } catch (err) {
                const errMsg = err.response ?
                    `${err.response.status}: ${JSON.stringify(err.response.data)}` :
                    err.message;
                node.status({ fill: "red", shape: "ring", text: "poll error" });
                node.error(`Polling failed: ${errMsg}`);
            }

            isPolling = false;
        }

        // Start polling
        function startPolling() {
            if (pollTimer) return;

            const streamIds = parseStreamIds(node.streamIds);
            if (streamIds.length === 0) {
                node.status({ fill: "yellow", shape: "ring", text: "no streams" });
                return;
            }

            // Initialize last timestamps
            lastTimestamps.clear();
            streamIds.forEach(id => lastTimestamps.set(id, undefined));

            // Start polling
            pollTimer = setInterval(pollStreams, node.pollInterval);
            pollStreams(); // Initial poll

            node.status({ fill: "green", shape: "dot", text: `polling ${streamIds.length} streams` });
            RED.log.info(`[AVEVA Connect Events] Started polling ${streamIds.length} streams every ${node.pollInterval}ms`);
        }

        // Stop polling
        function stopPolling() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            lastTimestamps.clear();
            node.status({ fill: "yellow", shape: "ring", text: "stopped" });
            RED.log.info(`[AVEVA Connect Events] Stopped polling`);
        }

        // Handle input messages for control
        node.on('input', function(msg, send, done) {
            if (msg.payload === 'start' || msg.topic === 'start') {
                // Update stream IDs if provided
                if (msg.streamIds) {
                    node.streamIds = Array.isArray(msg.streamIds) ? msg.streamIds.join(',') : msg.streamIds;
                }
                startPolling();
            } else if (msg.payload === 'stop' || msg.topic === 'stop') {
                stopPolling();
            } else if (msg.payload === 'status' || msg.topic === 'status') {
                const statusMsg = {
                    payload: {
                        isPolling: pollTimer !== null,
                        pollInterval: node.pollInterval,
                        streamIds: parseStreamIds(node.streamIds),
                        lastTimestamps: Object.fromEntries(lastTimestamps)
                    }
                };
                send(statusMsg);
            }
            done();
        });

        // Auto-start if configured
        if (node.startOnDeploy) {
            // Delay start to allow config node to initialize
            setTimeout(startPolling, 1000);
        } else {
            node.status({ fill: "yellow", shape: "ring", text: "stopped" });
        }

        // Clean up on close
        node.on('close', function(done) {
            stopPolling();
            done();
        });
    }

    RED.nodes.registerType("connect-events", EventsNode);
};
