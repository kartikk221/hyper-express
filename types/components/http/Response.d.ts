import * as Stream from 'stream';
import * as uWebsockets from 'uWebSockets.js';
import LiveFile from '../plugins/LiveFile';
import SSEventStream from '../plugins/SSEventStream';
import { UserRouteHandler } from '../router/Router';
import Server from '../Server';

type SendableData = string | Buffer | ArrayBuffer;
type FileCachePool = {
    [key: string]: LiveFile
};

interface CookieOptions {
    domain?: string,
    path?: string,
    maxAge?: number,
    secure?: boolean,
    httpOnly?: boolean,
    sameSite?: boolean | 'none' | 'lax' | 'strict'
    secret?: string
}

export default class Response {
    /* HyperExpress Response Methods */

    /**
     * This method can be used to improve Network IO performance by executing
     * all network operations in a singular atomic structure.
     *
     * @param {Function} handler
     */
    atomic(handler: () => void): void;

    /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @returns {Response} Response (Chainable)
     */
    status(code: number): Response;

    /**
     * This method is used to set the response content type header
     * based on the provided mime type. Example: type('json')
     *
     * @param {String} mime_type Mime type
     * @returns {Response} Response (Chainable)
     */
    type(mime_type: string): Response;

    /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|Array} value Header Value(s)
     * @returns {Response} Response (Chainable)
     */
    header(name: string, value: string | Array<string>): Response;

    /**
     * This method is used to write a cookie to incoming request.
     * Note! This method utilized .header() therefore it must be called
     * after setting a custom status code.
     *
     * @param {String} name Cookie Name
     * @param {String} value Cookie Value
     * @param {Number} expiry In milliseconds
     * @param {Object} options Cookie Options
     * @param {Boolean} sign_cookie Enables/Disables Cookie Signing
     * @returns {Response} Response (Chainable)
     */
    cookie(name: string, value: string, expiry?: number, options?: CookieOptions, sign_cookie?: boolean): Response;

    /**
     * This method is used to delete cookies on sender's browser.
     * An appropriate set-cookie header is written with maxAge as 0.
     *
     * @param {String} name Cookie Name
     * @returns {Response} Response
     */
    delete_cookie(name: string): Response;

    /**
     * Binds a hook (synchronous callback) that gets executed based on specified type.
     * See documentation for supported hook types.
     *
     * @param {String} type
     * @param {function(Request, Response):void} handler
     * @returns {Response} Chainable
     */
    hook(type: string, handler: UserRouteHandler): Response;

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     *
     * @param {Object} context Store information about the websocket connection
     */
    upgrade(context?: Object): void;

    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     *
     * @param {Function} handler Synchronous callback only
     */
    drain(handler: () => void): void;

    /**
     * This method can be used to write the body in chunks.
     * Note! You must still call the send() method to send the response and complete the request.
     *
     * @param {String|Buffer|ArrayBuffer} chunk
     * @param {String=} encoding
     * @param {Function=} callback
     * @returns {Boolean} 'false' signifies that the chunk was not sent due to built up backpressure.
     */
    write(chunk: SendableData, encoding?: string, callback?: () => void): boolean;

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer} body Optional
     * @returns {Boolean} 'false' signifies that the result was not sent due to built up backpressure.
     */
    send(body: SendableData, close_connection?: boolean): Response;

    /**
     * This method is used to pipe a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {stream.Readable} readable A Readable stream which will be piped as response body
     * @param {Number=} total_size Total size of the Readable stream source in bytes (Optional)
     */
    stream(readable: Stream.Readable, total_size?: number): void;

    /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this only in extreme situations to abort a request where a proper response is not neccessary.
     */
    close(): void;

    /**
     * This method is used to redirect an incoming request to a different url.
     *
     * @param {String} url Redirect URL
     * @returns {Boolean}
     */
    redirect(url: string): boolean;

    /**
     * This method is an alias of send() method except it accepts an object and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Boolean} Boolean
     */
    json(body: any): boolean;

    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object with a callback name.
     * Note! This method uses 'callback' query parameter by default but you can specify 'name' to use something else.
     *
     * @param {Object} body
     * @param {String=} name
     * @returns {Boolean} Boolean
     */
    jsonp(body: any, name?: string): boolean;

    /**
     * This method is an alias of send() method except it automatically sets
     * html as the response content type and sends provided html response body.
     *
     * @param {String} body
     * @returns {Boolean} Boolean
     */
    html(body: string): boolean;

    /**
     * This method is an alias of send() method except it sends the file at specified path.
     * This method automatically writes the appropriate content-type header if one has not been specified yet.
     * This method also maintains its own cache pool in memory allowing for fast performance.
     * Avoid using this method to a send a large file as it will be kept in memory.
     *
     * @param {String} path
     * @param {function(Object):void=} callback Executed after file has been served with the parameter being the cache pool.
     */
    file(path: string, callback?: (pool: FileCachePool) => void): void;

    /**
     * Writes approriate headers to signify that file at path has been attached.
     *
     * @param {String} path
     * @param {String=} name
     * @returns {Response} Chainable
     */
    attachment(path: string, name?: string): Response;

    /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String=} filename
     */
    download(path: string, filename?: string): void;

    /**
     * This method allows you to throw an error which will be caught by the global error handler.
     *
     * @param {Error} error Error Class
     */
    throw_error(error: Error): void;

    /* HyperExpress Response Properties */

    /**
    * Returns the underlying raw uWS.Response object.
    * @returns {uWebsockets.Response}
    */
    get raw(): uWebsockets.HttpResponse;

    /**
     * Returns the HyperExpress.Server instance this Response object originated from.
     *
     * @returns {Server}
     */
    get app(): Server;

    /**
     * Returns whether response has been initiated by writing the HTTP status code and headers.
     * Note! No changes can be made to the HTTP status code or headers after a response has been initiated.
     * @returns {Boolean}
     */
    get initiated(): boolean;

    /**
     * Returns current state of request in regards to whether the source is still connected.
     * @returns {Boolean}
     */
    get aborted(): boolean;

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     * @returns {Boolean}
     */
    get completed(): boolean;

    /**
     * Upgrade socket context for upgrade requests.
     * @returns {uWebsockets.ux_socket_context}
     */
    get upgrade_socket(): uWebsockets.us_socket_context_t;


    /**
     * Returns a "Server-Sent Events" connection object to allow for SSE functionality.
     * This property will only be available for GET requests as per the SSE specification.
     *
     * @returns {SSEventStream=}
     */
    get sse(): SSEventStream;

    /**
     * Returns a Writable stream associated with this response to be used for piping streams.
     * @returns {Writable}
     */
    get writable(): Stream.Writable;

    /* ExpressJS Compatibility Methods & Properties */
    get headersSent(): boolean;
    get statusCode(): number | undefined
    locals: Object;
    append(name: string, values: string | Array<string>): Response;
    writeHead(name: string, values: string | Array<string>): Response;
    setHeader(name: string, values: string | Array<string>): Response;
    writeHeaders(headers: Object): void;
    setHeaders(headers: Object): void;
    writeHeaderValues(name: string, values: Array<string>): void;
    getHeader(name: string): string | Array<string> | void;
    removeHeader(name: string): void;
    setCookie(name: string, value: string, options?: CookieOptions): Response;
    hasCookie(name: string): Boolean;
    removeCookie(name: string): Response;
    clearCookie(name: string): Response;
    end(data: SendableData): void;
    get(name: string): string | Array<string>;
    links(links: Object): string;
    location(path: string): Response;
    sendFile(path: string): void;
    sendStatus(status_code: number): Response;
    set(field: string | object, value?: string | Array<string>): Response | void;
    vary(name: string): Response;
    on(event: string, callback: Function): void;
    once(event: string, callback: Function): void;
}