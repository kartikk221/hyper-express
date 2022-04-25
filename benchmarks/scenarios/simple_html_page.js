export function get_simple_html_page({ server_name }) {
    const date = new Date();
    return {
        status: 200,
        headers: {
            'unix-ms-ts': date.getTime().toString(),
            'cache-control': 'no-cache',
            'content-type': 'text/html; charset=utf-8',
            'server-name': server_name,
        },
        body: `
        <html>
            <head>
                <title>Welcome @ ${date.toLocaleDateString()}</title>
            </head>
            <body>
                <h1>This is a simple HTML page.</h1>
                <p>This page was rendered at ${date.toLocaleString()} and delivered using '${server_name}' webserver.</p>
            </body>
        </html>
        `,
    };
}
