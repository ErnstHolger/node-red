module.exports = function(RED) {
    const { Sender } = require('@questdb/nodejs-client');

    // Shared connection pool for config nodes
    const connectionPool = new Map();

    // Build connection string from config
    function buildConnectionString(configNode) {
        const protocol = configNode.protocol || 'http';
        let connStr = `${protocol}::addr=${configNode.host}:${configNode.port};`;

        // Authentication
        if (configNode.useAuth) {
            if (configNode.authType === 'token' && configNode.token) {
                connStr += `token=${configNode.token};`;
            } else if (configNode.username && configNode.password) {
                connStr += `username=${configNode.username};password=${configNode.password};`;
            }
        }

        // TLS options (for https/tcps)
        if (protocol === 'https' || protocol === 'tcps') {
            if (!configNode.tlsVerify) {
                connStr += `tls_verify=unsafe_off;`;
            }
            if (configNode.tlsCa) {
                connStr += `tls_ca=${configNode.tlsCa};`;
            }
        }

        // Auto-flush options
        if (configNode.autoFlush === false) {
            connStr += `auto_flush=off;`;
        } else {
            if (configNode.autoFlushRows) {
                connStr += `auto_flush_rows=${configNode.autoFlushRows};`;
            }
            if (configNode.autoFlushInterval) {
                connStr += `auto_flush_interval=${configNode.autoFlushInterval};`;
            }
        }

        // Buffer options
        if (configNode.initBufSize) {
            connStr += `init_buf_size=${configNode.initBufSize};`;
        }
        if (configNode.maxBufSize) {
            connStr += `max_buf_size=${configNode.maxBufSize};`;
        }

        // HTTP options
        if (protocol === 'http' || protocol === 'https') {
            if (configNode.requestTimeout) {
                connStr += `request_timeout=${configNode.requestTimeout};`;
            }
            if (configNode.retryTimeout) {
                connStr += `retry_timeout=${configNode.retryTimeout};`;
            }
        }

        return connStr;
    }

    // Configuration node for QuestDB connection
    function QuestDBConfigNode(config) {
        RED.nodes.createNode(this, config);
        const configNode = this;

        // Connection settings
        configNode.protocol = config.protocol || 'http';
        configNode.host = config.host;
        configNode.port = parseInt(config.port) || (configNode.protocol.startsWith('tcp') ? 9009 : 9000);
        configNode.name = config.name;

        // TLS settings
        configNode.tlsVerify = config.tlsVerify !== false;
        configNode.tlsCa = config.tlsCa || '';

        // Auth settings
        configNode.useAuth = config.useAuth || false;
        configNode.authType = config.authType || 'basic';
        configNode.username = this.credentials ? this.credentials.username : '';
        configNode.password = this.credentials ? this.credentials.password : '';
        configNode.token = this.credentials ? this.credentials.token : '';

        // Auto-flush settings
        configNode.autoFlush = config.autoFlush !== false;
        configNode.autoFlushRows = parseInt(config.autoFlushRows) || 75000;
        configNode.autoFlushInterval = parseInt(config.autoFlushInterval) || 1000;

        // Buffer settings
        configNode.initBufSize = parseInt(config.initBufSize) || 65536;
        configNode.maxBufSize = parseInt(config.maxBufSize) || 104857600;

        // HTTP settings
        configNode.requestTimeout = parseInt(config.requestTimeout) || 10000;
        configNode.retryTimeout = parseInt(config.retryTimeout) || 10000;

        const connectionKey = `${configNode.protocol}://${configNode.host}:${configNode.port}`;

        // Initialize shared connection if not exists
        if (!connectionPool.has(connectionKey)) {
            const connectionState = {
                sender: null,
                connected: false,
                connecting: false,
                users: 0,
                reconnectTimer: null
            };

            connectionState.connect = async function() {
                if (connectionState.connecting || connectionState.connected) {
                    return;
                }

                connectionState.connecting = true;

                try {
                    // Validate configuration
                    if (!configNode.host || isNaN(configNode.port)) {
                        throw new Error(`Invalid configuration: host=${configNode.host}, port=${configNode.port}`);
                    }

                    const connStr = buildConnectionString(configNode);
                    RED.log.info(`[QuestDB] Connecting with: ${connStr.replace(/password=[^;]+/, 'password=***').replace(/token=[^;]+/, 'token=***')}`);

                    // v4.x: Sender.fromConfig() is now async
                    connectionState.sender = await Sender.fromConfig(connStr);
                    connectionState.connected = true;
                    connectionState.connecting = false;

                    RED.log.info(`[QuestDB] Connected to ${configNode.protocol}://${configNode.host}:${configNode.port}`);
                } catch (err) {
                    connectionState.connected = false;
                    connectionState.connecting = false;
                    RED.log.error(`[QuestDB] Failed to connect to ${configNode.host}:${configNode.port}: ${err.message}`);

                    // Schedule reconnection
                    if (!connectionState.reconnectTimer) {
                        connectionState.reconnectTimer = setTimeout(() => {
                            connectionState.reconnectTimer = null;
                            if (connectionState.users > 0) {
                                connectionState.connect();
                            }
                        }, 5000); // Retry in 5 seconds
                    }
                }
            };
            
            connectionState.disconnect = async function() {
                if (connectionState.reconnectTimer) {
                    clearTimeout(connectionState.reconnectTimer);
                    connectionState.reconnectTimer = null;
                }
                
                if (connectionState.sender) {
                    try {
                        await connectionState.sender.flush();
                        await connectionState.sender.close();
                        RED.log.info(`[QuestDB] Disconnected from ${configNode.host}:${configNode.port}`);
                    } catch (err) {
                        RED.log.error(`[QuestDB] Error closing connection: ${err.message}`);
                    }
                    connectionState.sender = null;
                }
                connectionState.connected = false;
            };
            
            connectionPool.set(connectionKey, connectionState);
        }
        
        configNode.getConnection = function() {
            return connectionPool.get(connectionKey);
        };
        
        configNode.on('close', async function(done) {
            const conn = connectionPool.get(connectionKey);
            if (conn) {
                conn.users--;
                if (conn.users <= 0) {
                    await conn.disconnect();
                    connectionPool.delete(connectionKey);
                }
            }
            done();
        });
    }
    RED.nodes.registerType("questdb-config", QuestDBConfigNode, {
        credentials: {
            username: {type: "text"},
            password: {type: "password"},
            token: {type: "password"}
        }
    });

    // Main QuestDB node
    function QuestDBNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Get configuration from config node
        node.questdbConfig = RED.nodes.getNode(config.questdb);
        
        if (!node.questdbConfig) {
            node.error("QuestDB configuration not set");
            node.status({fill:"red", shape:"ring", text:"no config"});
            return;
        }
        
        // Configuration from the node properties
        node.autoFlush = config.autoFlush !== false; // default true
        node.flushInterval = config.flushInterval || 1000;
        
        // Get shared connection
        const connection = node.questdbConfig.getConnection();
        if (!connection) {
            node.error("Failed to get connection from config");
            node.status({fill:"red", shape:"ring", text:"no connection"});
            return;
        }
        
        connection.users++;
        
        // Connect if not already connected
        if (!connection.connected && !connection.connecting) {
            connection.connect();
        }
        
        // Update status based on connection state
        function updateStatus() {
            if (connection.connected) {
                node.status({fill:"green", shape:"dot", text:"connected"});
            } else if (connection.connecting) {
                node.status({fill:"yellow", shape:"ring", text:"connecting"});
            } else {
                node.status({fill:"red", shape:"ring", text:"disconnected"});
            }
        }
        
        updateStatus();
        
        // Periodic status check
        const statusInterval = setInterval(updateStatus, 2000);

        node.on('input', async function(msg) {
            // Auto-reconnect if disconnected
            if (!connection.connected && !connection.connecting) {
                connection.connect();
                node.error("Not connected to QuestDB, reconnecting...", msg);
                updateStatus();
                return;
            }

            if (!connection.connected || !connection.sender) {
                node.error("Not connected to QuestDB", msg);
                updateStatus();
                return;
            }

            // Check if TCP transport is actually connected
            if (connection.sender.transport && typeof connection.sender.transport.connected === 'boolean' && !connection.sender.transport.connected) {
                connection.connected = false;
                connection.connect();
                node.error("TCP transport disconnected, reconnecting...", msg);
                updateStatus();
                return;
            }

            // Validate message
            const tableName = msg.topic;
            if (!tableName) {
                node.error("Topic (table name) not specified", msg);
                node.status({fill:"red", shape:"ring", text:"no topic"});
                return;
            }

            const payload = msg.payload;
            if (payload === undefined || payload === null) {
                node.error("Payload is empty", msg);
                node.status({fill:"red", shape:"ring", text:"no payload"});
                return;
            }

            try {
                connection.sender.table(tableName);

                // Check if simple format (msg.topic + numeric payload)
                if (typeof payload === 'number' || (typeof payload === 'string' && !isNaN(parseFloat(payload)))) {
                    // Simple format: use msg.topic as tag, payload as value
                    var tag = msg.topic || 'default';
                    var value = typeof payload === 'number' ? payload : parseFloat(payload);
                    connection.sender.symbol('tag_name', tag);
                    connection.sender.floatColumn('value', value);

                    // Handle timestamp
                    if (msg.timestamp) {
                        var ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
                        connection.sender.at(BigInt(ts) * 1000n);
                    } else {
                        connection.sender.atNow();
                    }
                } else {
                    // QuestDB format: payload.symbols + payload.columns
                    if (payload.symbols && typeof payload.symbols === 'object') {
                        for (const [key, value] of Object.entries(payload.symbols)) {
                            if (value === null || value === undefined) continue;
                            connection.sender.symbol(String(key), String(value));
                        }
                    }

                    if (payload.columns && typeof payload.columns === 'object') {
                        for (const [key, value] of Object.entries(payload.columns)) {
                            if (value === null || value === undefined) continue;

                            // Check for explicit type specification: { value: x, type: 'int'|'long'|'float'|'double'|'decimal'|'array' }
                            if (typeof value === 'object' && !Array.isArray(value) && value.type && value.value !== undefined) {
                                const colType = value.type.toLowerCase();
                                const colValue = value.value;

                                if (colType === 'int' || colType === 'integer') {
                                    connection.sender.intColumn(key, Math.trunc(colValue));
                                } else if (colType === 'long') {
                                    // intColumn handles 64-bit signed integers in v4.x
                                    connection.sender.intColumn(key, Math.trunc(colValue));
                                } else if (colType === 'float' || colType === 'double') {
                                    // floatColumn handles 64-bit floating point in v4.x
                                    connection.sender.floatColumn(key, Number(colValue));
                                } else if (colType === 'decimal') {
                                    if (value.mantissa !== undefined && value.scale !== undefined) {
                                        connection.sender.decimalColumn(key, BigInt(value.mantissa), value.scale);
                                    } else {
                                        connection.sender.decimalColumnText(key, String(colValue));
                                    }
                                } else if (colType === 'array') {
                                    if (Array.isArray(colValue)) {
                                        // Convert to numbers for double[] array
                                        const numericArray = colValue.map(v => Number(v));
                                        connection.sender.arrayColumn(key, numericArray);
                                    } else {
                                        node.warn(`Array column '${key}' value must be an array`);
                                    }
                                } else if (colType === 'string') {
                                    connection.sender.stringColumn(key, String(colValue));
                                } else if (colType === 'boolean') {
                                    connection.sender.booleanColumn(key, Boolean(colValue));
                                } else if (colType === 'timestamp') {
                                    const microSeconds = BigInt(colValue) * 1000n;
                                    connection.sender.timestampColumn(key, microSeconds);
                                } else {
                                    node.warn(`Unknown column type '${colType}' for column '${key}'`);
                                }
                                continue;
                            }

                            // Array detection (auto) - QuestDB supports double[] arrays
                            if (Array.isArray(value)) {
                                // Convert to numeric array for double[] type
                                const numericArray = value.map(v => Number(v));
                                connection.sender.arrayColumn(key, numericArray);
                                continue;
                            }

                            if (typeof value === 'number') {
                                if (!isFinite(value)) {
                                    node.warn(`Skipping non-finite number for column '${key}'`);
                                    continue;
                                }
                                // Use floatColumn (available in all versions)
                                connection.sender.floatColumn(key, value);
                            } else if (typeof value === 'bigint') {
                                // intColumn handles 64-bit integers in v4.x
                                connection.sender.intColumn(key, Number(value));
                            } else if (typeof value === 'boolean') {
                                connection.sender.booleanColumn(key, value);
                            } else if (typeof value === 'string') {
                                // Check if it's an ISO date string
                                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                                    const dateValue = new Date(value);
                                    if (!isNaN(dateValue.getTime())) {
                                        // Convert to microseconds for QuestDB
                                        const microSeconds = BigInt(dateValue.getTime()) * 1000n;
                                        connection.sender.timestampColumn(key, microSeconds);
                                    } else {
                                        connection.sender.stringColumn(key, value);
                                    }
                                } else {
                                    connection.sender.stringColumn(key, value);
                                }
                            } else if (value instanceof Date) {
                                // Convert to microseconds for QuestDB
                                const microSeconds = BigInt(value.getTime()) * 1000n;
                                connection.sender.timestampColumn(key, microSeconds);
                            } else {
                                node.warn(`Skipping unsupported type '${typeof value}' for column '${key}'`);
                            }
                        }
                    } else if (!payload.symbols) {
                        node.error("Payload must have 'symbols' and/or 'columns' properties, or be a number", msg);
                        node.status({fill:"red", shape:"ring", text:"bad format"});
                        return;
                    }

                    if (payload.timestamp) {
                        let timestampMicros;
                        if (payload.timestamp instanceof Date) {
                            timestampMicros = BigInt(payload.timestamp.getTime()) * 1000n;
                        } else if (typeof payload.timestamp === 'number') {
                            timestampMicros = BigInt(payload.timestamp) * 1000n;
                        } else if (typeof payload.timestamp === 'bigint') {
                            timestampMicros = payload.timestamp;
                        } else if (typeof payload.timestamp === 'string') {
                            const parsed = Date.parse(payload.timestamp);
                            if (isNaN(parsed)) {
                                node.error(`Invalid timestamp string: ${payload.timestamp}`);
                                connection.sender.atNow(); // Complete the row to avoid buffer corruption
                                return;
                            }
                            timestampMicros = BigInt(parsed) * 1000n;
                        } else {
                            node.error(`Invalid timestamp type: ${typeof payload.timestamp}`);
                            connection.sender.atNow(); // Complete the row to avoid buffer corruption
                            return;
                        }
                        connection.sender.at(timestampMicros);
                    } else {
                        connection.sender.atNow();
                    }
                }

                if (node.autoFlush) {
                    await connection.sender.flush();
                }

                node.status({fill:"green", shape:"dot", text:`sent: ${tableName}`});
                msg.payload = { success: true, table: tableName };
                node.send(msg);

            } catch (err) {
                const errMsg = err.message || String(err);

                // Check if this is a TCP transport disconnect error
                if (errMsg.includes('not connected') || errMsg.includes('transport')) {
                    node.warn(`QuestDB connection lost: ${errMsg}`);
                    node.status({fill:"red", shape:"ring", text:"disconnected"});
                    connection.connected = false;
                    connection.sender = null;
                    connection.connect();
                } else {
                    node.warn(`QuestDB write failed: ${errMsg}`);
                    node.status({fill:"yellow", shape:"ring", text:"write failed"});

                    // Recreate sender to clear bad state
                    try {
                        const connStr = buildConnectionString(node.questdbConfig);
                        connection.sender = await Sender.fromConfig(connStr);
                    } catch (e) {
                        connection.connected = false;
                        connection.sender = null;
                        connection.connect();
                    }
                }

                msg.payload = { success: false, error: errMsg };
                node.send(msg);
            }
        });

        node.on('close', function(done) {
            clearInterval(statusInterval);
            connection.users--;
            done();
        });
    }

    RED.nodes.registerType("questdb", QuestDBNode);
}
