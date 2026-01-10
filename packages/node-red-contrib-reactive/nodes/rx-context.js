const { Subject, BehaviorSubject, ReplaySubject } = require('rxjs');

module.exports = function(RED) {
    // Store context instances
    const contextInstances = new Map();

    function RxContextNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Map to store named subjects
        const subjects = new Map();

        // Map to store subscriptions for cleanup
        const subscriptions = new Map();
        let subscriptionId = 0;

        // Store instance reference
        contextInstances.set(node.id, node);

        /**
         * Get or create a subject by name
         * @param {string} name - Subject name
         * @param {string} type - 'subject', 'behavior', or 'replay'
         * @param {*} initialValue - Initial value for BehaviorSubject
         * @param {number} bufferSize - Buffer size for ReplaySubject
         * @returns {Subject}
         */
        node.getSubject = function(name, type = 'subject', initialValue = null, bufferSize = 1) {
            if (!subjects.has(name)) {
                let subject;
                switch (type) {
                    case 'behavior':
                        subject = new BehaviorSubject(initialValue);
                        break;
                    case 'replay':
                        subject = new ReplaySubject(bufferSize);
                        break;
                    default:
                        subject = new Subject();
                }
                subjects.set(name, { subject, type });
            }
            return subjects.get(name).subject;
        };

        /**
         * Publish a value to a named subject
         * @param {string} name - Subject name
         * @param {*} value - Value to publish
         */
        node.publish = function(name, value) {
            if (subjects.has(name)) {
                subjects.get(name).subject.next(value);
                return true;
            }
            return false;
        };

        /**
         * Subscribe to a named subject
         * @param {string} name - Subject name
         * @param {function} callback - Callback function
         * @returns {number} Subscription ID for unsubscribe
         */
        node.subscribe = function(name, callback) {
            if (!subjects.has(name)) {
                return null;
            }

            const id = ++subscriptionId;
            const subscription = subjects.get(name).subject.subscribe({
                next: callback,
                error: (err) => node.error(`Stream ${name} error: ${err.message}`)
            });

            subscriptions.set(id, { name, subscription });
            return id;
        };

        /**
         * Unsubscribe by subscription ID
         * @param {number} id - Subscription ID
         */
        node.unsubscribe = function(id) {
            if (subscriptions.has(id)) {
                subscriptions.get(id).subscription.unsubscribe();
                subscriptions.delete(id);
                return true;
            }
            return false;
        };

        /**
         * Check if a subject exists
         * @param {string} name - Subject name
         * @returns {boolean}
         */
        node.hasSubject = function(name) {
            return subjects.has(name);
        };

        /**
         * Get all subject names
         * @returns {string[]}
         */
        node.getSubjectNames = function() {
            return Array.from(subjects.keys());
        };

        /**
         * Get subject info
         * @param {string} name - Subject name
         * @returns {object|null}
         */
        node.getSubjectInfo = function(name) {
            if (!subjects.has(name)) return null;
            const info = subjects.get(name);
            return {
                name,
                type: info.type,
                hasValue: info.type === 'behavior'
            };
        };

        /**
         * Complete and remove a subject
         * @param {string} name - Subject name
         */
        node.removeSubject = function(name) {
            if (subjects.has(name)) {
                subjects.get(name).subject.complete();
                subjects.delete(name);
                return true;
            }
            return false;
        };

        /**
         * Get stats about the context
         * @returns {object}
         */
        node.getStats = function() {
            return {
                subjects: subjects.size,
                subscriptions: subscriptions.size,
                subjectNames: Array.from(subjects.keys())
            };
        };

        // Cleanup on close
        node.on('close', function(done) {
            // Unsubscribe all
            for (const [id, sub] of subscriptions) {
                sub.subscription.unsubscribe();
            }
            subscriptions.clear();

            // Complete all subjects
            for (const [name, info] of subjects) {
                info.subject.complete();
            }
            subjects.clear();

            // Remove instance reference
            contextInstances.delete(node.id);

            done();
        });
    }

    RED.nodes.registerType("rx-context", RxContextNode);

    // Admin API for stats
    RED.httpAdmin.get("/rx-context/:id/stats", function(req, res) {
        const node = contextInstances.get(req.params.id);
        if (node) {
            res.json(node.getStats());
        } else {
            res.status(404).json({ error: "Context not found" });
        }
    });

    // Admin API for subject names (for autocomplete)
    RED.httpAdmin.get("/rx-context/:id/subjects", function(req, res) {
        const node = contextInstances.get(req.params.id);
        if (node) {
            res.json(node.getSubjectNames());
        } else {
            res.status(404).json({ error: "Context not found" });
        }
    });
};
