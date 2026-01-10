const { Subject, interval } = require('rxjs');
const { bufferTime, filter } = require('rxjs/operators');

module.exports = function(RED) {
    function RxWindowNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.windowTime = parseInt(config.windowTime) || 5000;
        node.slideTime = parseInt(config.slideTime) || 0; // 0 = tumbling, >0 = sliding
        node.aggregate = config.aggregate || "array";
        node.emitEmpty = config.emitEmpty === true;

        const subject = new Subject();
        let subscription = null;
        let windowCount = 0;

        // Aggregation functions
        const aggregators = {
            array: (values) => values,
            count: (values) => values.length,
            sum: (values) => values.reduce((a, b) => a + b, 0),
            avg: (values) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
            min: (values) => values.length > 0 ? Math.min(...values) : null,
            max: (values) => values.length > 0 ? Math.max(...values) : null,
            first: (values) => values.length > 0 ? values[0] : null,
            last: (values) => values.length > 0 ? values[values.length - 1] : null,
            range: (values) => values.length > 0 ? Math.max(...values) - Math.min(...values) : null,
            stddev: (values) => {
                if (values.length < 2) return null;
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const squareDiffs = values.map(v => Math.pow(v - avg, 2));
                return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
            },
            stats: (values) => {
                if (values.length === 0) return null;
                const sorted = [...values].sort((a, b) => a - b);
                const sum = values.reduce((a, b) => a + b, 0);
                const avg = sum / values.length;
                const squareDiffs = values.map(v => Math.pow(v - avg, 2));
                const stddev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
                return {
                    count: values.length,
                    sum: sum,
                    avg: avg,
                    min: sorted[0],
                    max: sorted[sorted.length - 1],
                    range: sorted[sorted.length - 1] - sorted[0],
                    stddev: stddev,
                    median: sorted.length % 2 === 0
                        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                        : sorted[Math.floor(sorted.length / 2)]
                };
            }
        };

        // Set up the windowed stream
        const slideMs = node.slideTime > 0 ? node.slideTime : node.windowTime;

        subscription = subject.pipe(
            bufferTime(node.windowTime, slideMs),
            filter(values => node.emitEmpty || values.length > 0)
        ).subscribe({
            next: (values) => {
                windowCount++;

                const aggregateFn = aggregators[node.aggregate] || aggregators.array;
                const result = aggregateFn(values);

                const msg = {
                    payload: result,
                    windowCount: windowCount,
                    windowSize: values.length,
                    windowTime: node.windowTime,
                    _rxWindow: true
                };

                node.send(msg);

                const displayValue = node.aggregate === 'stats'
                    ? `window ${windowCount}: ${values.length} items`
                    : `window ${windowCount}: ${JSON.stringify(result).substring(0, 20)}`;
                node.status({ fill: "green", shape: "dot", text: displayValue });
            },
            error: (err) => {
                node.error(err.message);
                node.status({ fill: "red", shape: "ring", text: "error" });
            }
        });

        const windowType = node.slideTime > 0 ? "sliding" : "tumbling";
        node.status({ fill: "grey", shape: "dot", text: `${windowType} ${node.windowTime}ms` });

        node.on('input', function(msg, send, done) {
            // Push the payload (should be a number for most aggregations)
            subject.next(msg.payload);

            if (done) done();
        });

        node.on('close', function(done) {
            if (subscription) {
                subscription.unsubscribe();
            }
            subject.complete();
            done();
        });
    }

    RED.nodes.registerType("rx-window", RxWindowNode);
};
