# LiveDirectory
Below is a simple guide on implementing static serving functionality to HyperExpress while maintaining high performance.

#### Why LiveDirectory?
LiveDirectory loads files from the specified path into memory and watches them for updates allowing for instantaneous changes. This is desirable for both development and production environments as we do not have to wait on any I/O operation when serving assets. Each request will serve the most updated file content from memory allowing for high performance and throughput without any bottlenecks.
- See [`> [LiveDirectory]`](./docs/LiveDirectory.md) for all available properties, methods and documentation on this package.

#### Getting Started
Please install the [`live-directory`](https://github.com/kartikk221/live-directory) using the `npm` package manager.
```js
npm i live-directory
```

#### Creating A Static Serve Route
```js
const HyperExpress = require('hyper-express');
const LiveDirectory = require('live-directory');
const Server = new HyperExpress.Server();

// Create a LiveDirectory instance to virtualize directory with our assets
const LiveAssets = new LiveDirectory({
    path: '/var/www/website/files', // We want to provide the system path to the folder. Avoid using relative paths.
    keep: {
        extensions: ['.css', '.js', '.json', '.png', '.jpg', '.jpeg'] // We only want to serve files with these extensions
    },
    ignore: (path) => {
        return path.startsWith('.'); // We want to ignore dotfiles for safety
    }
});

// Create static serve route to serve frontend assets
Server.get('/assets/*', (request, response) => {
    // Strip away '/assets' from the request path to get asset relative path
    // Lookup LiveFile instance from our LiveDirectory instance.
    const path = request.path.replace('/assets', '');
    const file = LiveAssets.get(path);
    
    // Return a 404 if no asset/file exists on the derived path
    if (file === undefined) return response.status(404).send();
    
    // Set appropriate mime-type and serve file buffer as response body
    return response.type(file.extension).send(file.buffer);
});

// Some examples of how the above route will map & serve requests:
// [GET /assets/images/logo.png] >> [/var/www/website/files/images/logo.png]
// [GET /assets/js/index.js] >> [/var/www/website/files/js/index.js]
```

#### Is This Secure?
LiveDirectory will traverse through all sub-directories and files from your specified path and load its files into memory. Due to this, we do not perform any file system operations for lookups of files. This eliminates any path manipulation vulnerability that may allow a bad actor to access sensitive files on your hardware as only files that loaded into memory are served. To view which files have been loaded into memory by LiveDirectory simply view the `LiveDirectory.files` object.

#### What Are The Downsides?
Since LiveDirectory loads all files from your specified path into memory, this method of static serving is not suitable for serving large files automatically. It is strongly recommended to use read streams combined with the `Response.write` method to write large files in chunks to prevent exhaustion of your system's memory.