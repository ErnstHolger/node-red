module.exports = function(RED) {
    function CompressionNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function(msg, send, done) {
            // TODO: Implement compression logic
            send(msg);
            done();
        });
    }

    RED.nodes.registerType("compression", CompressionNode);
};
