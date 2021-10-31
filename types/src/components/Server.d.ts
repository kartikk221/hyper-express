export = Server;
declare class Server extends Router {
    /**
     * @param {Object} options Server Options
     * @param {String} options.cert_file_name Path to SSL certificate file.
     * @param {String} options.key_file_name Path to SSL private key file to be used for SSL/TLS.
     * @param {String} options.passphrase Strong passphrase for SSL cryptographic purposes.
     * @param {String} options.dh_params_file_name Path to SSL Diffie-Hellman parameters file.
     * @param {Boolean} options.ssl_prefer_low_memory_usage Specifies uWebsockets to prefer lower memory usage while serving SSL
     * @param {Boolean} options.fast_buffers Buffer.allocUnsafe is used when set to true for faster performance.
     * @param {Boolean} options.fast_abort Determines whether HyperExpress will abrubptly close bad requests. This can be much faster but the client does not receive an HTTP status code as it is a premature connection closure.
     * @param {Boolean} options.trust_proxy Specifies whether to trust incoming request data from intermediate proxy(s)
     * @param {Number} options.max_body_length Maximum body content length allowed in bytes. For Reference: 1kb = 1000 bytes and 1mb = 1000kb.
     */
    constructor(options?: {
        cert_file_name: string;
        key_file_name: string;
        passphrase: string;
        dh_params_file_name: string;
        ssl_prefer_low_memory_usage: boolean;
        fast_buffers: boolean;
        fast_abort: boolean;
        trust_proxy: boolean;
        max_body_length: number;
    });
    /**
     * @private
     * This method binds a cleanup handler which closes the uWS server based on listen socket.
     */
    private _bind_exit_handler;
    /**
     * Starts HyperExpress webserver on specified port and host.
     *
     * @param {Number} port
     * @param {String=} host Optional. Default: 0.0.0.0
     * @returns {Promise} Promise
     */
    listen(port: number, host?: string | undefined): Promise<any>;
    /**
     * Stops/Closes HyperExpress webserver instance.
     *
     * @param {socket=} listen_socket Optional
     * @returns {Boolean}
     */
    close(listen_socket?: any): boolean;
    /**
     * @typedef RouteErrorHandler
     * @type {function(Request, Response, Error):void}
     */
    /**
     * Sets a global error handler which will catch most uncaught errors across all routes/middlewares.
     *
     * @param {RouteErrorHandler} handler
     */
    set_error_handler(handler: (arg0: Request, arg1: Response, arg2: Error) => void): void;
    /**
     * @typedef RouteHandler
     * @type {function(Request, Response):void}
     */
    /**
     * Sets a global not found handler which will handle all requests that are unhandled by any registered route.
     * Note! This handler must be registered after all routes and routers.
     *
     * @param {RouteHandler} handler
     */
    set_not_found_handler(handler: (arg0: Request, arg1: Response) => void): NodeJS.Timeout;
    /**
     * Binds route to uWS server instance and begins handling incoming requests.
     *
     * @private
     * @param {Array} record { method, pattern, options, handler }
     */
    private _create_route;
    /**
     * Binds middleware to server instance and distributes over all created routes.
     *
     * @private
     * @param {Object} record
     */
    private _create_middleware;
    /**
     * This method is used to determine if request body should be pre-parsed in anticipation for future call.
     *
     * @private
     * @param {Route} route
     * @param {Request} wrapped_request
     * @returns {Boolean} Boolean
     */
    private _pre_parse_body;
    /**
     * This method is used to handle incoming uWebsockets response/request objects
     * by wrapping/translating them into HyperExpress compatible request/response objects.
     *
     * @private
     * @param {Route} route
     * @param {Request} request
     * @param {Response} response
     * @param {UWS_SOCKET} socket
     */
    private _handle_uws_request;
    /**
     * This method chains a request/response through all middlewares and then calls route handler in end.
     *
     * @private
     * @param {Route} route - Route Object
     * @param {Request} request - Request Object
     * @param {Response} response - Response Object
     * @param {Error} error - Error or Extended Error Object
     */
    private _chain_middlewares;
    /**
     * Underlying uWS instance.
     */
    get uws_instance(): uWebSockets.TemplatedApp;
    /**
     * Server instance global handlers.
     */
    get handlers(): {
        on_not_found: any;
        on_error: (request: any, response: any, error: any) => never;
    };
    #private;
}
import Router = require("./router/Router.js");
import Request = require("./http/Request.js");
import Response = require("./http/Response.js");
import uWebSockets = require("uWebSockets.js");
