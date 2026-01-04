module.exports = function(RED) {
    function TypeRouterNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function(msg) {
            var value = msg.payload;

            if (typeof value === 'boolean') {
                msg.dataType = 'bool';
                node.status({ fill: "purple", shape: "dot", text: "bool: " + value });
                return node.send([null, null, msg, null]);
            }
            else if (typeof value === 'number') {
                if (Number.isInteger(value)) {
                    msg.dataType = 'int';
                    node.status({ fill: "blue", shape: "dot", text: "int: " + value });
                    return node.send([msg, null, null, null]);
                } else {
                    msg.dataType = 'float';
                    node.status({ fill: "green", shape: "dot", text: "float: " + value.toFixed(2) });
                    return node.send([null, msg, null, null]);
                }
            }
            else if (typeof value === 'string') {
                var trimmed = value.trim();

                if (trimmed.toLowerCase() === 'true') {
                    msg.payload = true;
                    msg.dataType = 'bool';
                    node.status({ fill: "purple", shape: "dot", text: "bool: true" });
                    return node.send([null, null, msg, null]);
                }
                else if (trimmed.toLowerCase() === 'false') {
                    msg.payload = false;
                    msg.dataType = 'bool';
                    node.status({ fill: "purple", shape: "dot", text: "bool: false" });
                    return node.send([null, null, msg, null]);
                }
                else if (trimmed !== '' && !isNaN(trimmed)) {
                    var num = Number(trimmed);
                    msg.payload = num;
                    if (Number.isInteger(num) && !trimmed.includes('.')) {
                        msg.dataType = 'int';
                        node.status({ fill: "blue", shape: "dot", text: "int: " + num });
                        return node.send([msg, null, null, null]);
                    } else {
                        msg.dataType = 'float';
                        node.status({ fill: "green", shape: "dot", text: "float: " + num.toFixed(2) });
                        return node.send([null, msg, null, null]);
                    }
                }
                else {
                    msg.payload = String(value);
                    msg.dataType = 'string';
                    node.status({ fill: "yellow", shape: "dot", text: "str: " + (value.length > 10 ? value.substring(0,10) + "..." : value) });
                    return node.send([null, null, null, msg]);
                }
            }
            else {
                msg.payload = String(value);
                msg.dataType = 'string';
                node.status({ fill: "yellow", shape: "dot", text: "str: (converted)" });
                return node.send([null, null, null, msg]);
            }
        });

        node.on('close', function() { node.status({}); });
    }
    RED.nodes.registerType("qdb-type-router", TypeRouterNode);
};
