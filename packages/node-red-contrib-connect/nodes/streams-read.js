module.exports = function(RED) {

    function StreamsReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name;
        node.connectConfig = RED.nodes.getNode(config.connect);
        node.streamId = config.streamId;
        node.readMode = config.readMode || 'last';
        node.startIndex = config.startIndex || '';
        node.endIndex = config.endIndex || '';
        node.count = parseInt(config.count) || 100;

        if (!node.connectConfig) {
            node.status({ fill: "red", shape: "ring", text: "not configured" });
            return;
        }

        node.status({ fill: "yellow", shape: "ring", text: "ready" });

        node.on('input', async function(msg, send, done) {
            try {
                const baseUrl = node.connectConfig.getBaseUrl();
                const streamId = msg.streamId || node.streamId;

                if (!streamId) {
                    throw new Error("Stream ID is required");
                }

                let url;
                const readMode = msg.readMode || node.readMode;

                switch (readMode) {
                    case 'last':
                        // Get last value
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/last`;
                        break;

                    case 'first':
                        // Get first value
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/first`;
                        break;

                    case 'range':
                        // Get range of values
                        const startIndex = msg.startIndex || node.startIndex;
                        const endIndex = msg.endIndex || node.endIndex;
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data`;
                        if (startIndex || endIndex) {
                            const params = new URLSearchParams();
                            if (startIndex) params.append('startIndex', startIndex);
                            if (endIndex) params.append('endIndex', endIndex);
                            url += `?${params.toString()}`;
                        }
                        break;

                    case 'window':
                        // Get window of values (by count)
                        const count = msg.count || node.count;
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/last?count=${count}`;
                        break;

                    case 'interpolated':
                        // Get interpolated values
                        const interpStart = msg.startIndex || node.startIndex;
                        const interpEnd = msg.endIndex || node.endIndex;
                        const interpCount = msg.count || node.count;
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/interpolated`;
                        const interpParams = new URLSearchParams();
                        if (interpStart) interpParams.append('startIndex', interpStart);
                        if (interpEnd) interpParams.append('endIndex', interpEnd);
                        interpParams.append('count', interpCount);
                        url += `?${interpParams.toString()}`;
                        break;

                    default:
                        url = `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/last`;
                }

                node.status({ fill: "blue", shape: "dot", text: "reading..." });

                const response = await node.connectConfig.request({
                    method: 'GET',
                    url: url
                });

                node.status({ fill: "green", shape: "dot", text: "success" });

                // Reset status after 2 seconds
                setTimeout(() => {
                    node.status({ fill: "yellow", shape: "ring", text: "ready" });
                }, 2000);

                msg.payload = response.data;
                msg.streamId = streamId;
                msg.readMode = readMode;

                send(msg);
                done();
            } catch (err) {
                const errMsg = err.response ?
                    `${err.response.status}: ${JSON.stringify(err.response.data)}` :
                    err.message;

                node.status({ fill: "red", shape: "ring", text: "error" });
                node.error(`Stream read failed: ${errMsg}`, msg);

                msg.payload = { success: false, error: errMsg };
                send(msg);
                done();
            }
        });
    }

    RED.nodes.registerType("connect-streams-read", StreamsReadNode);
};
