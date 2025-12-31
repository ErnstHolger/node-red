module.exports = function(RED) {
    function ConnectNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function(msg, send, done) {
            // TODO: Implement connect logic
            send(msg);
            done();
        });
    }

    RED.nodes.registerType("connect", ConnectNode);
};
