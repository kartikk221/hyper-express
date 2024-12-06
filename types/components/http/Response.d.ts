import { Readable, Writable } from 'stream';
import * as uWebsockets from 'uWebSockets.js';
import { LiveFile } from '../plugins/LiveFile';
import { Server } from '../Server';
import { SSEventStream } from '../plugins/SSEventStream';

export type SendableData = string | Buffer | ArrayBuffer;
export type FileCachePool = {
    [key: string]: LiveFile;
};

export interface CookieOptions {
    domain?: string;
    path?: string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: boolean | 'none' | 'lax' | 'strict';
    secret?: string;
}

type DefaultResponseLocals = {
    [key: string]: any;
};

export class Response<ResponseOptions extends { Locals ? : DefaultResponseLocals, Response? : any} = {Locals : DefaultResponseLocals}> extends Writable {
    /**
     * Underlying raw lazy initialized writable stream.
     */
    _writable: null | Writable;

    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     */
    completed: boolean;

    /* HyperExpress Methods */

    /**
     * Alias of `uWS.HttpResponse.cork()` which allows for manual corking of the response.
     * This is required by `uWebsockets.js` to maximize network performance with batched writes.
     *
     * @param {Function} handler
     * @returns {Response} Response (Chainable)
     */
    atomic(handler: () => void): Response<ResponseOptions>;

    /**
     * This method is used to set a custom response code.
     *
     * @param {Number} code Example: response.status(403)
     * @param {String=} message Example: response.status(403, 'Forbidden')
     * @returns {Response} Response (Chainable)
     */
    status(code: number, message?: string): Response<ResponseOptions>;

    /**
     * This method is used to set the response content type header
     * based on the provided mime type. Example: type('json')
     *
     * @param {String} mime_type Mime type
     * @returns {Response} Response (Chainable)
     */
    type(mime_type: string): Response<ResponseOptions>;

    /**
     * This method can be used to write a response header and supports chaining.
     *
     * @param {String} name Header Name
     * @param {String|Array<String>} value Header Value
     * @param {Boolean=} overwrite If true, overwrites existing header value with same name
     * @returns {Response} Response (Chainable)
     */
    header(name: string, value: string | Array<string>, overwrite?: boolean): Response<ResponseOptions>;

    /**
     * This method is used to write a cookie to incoming request.
     * To delete a cookie, set the value to null.
     *
     * @param {String} name Cookie Name
     * @param {String|null} value Cookie Value
     * @param {Number=} expiry In milliseconds
     * @param {CookieOptions=} options Cookie Options
     * @param {Boolean=} sign_cookie Enables/Disables Cookie Signing
     * @returns {Response} Response (Chainable)
     */
    cookie(
        name: string,
        value: string | null,
        expiry?: number,
        options?: CookieOptions,
        sign_cookie?: boolean
    ): Response<ResponseOptions>;

    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     * @param {Object=} context Store information about the websocket connection
     */
    upgrade(context?: Object): void;

    /**
     * Binds a drain handler which gets called with a byte offset that can be used to try a failed chunk write.
     * You MUST perform a write call inside the handler for uWS chunking to work properly.
     * You MUST return a boolean value indicating if the write was successful or not.
     *
     * @param {function(number):boolean} handler Synchronous callback only
     */
    drain(handler: (offset: number) => boolean): void;

    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer} body Optional
     * @returns {Boolean} 'false' signifies that the result was not sent due to built up backpressure.
     */
    send(body?: SendableData, close_connection?: boolean): Response<ResponseOptions>;

    /**
     * This method is used to pipe a readable stream as response body and send response.
     * By default, this method will use chunked encoding transfer to stream data.
     * If your use-case requires a content-length header, you must specify the total payload size.
     *
     * @param {Readable} readable A Readable stream which will be piped as response body
     * @param {Number=} total_size Total size of the Readable stream source in bytes (Optional)
     */
    stream(readable: Readable, total_size?: number): Promise<void>;

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
    json(body: ResponseOptions['Response'] extends undefined ? any : ResponseOptions['Response']): boolean;

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
    attachment(path: string, name?: string): Response<ResponseOptions>;

    /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String=} filename
     */
    download(path: string, filename?: string): void;

    /**
     * This method allows you to throw an error which will be caught by the global error handler (If one was setup with the Server instance).
     *
     * @param {Error} error
     */
    throw(error: Error): Response<ResponseOptions>;

    /* HyperExpress Properties */

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
     * Returns the current response body content write offset in bytes.
     * Use in conjunction with the drain() offset handler to retry writing failed chunks.
     * @returns {Number}
     */
    get write_offset(): number;

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
    get sse(): SSEventStream | undefined

    /* ExpressJS Methods */
    append(name: string, values: string | Array<string>): Response<ResponseOptions>;
    writeHead(name: string, values: string | Array<string>): Response<ResponseOptions>;
    setHeader(name: string, values: string | Array<string>): Response<ResponseOptions>;
    writeHeaders(headers: Object): void;
    setHeaders(headers: Object): void;
    writeHeaderValues(name: string, values: Array<string>): void;
    getHeader(name: string): string | Array<string> | void;
    getHeaders(): { [key: string]: Array<string> };
    removeHeader(name: string): void;
    setCookie(name: string, value: string, options?: CookieOptions): Response<ResponseOptions>;
    hasCookie(name: string): Boolean;
    removeCookie(name: string): Response<ResponseOptions>;
    clearCookie(name: string): Response<ResponseOptions>;
    get(name: string): string | Array<string>;
    links(links: Object): string;
    location(path: string): Response<ResponseOptions>;
    sendFile(path: string): void;
    sendStatus(status_code: number): Response<ResponseOptions>;
    set(field: string | object, value?: string | Array<string>): Response<ResponseOptions> | void;
    vary(name: string): Response<ResponseOptions>;

    /* ExpressJS Properties */
    get headersSent(): boolean;
    get statusCode(): number | undefined;
    set statusCode(value: number | undefined);
    get statusMessage(): string | undefined;
    set statusMessage(value: string | undefined);
    locals: ResponseOptions['Locals'] extends undefined ? any : ResponseOptions['Locals']
}
