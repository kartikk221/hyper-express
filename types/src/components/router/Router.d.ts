/// <reference types="node" />
export = Router;
declare class Router {
    /**
     * Returns default route options based on method.
     *
     * @private
     * @param {String} method
     * @returns {Object}
     */
    private _default_options;
    /**
     * Registers a route in the routes array for this router.
     *
     * @private
     * @param {String} method Supported: any, get, post, delete, head, options, patch, put, trace
     * @param {String} pattern Example: "/api/v1"
     * @param {Object} options Route processor options (Optional)
     * @param {Function} handler Example: (request, response) => {}
     */
    private _register_route;
    /**
     * Registers a middleware from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Function} middleware
     */
    private _register_middleware;
    /**
     * Registers a router from use() method and recalibrates.
     *
     * @private
     * @param {String} pattern
     * @param {Router} router
     */
    private _register_router;
    /**
     * Subscribes a handler which will be invocated with changes.
     *
     * @private
     * @param {*} handler
     */
    private _subscribe;
    /**
     * @typedef MiddlewareHandler
     * @type {function(Request, Response, Function):void}
     */
    /**
     * @typedef AsyncMiddlewareHandler
     * @type {function(Request, Response):Promise}
     */
    /**
     * @typedef HttpMiddlewareHandler
     * @type {function(http.IncomingMessage, http.ServerResponse, Function):void}
     */
    /**
     * @typedef ExpressMiddlewareHandler
     * @type {function(express.Request, express.Response, express.NextFunction):void}
     */
    /**
     * @typedef ExpressErrorMiddlewareHandler
     * @type {function(any, express.Request, express.Response, express.NextFunction):void}
     */
    /**
     * Registers a middleware/router with specified path.
     *
     * @param {String|MiddlewareHandler|AsyncMiddlewareHandler|HttpMiddlewareHandler|ExpressMiddlewareHandler|ExpressErrorMiddlewareHandler|Router} pattern
     * @param {MiddlewareHandler|AsyncMiddlewareHandler|HttpMiddlewareHandler|ExpressMiddlewareHandler|ExpressErrorMiddlewareHandler|Router=} handler (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
     */
    use(pattern: string | Router | ((arg0: Request, arg1: Response, arg2: Function) => void) | ((arg0: Request, arg1: Response) => Promise<any>) | ((arg0: http.IncomingMessage, arg1: http.ServerResponse, arg2: Function) => void) | ((arg0: any, arg1: any, arg2: any) => void) | ((arg0: any, arg1: any, arg2: any, arg3: any) => void), handler?: Router | ((arg0: Request, arg1: Response, arg2: Function) => void) | ((arg0: Request, arg1: Response) => Promise<any>) | ((arg0: http.IncomingMessage, arg1: http.ServerResponse, arg2: Function) => void) | ((arg0: any, arg1: any, arg2: any) => void) | ((arg0: any, arg1: any, arg2: any, arg3: any) => void)): void;
    /**
     * @typedef {Object} RouteOptions
     * @property {Array.<MiddlewareHandler>|Array.<AsyncMiddlewareHandler>} middlewares Route specific middlewares
     * @property {Boolean} expect_body Pre-parses and populates Request.body with specified body type.
     */
    /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */
    /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    any(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    get(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    post(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    delete(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    head(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    options(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    patch(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler=} handler
     */
    trace(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler?: (arg0: Request, arg1: Response) => void): any;
    /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    connect(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler: (arg0: Request, arg1: Response) => void): any;
    /**
     * Intercepts and handles upgrade requests for incoming websocket connections.
     * Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
     *
     * @param {String} pattern
     * @param {RouteOptions|RouteHandler} options
     * @param {RouteHandler} handler
     */
    upgrade(pattern: string, options: {
        /**
         * Route specific middlewares
         */
        middlewares: ((arg0: Request, arg1: Response, arg2: Function) => void)[] | ((arg0: Request, arg1: Response) => Promise<any>)[];
        /**
         * Pre-parses and populates Request.body with specified body type.
         */
        expect_body: boolean;
    } | ((arg0: Request, arg1: Response) => void), handler: (arg0: Request, arg1: Response) => void): any;
    /**
     * @typedef {Object} WSRouteOptions
     * @property {('String'|'Buffer'|'ArrayBuffer')} message_type Specifies data type in which to provide incoming websocket messages. Default: 'String'
     * @property {Number} compression Specifies preset for permessage-deflate compression. Specify one from HyperExpress.compressors.PRESET
     * @property {Number} idle_timeout Specifies interval to automatically timeout/close idle websocket connection in seconds. Default: 32
     * @property {Number} max_backpressure Specifies maximum websocket backpressure allowed in character length. Default: 1024 * 1024
     * @property {Number} max_payload_length Specifies maximum length allowed on incoming messages. Default: 32 * 1024
     */
    /**
     * @typedef WSRouteHandler
     * @type {function(Websocket):void}
     */
    /**
     * @param {String} pattern
     * @param {WSRouteOptions|WSRouteHandler} options
     * @param {WSRouteHandler} handler
     */
    ws(pattern: string, options: {
        /**
         * Specifies data type in which to provide incoming websocket messages. Default: 'String'
         */
        message_type: ('String' | 'Buffer' | 'ArrayBuffer');
        /**
         * Specifies preset for permessage-deflate compression. Specify one from HyperExpress.compressors.PRESET
         */
        compression: number;
        /**
         * Specifies interval to automatically timeout/close idle websocket connection in seconds. Default: 32
         */
        idle_timeout: number;
        /**
         * Specifies maximum websocket backpressure allowed in character length. Default: 1024 * 1024
         */
        max_backpressure: number;
        /**
         * Specifies maximum length allowed on incoming messages. Default: 32 * 1024
         */
        max_payload_length: number;
    } | ((arg0: Websocket) => void), handler: (arg0: Websocket) => void): any;
    /**
     * Returns All routes in this router.
     * @returns {Object}
     */
    get routes(): any;
    /**
     * Returns all middlewares in this router.
     */
    get middlewares(): any[];
    #private;
}
import Request = require("../http/Request.js");
import Response = require("../http/Response.js");
import http = require("http");
import Websocket = require("../ws/Websocket.js");
