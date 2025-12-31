module.exports = function(RED) {
    const axios = require('axios');

    function OmfWriteNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name;
        node.connectConfig = RED.nodes.getNode(config.connect);
        node.messageType = config.messageType || 'data';
        node.action = config.action || 'create';
        node.compression = config.compression || 'none';

        if (!node.connectConfig) {
            node.status({ fill: "red", shape: "ring", text: "not configured" });
            return;
        }

        node.status({ fill: "yellow", shape: "ring", text: "ready" });

        node.on('input', async function(msg, send, done) {
            try {
                const token = await node.connectConfig.getAccessToken();
                const omfUrl = node.connectConfig.getOmfUrl();

                // Determine message type from config or msg
                const messageType = msg.omfMessageType || node.messageType;
                const action = msg.omfAction || node.action;

                // Build OMF payload
                let omfPayload;
                if (msg.payload.omf) {
                    // Already formatted OMF message
                    omfPayload = msg.payload.omf;
                } else if (Array.isArray(msg.payload)) {
                    omfPayload = msg.payload;
                } else {
                    omfPayload = [msg.payload];
                }

                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'messagetype': messageType,
                    'action': action,
                    'omfversion': '1.2'
                };

                if (node.compression === 'gzip') {
                    headers['Content-Encoding'] = 'gzip';
                }

                node.status({ fill: "blue", shape: "dot", text: "sending..." });

                const response = await axios.post(omfUrl, omfPayload, { headers });

                node.status({ fill: "green", shape: "dot", text: "sent" });

                // Reset status after 2 seconds
                setTimeout(() => {
                    node.status({ fill: "yellow", shape: "ring", text: "ready" });
                }, 2000);

                msg.payload = {
                    success: true,
                    statusCode: response.status,
                    messageType: messageType,
                    action: action
                };

                send(msg);
                done();
            } catch (err) {
                const errMsg = err.response ?
                    `${err.response.status}: ${JSON.stringify(err.response.data)}` :
                    err.message;

                node.status({ fill: "red", shape: "ring", text: "error" });
                node.error(`OMF write failed: ${errMsg}`, msg);

                msg.payload = { success: false, error: errMsg };
                send(msg);
                done();
            }
        });
    }

    RED.nodes.registerType("connect-omf-write", OmfWriteNode);
};
