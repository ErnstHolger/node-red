/**
 * event-cache - Config node providing central cache and event bus
 *
 * Features:
 * - Map<topic, {value, ts, metadata}> for caching latest values
 * - Stored in global context for visibility in sidebar
 * - EventEmitter for notifying subscribers on updates
 * - Exact topic matching for subscriptions
 * - LRU eviction when maxEntries exceeded
 * - Reference counting for cleanup
 */
module.exports = function(RED) {
    const EventEmitter = require('events');

    // Shared instances for event emitters and subscriptions (not stored in context)
    const sharedInstances = new Map();

    function EventCacheNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name || 'Event Cache';
        node.maxEntries = parseInt(config.maxEntries) || 10000;
        node.ttl = parseInt(config.ttl) || 0; // 0 = no expiry

        // Context key for storing cache data (visible in sidebar)
        const contextKey = `eventCache_${node.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const globalContext = node.context().global;

        // Create or get shared instance for emitters/subscriptions (not serializable)
        const instanceKey = node.id;
        if (!sharedInstances.has(instanceKey)) {
            sharedInstances.set(instanceKey, {
                emitter: new EventEmitter(),
                // Subscription storage: Map<topic, Map<subId, callback>> for O(1) exact match
                subscriptions: new Map(),
                users: 0,
                subscriptionCounter: 0
            });
        }

        const instance = sharedInstances.get(instanceKey);
        instance.users++;
        instance.emitter.setMaxListeners(100); // Allow many subscribers

        // Initialize cache in global context if not exists
        if (!globalContext.get(contextKey)) {
            globalContext.set(contextKey, {});
        }

        // TTL cleanup interval
        let ttlInterval = null;
        if (node.ttl > 0) {
            ttlInterval = setInterval(() => {
                const now = Date.now();
                const cache = globalContext.get(contextKey) || {};
                let changed = false;
                for (const topic of Object.keys(cache)) {
                    if (now - cache[topic].ts > node.ttl) {
                        delete cache[topic];
                        changed = true;
                    }
                }
                if (changed) {
                    globalContext.set(contextKey, cache);
                }
            }, Math.min(node.ttl, 60000)); // Check at most every minute
        }

        /**
         * Set a value in the cache and emit update event
         * @param {string} topic - The topic key
         * @param {any} value - The value to store
         * @param {object} metadata - Optional metadata
         */
        node.setValue = function(topic, value, metadata = {}) {
            const entry = {
                value: value,
                ts: Date.now(),
                metadata: metadata
            };

            const cache = globalContext.get(contextKey) || {};
            cache[topic] = entry;

            // Enforce max entries (LRU eviction - remove oldest)
            const keys = Object.keys(cache);
            if (keys.length > node.maxEntries) {
                // Find oldest entry
                let oldestKey = keys[0];
                let oldestTs = cache[oldestKey].ts;
                for (const key of keys) {
                    if (cache[key].ts < oldestTs) {
                        oldestTs = cache[key].ts;
                        oldestKey = key;
                    }
                }
                delete cache[oldestKey];
            }

            globalContext.set(contextKey, cache);

            // Emit topic-specific update event
            instance.emitter.emit('update', topic, entry);
        };

        /**
         * Get a value from the cache
         * @param {string} topic - The topic key
         * @returns {object|undefined} - The cached entry {value, ts, metadata} or undefined
         */
        node.getValue = function(topic) {
            const cache = globalContext.get(contextKey) || {};
            return cache[topic];
        };

        /**
         * Subscribe to updates for a specific topic
         * @param {string} topic - The exact topic to subscribe to
         * @param {Function} callback - Called with (topic, entry) on update
         * @returns {string} - Subscription ID for unsubscribe
         */
        node.subscribe = function(topic, callback) {
            const subId = `sub_${++instance.subscriptionCounter}`;

            if (!instance.subscriptions.has(topic)) {
                instance.subscriptions.set(topic, new Map());
            }
            instance.subscriptions.get(topic).set(subId, callback);

            return subId;
        };

        /**
         * Unsubscribe from updates
         * @param {string} subscriptionId - The subscription ID to remove
         */
        node.unsubscribe = function(subscriptionId) {
            for (const [topic, subs] of instance.subscriptions) {
                if (subs.delete(subscriptionId)) {
                    // Clean up empty topic maps
                    if (subs.size === 0) {
                        instance.subscriptions.delete(topic);
                    }
                    return;
                }
            }
        };

        /**
         * Get all topics in cache
         * @returns {string[]} - Array of all topic keys
         */
        node.getTopics = function() {
            const cache = globalContext.get(contextKey) || {};
            return Object.keys(cache);
        };

        /**
         * Get the number of entries in the cache
         * @returns {number} - Cache size
         */
        node.size = function() {
            const cache = globalContext.get(contextKey) || {};
            return Object.keys(cache).length;
        };

        /**
         * Clear all entries from cache
         */
        node.clear = function() {
            globalContext.set(contextKey, {});
        };

        // Internal: dispatch updates to matching subscriptions (O(1) lookup)
        const updateHandler = (topic, entry) => {
            const subs = instance.subscriptions.get(topic);
            if (subs) {
                for (const [subId, callback] of subs) {
                    try {
                        callback(topic, entry);
                    } catch (err) {
                        RED.log.error(`[event-cache] Subscription callback error: ${err.message}`);
                    }
                }
            }
        };
        instance.emitter.on('update', updateHandler);

        // Cleanup on close
        node.on('close', function(done) {
            if (ttlInterval) {
                clearInterval(ttlInterval);
            }

            instance.users--;
            if (instance.users <= 0) {
                // Don't clear the context cache - let it persist
                instance.subscriptions.clear();
                instance.emitter.removeAllListeners();
                sharedInstances.delete(instanceKey);
            }
            done();
        });
    }

    RED.nodes.registerType("event-cache", EventCacheNode);

    // HTTP Admin endpoint to clear cache
    RED.httpAdmin.post("/event-cache/:id/clear", function(req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (node && node.clear) {
            node.clear();
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    });

    // HTTP Admin endpoint to get cache stats
    RED.httpAdmin.get("/event-cache/:id/stats", function(req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (node) {
            const instance = sharedInstances.get(node.id);
            let subCount = 0;
            if (instance) {
                for (const subs of instance.subscriptions.values()) {
                    subCount += subs.size;
                }
            }
            res.json({
                size: node.size(),
                topics: node.getTopics(),
                maxEntries: node.maxEntries,
                ttl: node.ttl,
                subscriptions: {
                    count: subCount,
                    topics: instance ? instance.subscriptions.size : 0
                }
            });
        } else {
            res.sendStatus(404);
        }
    });

    // HTTP Admin endpoint to get topics only (for autocomplete)
    RED.httpAdmin.get("/event-cache/:id/topics", function(req, res) {
        const node = RED.nodes.getNode(req.params.id);
        if (node) {
            res.json(node.getTopics());
        } else {
            res.json([]);
        }
    });

    // HTTP Admin endpoint to get topics from all caches
    RED.httpAdmin.get("/event-cache/topics/all", function(req, res) {
        const allTopics = new Set();
        // Get all event-cache nodes and collect their topics
        RED.nodes.eachNode(function(n) {
            if (n.type === 'event-cache') {
                const cacheNode = RED.nodes.getNode(n.id);
                if (cacheNode && cacheNode.getTopics) {
                    for (const topic of cacheNode.getTopics()) {
                        allTopics.add(topic);
                    }
                }
            }
        });
        res.json(Array.from(allTopics).sort());
    });
};
