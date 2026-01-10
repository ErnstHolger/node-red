module.exports = function(RED) {
    function RxSubjectNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.context = RED.nodes.getNode(config.context);
        node.subjectName = config.subjectName || "default";
        node.subjectType = config.subjectType || "subject";
        node.initialValue = config.initialValue;
        node.bufferSize = parseInt(config.bufferSize) || 1;

        if (!node.context) {
            node.status({ fill: "red", shape: "ring", text: "no context" });
            return;
        }

        // Parse initial value if provided
        let parsedInitialValue = null;
        if (node.initialValue && node.initialValue.trim()) {
            try {
                parsedInitialValue = JSON.parse(node.initialValue);
            } catch (e) {
                parsedInitialValue = node.initialValue;
            }
        }

        // Get or create the subject
        const subject = node.context.getSubject(
            node.subjectName,
            node.subjectType,
            parsedInitialValue,
            node.bufferSize
        );

        node.status({ fill: "green", shape: "dot", text: node.subjectName });

        node.on('input', function(msg, send, done) {
            // Allow dynamic subject name
            const targetName = msg.subjectName || node.subjectName;

            if (targetName !== node.subjectName) {
                // Publishing to a different subject
                const targetSubject = node.context.getSubject(targetName, node.subjectType);
                targetSubject.next(msg.payload);
            } else {
                // Publish to configured subject
                subject.next(msg.payload);
            }

            // Pass through the message
            send(msg);

            if (done) done();
        });

        node.on('close', function(done) {
            done();
        });
    }

    RED.nodes.registerType("rx-subject", RxSubjectNode);
};
