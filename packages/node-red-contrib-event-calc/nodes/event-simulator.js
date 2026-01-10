module.exports = function(RED) {
    function EventSimulatorNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.waveform = config.waveform || "sinusoid";
        node.amplitude = parseFloat(config.amplitude) || 1;
        node.frequency = parseFloat(config.frequency) || 1; // Hz
        node.offset = parseFloat(config.offset) || 0;
        node.interval = parseInt(config.interval) || 100; // ms
        node.startOnDeploy = config.startOnDeploy !== false;
        node.noiseLevel = parseFloat(config.noiseLevel) || 0;
        node.topicCount = parseInt(config.topicCount) || 1;
        node.phaseSpread = config.phaseSpread !== false; // Add phase offset between topics

        const baseName = config.name || "simulator";

        let timer = null;
        let startTime = Date.now();
        let sampleCount = 0;

        // Waveform generators
        const waveforms = {
            sinusoid: (t, freq, amp, offset) => {
                return amp * Math.sin(2 * Math.PI * freq * t) + offset;
            },
            cosine: (t, freq, amp, offset) => {
                return amp * Math.cos(2 * Math.PI * freq * t) + offset;
            },
            sawtooth: (t, freq, amp, offset) => {
                const period = 1 / freq;
                const phase = (t % period) / period;
                return amp * (2 * phase - 1) + offset;
            },
            triangle: (t, freq, amp, offset) => {
                const period = 1 / freq;
                const phase = (t % period) / period;
                return amp * (4 * Math.abs(phase - 0.5) - 1) + offset;
            },
            rectangle: (t, freq, amp, offset) => {
                const period = 1 / freq;
                const phase = (t % period) / period;
                return amp * (phase < 0.5 ? 1 : -1) + offset;
            },
            pulse: (t, freq, amp, offset) => {
                const period = 1 / freq;
                const phase = (t % period) / period;
                return amp * (phase < 0.1 ? 1 : 0) + offset;
            },
            random: (t, freq, amp, offset) => {
                return amp * (Math.random() * 2 - 1) + offset;
            },
            randomWalk: (t, freq, amp, offset, topicIndex) => {
                // Random walk with mean reversion (per-topic state)
                if (!node._lastValues) node._lastValues = {};
                if (node._lastValues[topicIndex] === undefined) node._lastValues[topicIndex] = offset;
                const step = (Math.random() * 2 - 1) * amp * 0.1;
                const reversion = (offset - node._lastValues[topicIndex]) * 0.05;
                node._lastValues[topicIndex] = Math.max(offset - amp, Math.min(offset + amp, node._lastValues[topicIndex] + step + reversion));
                return node._lastValues[topicIndex];
            }
        };

        function generateSample() {
            const now = Date.now();
            const t = (now - startTime) / 1000; // time in seconds
            sampleCount++;

            const generator = waveforms[node.waveform] || waveforms.sinusoid;

            // Generate message for each topic
            for (let i = 0; i < node.topicCount; i++) {
                // Calculate phase offset for this topic (spread evenly across one period)
                const phaseOffset = node.phaseSpread ? (i / node.topicCount) / node.frequency : 0;
                const tWithPhase = t + phaseOffset;

                let value = generator(tWithPhase, node.frequency, node.amplitude, node.offset, i);

                // Add noise if configured
                if (node.noiseLevel > 0) {
                    value += (Math.random() * 2 - 1) * node.noiseLevel * node.amplitude;
                }

                // Topic name: baseName for count=1, baseName1/baseName2/... for count>1
                const topic = node.topicCount === 1 ? baseName : `${baseName}${i + 1}`;

                const msg = {
                    topic: topic,
                    payload: value,
                    timestamp: now,
                    _simulator: {
                        waveform: node.waveform,
                        frequency: node.frequency,
                        amplitude: node.amplitude,
                        sample: sampleCount,
                        time: tWithPhase,
                        topicIndex: i + 1
                    }
                };

                node.send(msg);
            }

            // Status shows count and first value
            const firstValue = generator(t, node.frequency, node.amplitude, node.offset, 0);
            const statusText = node.topicCount > 1
                ? `${sampleCount}: ${node.topicCount} topics`
                : `${sampleCount}: ${firstValue.toFixed(3)}`;
            node.status({ fill: "green", shape: "dot", text: statusText });
        }

        function start() {
            if (timer) return;
            startTime = Date.now();
            sampleCount = 0;
            node._lastValues = {}; // Reset random walk state
            timer = setInterval(generateSample, node.interval);
            const statusText = node.topicCount > 1 ? `running (${node.topicCount} topics)` : "running";
            node.status({ fill: "green", shape: "dot", text: statusText });
        }

        function stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            node.status({ fill: "grey", shape: "ring", text: "stopped" });
        }

        function reset() {
            stop();
            start();
        }

        // Start on deploy if configured
        if (node.startOnDeploy) {
            start();
        } else {
            node.status({ fill: "grey", shape: "ring", text: "stopped" });
        }

        node.on('input', function(msg, send, done) {
            const command = (msg.payload || "").toString().toLowerCase();

            switch (command) {
                case 'start':
                    start();
                    break;
                case 'stop':
                    stop();
                    break;
                case 'reset':
                    reset();
                    break;
                default:
                    // Update parameters if provided
                    if (typeof msg.amplitude === 'number') node.amplitude = msg.amplitude;
                    if (typeof msg.frequency === 'number') node.frequency = msg.frequency;
                    if (typeof msg.offset === 'number') node.offset = msg.offset;
                    if (typeof msg.interval === 'number') {
                        node.interval = msg.interval;
                        if (timer) reset();
                    }
                    if (typeof msg.topicCount === 'number' && msg.topicCount >= 1) {
                        node.topicCount = Math.floor(msg.topicCount);
                    }
                    if (typeof msg.phaseSpread === 'boolean') {
                        node.phaseSpread = msg.phaseSpread;
                    }
                    if (msg.waveform && waveforms[msg.waveform]) {
                        node.waveform = msg.waveform;
                    }
            }

            if (done) done();
        });

        node.on('close', function(done) {
            stop();
            done();
        });
    }

    RED.nodes.registerType("event-simulator", EventSimulatorNode);
};