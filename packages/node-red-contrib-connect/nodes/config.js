module.exports = function(RED) {
    const axios = require('axios');

    // Token cache per config node
    const tokenCache = new Map();

    function ConnectConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Connection settings
        node.name = config.name;
        node.resource = config.resource || 'https://datahub.connect.aveva.com';
        node.tenantId = config.tenantId;
        node.namespaceId = config.namespaceId;
        node.apiVersion = config.apiVersion || 'v1';

        // Auth settings from credentials
        node.clientId = this.credentials ? this.credentials.clientId : '';
        node.clientSecret = this.credentials ? this.credentials.clientSecret : '';

        // Token endpoint
        node.tokenUrl = config.tokenUrl || 'https://datahub.connect.aveva.com/identity/connect/token';

        const cacheKey = `${node.tenantId}:${node.clientId}`;

        // Get or refresh access token
        node.getAccessToken = async function() {
            const cached = tokenCache.get(cacheKey);

            // Return cached token if still valid (with 60s buffer)
            if (cached && cached.expiresAt > Date.now() + 60000) {
                return cached.accessToken;
            }

            // Request new token
            try {
                const params = new URLSearchParams();
                params.append('grant_type', 'client_credentials');
                params.append('client_id', node.clientId);
                params.append('client_secret', node.clientSecret);

                const response = await axios.post(node.tokenUrl, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                const token = {
                    accessToken: response.data.access_token,
                    expiresAt: Date.now() + (response.data.expires_in * 1000)
                };

                tokenCache.set(cacheKey, token);
                RED.log.info(`[AVEVA Connect] Token acquired for tenant ${node.tenantId}`);

                return token.accessToken;
            } catch (err) {
                const errMsg = err.response ? err.response.data : err.message;
                RED.log.error(`[AVEVA Connect] Token request failed: ${JSON.stringify(errMsg)}`);
                throw new Error(`Authentication failed: ${JSON.stringify(errMsg)}`);
            }
        };

        // Build base URL for API calls
        node.getBaseUrl = function() {
            return `${node.resource}/api/${node.apiVersion}/tenants/${node.tenantId}/namespaces/${node.namespaceId}`;
        };

        // Build OMF URL
        node.getOmfUrl = function() {
            return `${node.resource}/api/${node.apiVersion}/tenants/${node.tenantId}/namespaces/${node.namespaceId}/omf`;
        };

        // Make authenticated API request
        node.request = async function(options) {
            const token = await node.getAccessToken();

            const config = {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                }
            };

            return axios(config);
        };

        // Clean up on close
        node.on('close', function(done) {
            tokenCache.delete(cacheKey);
            done();
        });
    }

    RED.nodes.registerType("connect-config", ConnectConfigNode, {
        credentials: {
            clientId: { type: "text" },
            clientSecret: { type: "password" }
        }
    });
};
