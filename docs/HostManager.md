# HostManager
Below is a breakdown of the `HostManager` object made available through the `Server.hosts` property allowing for support of multiple hostnames with their own SSL configurations.

#### Working With A HostManager

```javascript
// Let's support example.com with it's own SSL configuration
server.hosts.add('example.com', {
   cert_file_name: 'path/to/example.com/cert',
   key_file_name: 'path/to/example.com/key'
});

// Bind a handler which is called on requests that do not come from a supported hostname
server.hosts.on('missing', (hostname) => {
    // Note! This event handler should be treated synchronously only
    // uWebsockets.js expects you to register an appropriate handler for the incoming request in this synchronous execution
    switch (hostname) {
        case 'example2.com':
            return server.hosts.add(hostname, {
                   cert_file_name: 'path/to/example2.com/cert',
                   key_file_name: 'path/to/example2.com/key'
            });
    }
});
```

#### HostManager Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `registered`    | `Object<string, HostOptions>` | All of the registered host configurations. |

#### HostManager Methods
* `add(hostname: string, options: HostOptions)`: Registers the unique host options to use for the specified hostname for incoming requests.
    * **Returns** the self `HostManager` instance.
    * `HostOptions`:
        * `passphrase`[`String`]: Strong passphrase for SSL cryptographic purposes.
        * `cert_file_name`[`String`]: Path to SSL certificate file to be used for SSL/TLS.
        * `key_file_name`[`String`]: Path to SSL private key file to be used for SSL/TLS.
        * `dh_params_file_name`[`String`]: Path to file containing Diffie-Hellman parameters.
        * `ssl_prefer_low_memory_usage`[`Boolean`]: Whether to prefer low memory usage over high performance.
* `remove(hostname: string)`: Un-Registers the unique host options to use for the specified hostname for incoming requests.
    * **Returns** the self `HostManager` instance.