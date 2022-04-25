function get_simple_html_page({ server_name }) {
    const date = new Date();
    return `
    <html>
        <head>
            <title>Welcome | ${date.toLocaleDateString()}</title>
        </head>
        <body>
            <h1>This is a simple HTML page.</h1>
            <p>This page was rendered at ${date.toLocaleString()} and delivered using '${server_name}' webserver.</p>
        </body>
    </html>
    `;
}

module.exports = get_simple_html_page;
