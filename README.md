# HyperExpress: High Performance Node.js Webserver
#### Powered by [`uWebSockets.js`](https://github.com/uNetworking/uWebSockets.js/)

<div align="left">

[![NPM version](https://img.shields.io/npm/v/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![NPM downloads](https://img.shields.io/npm/dm/hyper-express.svg?style=flat)](https://www.npmjs.com/package/hyper-express)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/hyper-express.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/hyper-express/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/hyper-express)](https://github.com/kartikk221/hyper-express/blob/master/LICENSE)

</div>

## Motivation
HyperExpress aims to be a simple yet perfomant HTTP & Websocket Server. Combined with the power of uWebsockets.js, a Node.js binding of uSockets written in C++, HyperExpress allows developers to unlock higher throughput for their web applications with their existing hardware. This can allow many web applications to become much more performant on optimized data serving endpoints without having to scale hardware.

Some of the prominent features implemented are:
- Asynchronous By Nature
- Simplified HTTP & Websocket API
- Global & Route-Specific Middlewares Support
- Modular Routers Support
- HTTP & Websocket Streaming Support
- Performant Multipart File Uploading
- Global Error/Event Handlers
- Cryptographically Secure Cookie Signing/Authentication
- ExpressJS API Compatibility Through Shared Methods/Properties
- TypeScript Types Support

## Documentation
HyperExpress requires Node.js version 14+ and can be installed using Node Package Manager (`npm`).
```
npm i hyper-express
```

- See [`> [Examples & Snippets]`](./docs/Examples.md) for small and **easy-to-use snippets** with HyperExpress.
- See [`> [Server]`](./docs/Server.md) for creating a webserver and working with the **Server** component.
- See [`> [Middlewares]`](./docs/Middlewares.md) for working with global and route-specific **Middlewares** in HyperExpress.
- See [`> [Router]`](./docs/Router.md) for working with the modular **Router** component.
- See [`> [Request]`](./docs/Request.md) for working with the **Request** component made available through handlers.
- See [`> [Response]`](./docs/Response.md) for working with the **Response** component made available through handlers.
- See [`> [MultipartField]`](./docs/MultipartField.md) for working with multipart requests and **File Uploading** in HyperExpress.
- See [`> [Websocket]`](./docs/Websocket.md) for working with **Websockets** in HyperExpress.
- See [`> [SessionEngine]`](https://github.com/kartikk221/hyper-express-session) for working with cookie based web **Sessions** in HyperExpress.
- See [`> [LiveDirectory]`](./docs/LiveDirectory.md) for implementing **static file/asset** serving functionality into HyperExpress.

## What's Different?
While there may be other uWebsockets.js based packages available, HyperExpress differentiates itself in the following ways:
- Instantaneous Request Handling
    - HyperExpress implements a request handling model similar to fetch where a request is passed almost instantly to the route handler and the request body can be asynchronously dowloaded/accessed. This behavior allows for aborting of a request and potentially saving on memory usage for endpoints that deal with relatively larger body sizes as the body simply won't be downloaded into memory without access.
- Simple To Use API
    - HyperExpress implements simple yet understandable methods/properties for its components to allow for clear and concise code that is at many times chainable and asynchronous.
- Lightweight Package Size
    - HyperExpress is extremely lightweight while implementing almost all of the core functionalities of a webserver providing users with flexibility.
- High Maintainability
    - Whether you decide to develop on your own fork or expand upon HyperExpress through middlewares, You will be greeted with a concise codebase with descriptive logic comments and JSDoc types that allow for high maintainability.
- MIT License
    - Some other webserver packages are released under more restrictive licenses and often provide paid "performance efficient" versions of their package. HyperExpress is provided with a flexible MIT licence in which you are free to expand upon the package as you desire while also being able to take advantage of the efficient and maintainable codebase at no cost.

## Benchmarks
Below benchmark results were derived using the **[autocannon](https://www.npmjs.com/package/autocannon)** HTTP benchmarking utility. The benchmark source code is included in this repository in the benchmarks folder.

#### CLI Command
This command simulates a high stress situation where **2500 unique visitors** visit your website at the same time and their browsers on average make **4 pipelined requests** per TCP connection sustained for **30 seconds**.
```
autocannon -c 2500 -d 30 -p 4 http://HOST:PORT/benchmark
```

### Environment Specifications
* __Machine:__ Ubuntu 20.04 | 1 vCPU | 1GB Mem | 32GB Nvme | Vultr @ $6/Month
* __Node:__ `v16.0.0`
* __Method:__ Two rounds; one to warm-up, one to measure
* __Response Body:__ Small HTML page with a dynamic timestamp generated with `Date`. See more in [HTML Test](./benchmarks/tests/simple_html.js).
* __Linux Optimizations:__ None.

### Benchmark Results
**Note!** uWebsockets.js and HyperExpress were bottlenecked by the network speed of the Vultr instance. While, Fastify and Express were bottlenecked by high CPU usage resulting in a much lower throughput with relatively higher latency numbers. For average use cases, all webservers below can serve requests at lower than **50ms** latency.

|                          | Version | Requests/s | Latency | Throughput/s |
| :--                      | --:     | :-:        | --:     | --:          |
| uWebsockets.js           | 20.0.0  | 197,223    | 441 ms  | 106 Mb/s     |
| HyperExpress             | 5.7.0   | 195,413    | 411 ms  | 106 Mb/s     |
| nanoexpress              | 5.1.1   | 196,828    | 421 ms  | 106 Mb/s     |
| Fastify                  | 3.22.0  | 42,332     | 571 ms  | 26 Mb/s      |
| Express                  | 4.17.1  | 5,922      | 1860 ms | 3.9 Mb/s     |

## Testing Changes
To run HyperExpress functionality tests locally on your machine, you must follow the steps below.
1. Clone the HyperExpress repository to your machine.
2. Initialize and pull any submodule(s) which are used throughout the tests.
3. Run `npm install` in the root of the HyperExpress repository.
4. Run `npm install` in the `/tests` directory.
5. Execute the `/tests/index.js` file to perform tests.

## License
[MIT](./LICENSE)
