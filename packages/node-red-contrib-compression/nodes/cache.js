module.exports = function(RED) {
    function CacheNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.outputOnUpdate = config.outputOnUpdate !== false;
        node.contextName = config.contextName || 'cache';
        node.contextType = config.contextType || 'global';
        node.keyProperty = config.keyProperty || 'topic';
        node.ttl = (parseFloat(config.ttl) || 0) * 1000;
        node.maxSize = parseInt(config.maxSize) || 0;
        var contextStore = node.contextType === 'flow' ? node.context().flow : node.context().global;
        var cache = contextStore.get(node.contextName) || {};

        var cleanupInterval = null;
        if (node.ttl > 0) {
            cleanupInterval = setInterval(function() {
                var now = Date.now();
                var expired = 0;
                Object.keys(cache).forEach(function(key) {
                    var ts = cache[key]._cacheTimestamp || cache[key].timestamp || 0;
                    if (now - ts > node.ttl) { delete cache[key]; expired++; }
                });
                if (expired > 0) {
                    contextStore.set(node.contextName, cache);
                    node.status({ fill: "yellow", shape: "ring", text: "Expired: " + expired });
                }
            }, Math.min(node.ttl, 60000));
        }

        node.on('input', function(msg) {
            if (msg.topic === '_cache' || msg.payload === '_cache') {
                node.status({ fill: "blue", shape: "dot", text: Object.keys(cache).length + " tags" });
                node.send([null, { payload: cache, topic: 'cache' }]);
                return;
            }
            if (msg.topic === '_get' && msg.key) {
                var entry = cache[msg.key];
                var ts = entry ? (entry._cacheTimestamp || entry.timestamp || 0) : 0;
                if (entry && (node.ttl === 0 || Date.now() - ts <= node.ttl)) {
                    node.send([null, { payload: entry, topic: msg.key, stored: true }]);
                } else {
                    node.send([null, { payload: null, topic: msg.key, stored: false }]);
                }
                return;
            }
            if (msg.topic === '_clear' || msg.payload === '_clear') {
                cache = {};
                contextStore.set(node.contextName, cache);
                node.status({ fill: "grey", shape: "ring", text: "Cleared" });
                node.send([null, { payload: {}, topic: 'cleared' }]);
                return;
            }
            var topic = RED.util.getMessageProperty(msg, node.keyProperty) || 'default';
            if (node.maxSize > 0 && Object.keys(cache).length >= node.maxSize && !cache[topic]) {
                var oldest = null, oldestTime = Infinity;
                Object.keys(cache).forEach(function(key) {
                    var ts = cache[key]._cacheTimestamp || cache[key].timestamp || 0;
                    if (ts < oldestTime) { oldestTime = ts; oldest = key; }
                });
                if (oldest) delete cache[oldest];
            }
            var storedMsg = RED.util.cloneMessage(msg);
            storedMsg._cacheTimestamp = Date.now();
            cache[topic] = storedMsg;
            contextStore.set(node.contextName, cache);
            node.status({ fill: "green", shape: "dot", text: topic + ": " + (typeof msg.payload === 'number' ? msg.payload.toFixed(2) : msg.payload) });
            if (node.outputOnUpdate) node.send([msg, null]);
        });
        node.on('close', function() {
            if (cleanupInterval) clearInterval(cleanupInterval);
            node.status({});
        });
    }
    RED.nodes.registerType("cache", CacheNode);

    RED.httpAdmin.post("/cache/:id/clear", function(req, res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node) {
            var contextStore = node.contextType === 'flow' ? node.context().flow : node.context().global;
            contextStore.set(node.contextName, {});
            node.status({ fill: "grey", shape: "ring", text: "Cleared" });
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    });
};
