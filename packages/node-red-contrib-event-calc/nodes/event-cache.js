/**
 * event-cache - Config node providing central cache and event bus
 *
 * Features:
 * - Map<topic, {value, ts, metadata}> for caching latest values
 * - EventEmitter for notifying subscribers on updates
 * - Wildcard matching (* for one or more chars, ? for exactly one char)
 * - LRU eviction when maxEntries exceeded
 * - Reference counting for cleanup
 */
module.exports = function(RED) {
    const EventEmitter = require('events');

    // Shared cache instances per config node ID
    const cacheInstances = new Map();

    /**
     * Check if a pattern contains wildcards
     * @param {string} pattern - Topic pattern
     * @returns {boolean} - True if pattern contains * or ?
     */
    function hasWildcard(pattern) {
        return pattern && (pattern.includes('*') || pattern.includes('?'));
    }

    /**
     * Convert topic pattern to RegExp
     *
     * Wildcards:
     * - '*' (asterisk): Matches one or more characters
     *   Example: 'sensors/*' matches 'sensors/temp', 'sensors/room1/temp'
     *
     * - '?' (question mark): Matches exactly one character
     *   Example: 'sensor?' matches 'sensor1', 'sensorA' but NOT 'sensor' or 'sensor12'
     *
     * @param {string} pattern - Topic pattern with wildcards
     * @returns {RegExp} - Regular expression for matching
     */
    function patternToRegex(pattern) {
        // Handle empty pattern or just *
        if (!pattern || pattern === '*') {
            return /^.+$/;
        }

        // Escape regex special characters except our wildcards (* and ?)
        let regexStr = pattern
            .replace(/[.^$|()[\]{}\\+#/]/g, '\\$&')  // Escape regex special chars (including /)
            .replace(/\?/g, '.')                      // ? matches exactly one character
            .replace(/\*/g, '.+');                    // * matches one or more characters

        return new RegExp(`^${regexStr}$`);
    }

    function EventCacheNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name || 'Event Cache';
        node.maxEntries = parseInt(config.maxEntries) || 10000;
        node.ttl = parseInt(config.ttl) || 0; // 0 = no expiry

        // Create or get shared cache instance
        const cacheKey = node.id;
        if (!cacheInstances.has(cacheKey)) {
            cacheInstances.set(cacheKey, {
                cache: new Map(),
                emitter: new EventEmitter(),
                // Optimized subscription storage:
                // - exactSubscriptions: Map<topic, Map<subId, callback>> for O(1) exact match
                // - wildcardSubscriptions: Map<subId, {pattern, regex, callback}> for pattern matching
                exactSubscriptions: new Map(),
                wildcardSubscriptions: new Map(),
                users: 0,
                subscriptionCounter: 0
            });
        }

        const instance = cacheInstances.get(cacheKey);
        instance.users++;
        instance.emitter.setMaxListeners(100); // Allow many subscribers

        // TTL cleanup interval
        let ttlInterval = null;
        if (node.ttl > 0) {
            ttlInterval = setInterval(() => {
                const now = Date.now();
                for (const [topic, entry] of instance.cache) {
                    if (now - entry.ts > node.ttl) {
                        instance.cache.delete(topic);
                    }
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

            instance.cache.set(topic, entry);

            // Enforce max entries (LRU eviction - remove oldest)
            if (instance.cache.size > node.maxEntries) {
                const firstKey = instance.cache.keys().next().value;
                instance.cache.delete(firstKey);
            }

            // Emit topic-specific update event
            instance.emitter.emit('update', topic, entry);
        };

        /**
         * Get a value from the cache
         * @param {string} topic - The topic key
         * @returns {object|undefined} - The cached entry {value, ts, metadata} or undefined
         */
        node.getValue = function(topic) {
            return instance.cache.get(topic);
        };

        /**
         * Get all values matching a pattern
         * @param {string} pattern - Pattern with * and ? wildcards
         * @returns {Map} - Map of matching topic -> entry
         */
        node.getMatching = function(pattern) {
            const regex = patternToRegex(pattern);
            const results = new Map();

            for (const [topic, entry] of instance.cache) {
                if (regex.test(topic)) {
                    results.set(topic, entry);
                }
            }

            return results;
        };

        /**
         * Subscribe to updates matching a pattern
         * Optimized: exact matches use O(1) lookup, wildcards use pattern matching
         * @param {string} pattern - Topic pattern with wildcards
         * @param {Function} callback - Called with (topic, entry) on match
         * @returns {string} - Subscription ID for unsubscribe
         */
        node.subscribe = function(pattern, callback) {
            const subId = `sub_${++instance.subscriptionCounter}`;

            if (hasWildcard(pattern)) {
                // Wildcard pattern - store with regex for matching
                const regex = patternToRegex(pattern);
                instance.wildcardSubscriptions.set(subId, {
                    pattern: pattern,
                    regex: regex,
                    callback: callback
                });
            } else {
                // Exact match - store in topic-indexed map for O(1) lookup
                if (!instance.exactSubscriptions.has(pattern)) {
                    instance.exactSubscriptions.set(pattern, new Map());
                }
                instance.exactSubscriptions.get(pattern).set(subId, callback);
            }

            return subId;
        };

        /**
         * Unsubscribe from updates
         * @param {string} subscriptionId - The subscription ID to remove
         */
        node.unsubscribe = function(subscriptionId) {
            // Try wildcard subscriptions first
            if (instance.wildcardSubscriptions.delete(subscriptionId)) {
                return;
            }

            // Search exact subscriptions
            for (const [topic, subs] of instance.exactSubscriptions) {
                if (subs.delete(subscriptionId)) {
                    // Clean up empty topic maps
                    if (subs.size === 0) {
                        instance.exactSubscriptions.delete(topic);
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
            return Array.from(instance.cache.keys());
        };

        /**
         * Get the number of entries in the cache
         * @returns {number} - Cache size
         */
        node.size = function() {
            return instance.cache.size;
        };

        /**
         * Clear all entries from cache
         */
        node.clear = function() {
            instance.cache.clear();
        };

        // Internal: dispatch updates to matching subscriptions
        // Optimized: O(1) for exact matches, O(w) for wildcard patterns
        const updateHandler = (topic, entry) => {
            // First: O(1) lookup for exact subscriptions
            const exactSubs = instance.exactSubscriptions.get(topic);
            if (exactSubs) {
                for (const [subId, callback] of exactSubs) {
                    try {
                        callback(topic, entry);
                    } catch (err) {
                        RED.log.error(`[event-cache] Subscription callback error: ${err.message}`);
                    }
                }
            }

            // Second: iterate only wildcard subscriptions (typically fewer)
            for (const [subId, sub] of instance.wildcardSubscriptions) {
                if (sub.regex.test(topic)) {
                    try {
                        sub.callback(topic, entry);
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
                instance.cache.clear();
                instance.exactSubscriptions.clear();
                instance.wildcardSubscriptions.clear();
                instance.emitter.removeAllListeners();
                cacheInstances.delete(cacheKey);
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
            const instance = cacheInstances.get(node.id);
            let exactSubCount = 0;
            if (instance) {
                for (const subs of instance.exactSubscriptions.values()) {
                    exactSubCount += subs.size;
                }
            }
            res.json({
                size: node.size(),
                topics: node.getTopics(),
                maxEntries: node.maxEntries,
                ttl: node.ttl,
                subscriptions: {
                    exact: exactSubCount,
                    wildcard: instance ? instance.wildcardSubscriptions.size : 0,
                    exactTopics: instance ? instance.exactSubscriptions.size : 0
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
        for (const [cacheKey, instance] of cacheInstances) {
            for (const topic of instance.cache.keys()) {
                allTopics.add(topic);
            }
        }
        res.json(Array.from(allTopics).sort());
    });
};
