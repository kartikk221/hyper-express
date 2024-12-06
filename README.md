# HyperExpress: High Performance Node.js Webserver
#### Powered by [`uWebSockets.js`](https://github.com/uNetworking/uWebSockets.js/)

<div align="left">

[![NPM version](https://img.shields.io/npm/v/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![NPM downloads](https://img.shields.io/npm/dm/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/blob/master/LICENSE)

</div>

## Motivation
HyperExpress aims to be a simple yet performant HTTP & Websocket Server. Combined with the power of uWebsockets.js, a Node.js binding of uSockets written in C++, HyperExpress allows developers to unlock higher throughput for their web applications with their existing hardware. This can allow many web applications to become much more performant on optimized data serving endpoints without having to scale hardware.

Some of the prominent highlights are:
- Simplified HTTP & Websocket API
- Server-Sent Events Support
- Multipart File Uploading Support
- Modular Routers & Middlewares Support
- Multiple Host/Domain Support Over SSL
- Limited Express.js API Compatibility Through Shared Methods/Properties

See [`> [Benchmarks]`](https://web-frameworks-benchmark.netlify.app/result?l=javascript) for **performance metrics** against other webservers in real world deployments.

## Documentation
HyperExpress **supports** the latest three LTS (Long-term Support) Node.js versions only and can be installed using Node Package Manager (`npm`).
```
npm i hyper-express
```

- See [`> [Examples & Snippets]`](./docs/Examples.md) for small and **easy-to-use snippets** with HyperExpress.
- See [`> [Server]`](./docs/Server.md) for creating a webserver and working with the **Server** component.
- See [`> [Router]`](./docs/Router.md) for working with the modular **Router** component.
- See [`> [Request]`](./docs/Request.md) for working with the **Request** component made available through handlers.
- See [`> [Response]`](./docs/Response.md) for working with the **Response** component made available through handlers.
- See [`> [Websocket]`](./docs/Websocket.md) for working with **Websockets** in HyperExpress.
- See [`> [Middlewares]`](./docs/Middlewares.md) for working with global and route-specific **Middlewares** in HyperExpress.
- See [`> [SSEventStream]`](./docs/SSEventStream.md) for working with **Server-Sent Events** based streaming in HyperExpress.
- See [`> [MultipartField]`](./docs/MultipartField.md) for working with multipart requests and **File Uploading** in HyperExpress.
- See [`> [SessionEngine]`](https://github.com/kartikk221/hyper-express-session) for working with cookie based web **Sessions** in HyperExpress.
- See [`> [LiveDirectory]`](./docs/LiveDirectory.md) for implementing **static file/asset** serving functionality into HyperExpress.
- See [`> [HostManager]`](./docs/HostManager.md) for supporting requests over **muliple hostnames** in HyperExpress.
- See [`> [Typescript]`](./docs/Typescript.md) for working with Typescript in HyperExpress.

## Encountering Problems?
- HyperExpress is mostly compatible with `Express` but not **100%** therefore you may encounter some middlewares not working out of the box. In this scenario, you must either write your own polyfill or omit the middleware to continue.
- The uWebsockets.js version header is disabled by default. You may opt-out of this behavior by setting an environment variable called `KEEP_UWS_HEADER` to a truthy value such as `1` or `true`.
- Still having problems? Open an [`> [Issue]`](https://github.com/kartikk221/hyper-express/issues) with details about what led up to the problem including error traces, route information etc etc.

## Testing Changes
To run HyperExpress functionality tests locally on your machine, you must follow the steps below.
1. Clone the HyperExpress repository to your machine.
2. Initialize and pull any submodule(s) which are used throughout the tests.
3. Run `npm install` in the root directory.
4. Run `npm install` in the `/tests` directory.
5. Run `npm test` to run all tests with your local changes.

## License
[MIT](./LICENSE)
