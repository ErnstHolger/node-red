module.exports = function(RED) {
    function QuestDBMapperNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Configuration from node properties
        node.tableName = config.tableName;
        node.timestampField = config.timestampField;
        node.symbolMappings = config.symbolMappings || [];
        node.columnMappings = config.columnMappings || [];

        node.on('input', function(msg, send, done) {
            try {
                const output = {
                    topic: node.tableName || msg.topic,
                    payload: {
                        symbols: {},
                        columns: {}
                    }
                };

                // Map timestamp
                if (node.timestampField) {
                    const tsValue = getNestedValue(msg, node.timestampField);
                    if (tsValue !== undefined) {
                        output.payload.timestamp = tsValue;
                    }
                }

                // Map symbols
                for (const mapping of node.symbolMappings) {
                    if (mapping.source && mapping.target) {
                        const value = getNestedValue(msg, mapping.source);
                        if (value !== undefined && value !== null) {
                            output.payload.symbols[mapping.target] = String(value);
                        }
                    }
                }

                // Map columns
                for (const mapping of node.columnMappings) {
                    if (mapping.source && mapping.target) {
                        let value = getNestedValue(msg, mapping.source);
                        if (value !== undefined && value !== null) {
                            // Type conversion based on mapping type
                            switch (mapping.type) {
                                case 'float':
                                    value = parseFloat(value);
                                    if (isNaN(value)) continue;
                                    break;
                                case 'double':
                                    value = { value: parseFloat(value), type: 'double' };
                                    if (isNaN(value.value)) continue;
                                    break;
                                case 'integer':
                                    value = { value: parseInt(value, 10), type: 'int' };
                                    if (isNaN(value.value)) continue;
                                    break;
                                case 'long':
                                    value = { value: parseInt(value, 10), type: 'long' };
                                    if (isNaN(value.value)) continue;
                                    break;
                                case 'decimal':
                                    value = { value: String(value), type: 'decimal' };
                                    break;
                                case 'array':
                                case 'array_double':
                                    // QuestDB v4.x supports double[] arrays
                                    value = { value: Array.isArray(value) ? value.map(Number) : [Number(value)], type: 'array' };
                                    break;
                                case 'boolean':
                                    value = Boolean(value);
                                    break;
                                case 'string':
                                    value = String(value);
                                    break;
                                case 'timestamp':
                                    if (typeof value === 'string') {
                                        value = new Date(value);
                                    } else if (typeof value === 'number') {
                                        value = new Date(value);
                                    }
                                    break;
                                // 'auto' - keep original type
                            }
                            output.payload.columns[mapping.target] = value;
                        }
                    }
                }

                node.status({fill:"green", shape:"dot", text:`mapped: ${output.topic}`});
                send(output);
                done();

            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"error"});
                done(err);
            }
        });

        // Helper function to get nested property value
        function getNestedValue(obj, path) {
            // Strip 'msg.' prefix if present since we're already working with msg object
            if (path.startsWith('msg.')) {
                path = path.substring(4);
            }
            const parts = path.split('.');
            let current = obj;
            for (const part of parts) {
                if (current === undefined || current === null) {
                    return undefined;
                }
                // Handle array notation like payload[0]
                const match = part.match(/^(\w+)\[(\d+)\]$/);
                if (match) {
                    current = current[match[1]];
                    if (Array.isArray(current)) {
                        current = current[parseInt(match[2], 10)];
                    }
                } else {
                    current = current[part];
                }
            }
            return current;
        }
    }

    RED.nodes.registerType("questdb-mapper", QuestDBMapperNode);
};
