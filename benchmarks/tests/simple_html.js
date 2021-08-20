function simple_html() {
    let timestamp = Date.now();
    return `
    <html>
        <head>
            <head>Benchmark Test</head>
            <script>
                let backend_ts = '${timestamp}';
                console.log('This Page Was Generated At ' + timestamp);
            </script>
        </head>
        <body>
            <h1>Benchmark Page</h1>
            <h3>Generated @ ${new Date(timestamp).toString()} [${timestamp}]</h3>
        </body>
    </html>
    `;
}

module.exports = simple_html;
