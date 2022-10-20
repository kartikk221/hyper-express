import { ReadableOptions } from 'stream';
import { Request } from '../http/Request';
import { Response } from '../http/Response';
import { Websocket } from '../ws/Websocket';
import { MiddlewareHandler } from '../middleware/MiddlewareHandler';

// Define types for HTTP Route Creators
export type UserRouteHandler = (request: Request, response: Response) => any;
export interface UserRouteOptions {
    middlewares?: Array<MiddlewareHandler>;
    stream_options?: ReadableOptions;
    max_body_length?: number;
}

// Define types for Websocket Route Creator
export type WSRouteHandler = (websocket: Websocket) => void;
export interface WSRouteOptions {
    message_type?: 'String' | 'Buffer' | 'ArrayBuffer';
    idle_timeout?: number;
    max_backpressure?: number;
    max_payload_length?: number;
}

// Define types for internal route/middleware records
export interface RouteRecord {
    method: string;
    pattern: string;
    options: UserRouteOptions | WSRouteOptions;
    handler: UserRouteHandler;
}

export interface MiddlewareRecord {
    pattern: string;
    middleware: MiddlewareHandler;
}

export class Router {
    constructor();

    /**
     * Registers middlewares and router instances on the specified pattern if specified.
     * If no pattern is specified, the middleware/router instance will be mounted on the '/' root path by default of this instance.
     *
     * @param {...(String|MiddlewareHandler|Router)} args (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     */
    use(router: Router): void;
    use(...routers: Router[]): void;
    use(...middlewares: MiddlewareHandler[]): void;
    use(pattern: string, router: Router): void;
    use(pattern: string, ...routers: Router[]): void;
    use(pattern: string, ...middlewares: MiddlewareHandler[]): void;

    /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    any(pattern: string, handler: UserRouteHandler): void;
    any(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    any(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Alias of any() method.
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    all(pattern: string, handler: UserRouteHandler): void;
    all(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    all(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    get(pattern: string, handler: UserRouteHandler): void;
    get(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    get(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    post(pattern: string, handler: UserRouteHandler): void;
    post(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    post(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles PUT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    put(pattern: string, handler: UserRouteHandler): void;
    put(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    put(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    delete(pattern: string, handler: UserRouteHandler): void;
    delete(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    delete(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    head(pattern: string, handler: UserRouteHandler): void;
    head(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    head(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    options(pattern: string, handler: UserRouteHandler): void;
    options(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    options(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    patch(pattern: string, handler: UserRouteHandler): void;
    patch(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    patch(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    trace(pattern: string, handler: UserRouteHandler): void;
    trace(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    trace(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    connect(pattern: string, handler: UserRouteHandler): void;
    connect(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    connect(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * Intercepts and handles upgrade requests for incoming websocket connections.
     * Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    upgrade(pattern: string, handler: UserRouteHandler): void;
    upgrade(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): void;
    upgrade(
        pattern: string,
        options: UserRouteOptions,
        ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
    ): void;

    /**
     * @param {String} pattern
     * @param {WSRouteOptions|WSRouteHandler} options
     * @param {WSRouteHandler} handler
     */
    ws(pattern: string, handler: WSRouteHandler): void;
    ws(pattern: string, options: WSRouteOptions, handler: WSRouteHandler): void;

    /**
     * Returns All routes in this router in the order they were registered.
     * @returns {Array}
     */
    get routes(): Array<RouteRecord>;

    /**
     * Returns all middlewares in this router in the order they were registered.
     * @returns {Array}
     */
    get middlewares(): Array<MiddlewareRecord>;
}
