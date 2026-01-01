module.exports = {
    testDir: './test',
    timeout: 60000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:1880',
        headless: false,
        viewport: { width: 1920, height: 1080 },
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    reporter: [
        ['list'],
        ['html', { open: 'never' }]
    ],
};
