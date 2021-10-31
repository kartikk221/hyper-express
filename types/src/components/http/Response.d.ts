export = Response;
declare class Response {
    constructor(wrapped_request: any, raw_response: any, socket: any, master_context: any);
    /**
     * @private
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method binds an abort handler which will update completed field to lock appropriate operations in Response
     */
    private _bind_abort_handler;
    /**
     * Tracks middleware cursor position over a request's lifetime.
     * This is so we can detect any double middleware iterations and throw an error.
     * @private
     * @param {Number} position - Cursor position
     */
    private _track_middleware_cursor;
    /**
     * This method can be used to improve Network IO performance by executing
     * all network operations in a singular atomic structure.
     *
     * @param {Function} handler
     */
    atomic(handler: Function): any;
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
     * @param {String|Array} value Header Value
     * @returns {Response} Response (Chainable)
     */
    header(name: string, value: string | any[]): Response;
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
    cookie(name: string, value: string, expiry: number, options?: any, sign_cookie?: boolean): Response;
    /**
     * This method is used to delete cookies on sender's browser.
     * An appropriate set-cookie header is written with maxAge as 0.
     *
     * @param {String} name Cookie Name
     * @returns {Response} Response
     */
    delete_cookie(name: string): Response;
    /**
     * @private
     * Executes all registered hooks (callbacks) for specified type.
     *
     * @param {String} type
     */
    private _call_hooks;
    /**
     * Binds a hook (synchronous callback) that gets executed based on specified type.
     * See documentation for supported hook types.
     *
     * @param {String} type
     * @param {function(Request, Response):void} handler
     * @returns {Response} Chainable
     */
    hook(type: string, handler: (arg0: Request, arg1: Response) => void): Response;
    /**
     * This method is used to upgrade an incoming upgrade HTTP request to a Websocket connection.
     *
     * @param {Object} context Store information about the websocket connection
     */
    upgrade(context: any): void;
    /**
     * This method can be used to write the body in chunks/parts and .send()
     * must be called to end the request.
     *
     * @param {String|Buffer|ArrayBuffer} body
     * @returns {Response} Response (Chainable)
     */
    write(body: string | Buffer | ArrayBuffer): Response;
    /**
     * This method is used to end the current request and send response with specified body and headers.
     *
     * @param {String|Buffer|ArrayBuffer} body Optional
     * @returns {Boolean} 'false' signifies that the result was not sent due to built up backpressure.
     */
    send(body: string | Buffer | ArrayBuffer, close_connection: any): boolean;
    /**
     * Instantly aborts/closes current request without writing a status response code.
     * Use this only in extreme situations to abort a request where a proper response is not neccessary.
     */
    close(): void;
    /**
     * This method is used to redirect an incoming request to a different url.
     *
     * @param {String} url Redirect URL
     * @returns {Boolean} Boolean (true || false)
     */
    redirect(url: string): boolean;
    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object.
     *
     * @param {Object} body JSON body
     * @returns {Boolean} Boolean (true || false)
     */
    json(body: any): boolean;
    /**
     * This method is an alias of send() method except it accepts an object
     * and automatically stringifies the passed payload object with a callback name.
     * Note! This method uses 'callback' query parameter by default but you can specify 'name' to use something else.
     *
     * @param {Object} body
     * @param {String} name
     * @returns {Boolean} Boolean (true || false)
     */
    jsonp(body: any, name: string): boolean;
    /**
     * This method is an alias of send() method except it automatically sets
     * html as the response content type and sends provided html response body.
     *
     * @param {String} body
     * @returns {Boolean} Boolean (true || false)
     */
    html(body: string): boolean;
    /**
     * @private
     * Sends file content with appropriate content-type header based on file extension from LiveFile.
     *
     * @param {LiveFile} live_file
     * @param {function(Object):void} callback
     */
    private _send_file;
    /**
     * This method is an alias of send() method except it sends the file at specified path.
     * This method automatically writes the appropriate content-type header if one has not been specified yet.
     * This method also maintains its own cache pool in memory allowing for fast performance.
     * Avoid using this method to a send a large file as it will be kept in memory.
     *
     * @param {String} path
     * @param {function(Object):void} callback Executed after file has been served with the parameter being the cache pool.
     */
    file(path: string, callback: (arg0: any) => void): Promise<void>;
    /**
     * Writes approriate headers to signify that file at path has been attached.
     *
     * @param {String} path
     * @returns {Response}
     */
    attachment(path: string, name: any): Response;
    /**
     * Writes appropriate attachment headers and sends file content for download on user browser.
     * This method combined Response.attachment() and Response.file() under the hood, so be sure to follow the same guidelines for usage.
     *
     * @param {String} path
     * @param {String} filename
     */
    download(path: string, filename: string): Promise<void>;
    /**
     * This method allows you to throw an error which will be caught by the global error handler.
     *
     * @param {Error} error Error Class
     */
    throw_error(error: Error): void;
    /**
     * Returns the underlying raw uWS.Response object.
     */
    get raw(): any;
    /**
     * Returns current state of request in regards to whether the source is still connected.
     */
    get aborted(): boolean;
    /**
     * Alias of aborted property as they both represent the same request state in terms of inaccessibility.
     */
    get completed(): boolean;
    /**
     * Upgrade socket context for upgrade requests.
     */
    get upgrade_socket(): any;
    /**
     * Throws a descriptive error when an unsupported ExpressJS property/method is invocated.
     * @private
     * @param {String} name
     */
    private _throw_unsupported;
    /**
     * Unsupported property
     */
    get app(): void;
    /**
     * ExpressJS: Alias of Response.completed
     */
    get headersSent(): boolean;
    locals: {};
    /**
     * ExpressJS: Alias of header() method
     * @param {String} name
     * @param {String|Array} values
     */
    append(name: string, values: string | any[]): Response;
    /**
     * ExpressJS: Alias of Response.append()
     */
    writeHead(name: any, values: any): Response;
    /**
     * ExpressJS: Alias of Response.append()
     */
    setHeader(name: any, values: any): Response;
    /**
     * ExpressJS: Alias of Response.writeHeaders
     * @param {Object} headers
     */
    setHeaders(headers: any): void;
    /**
     * ExpressJS: Writes multiple headers in form of an object
     * @param {Object} headers
     */
    writeHeaders(headers: any): void;
    /**
     * ExpressJS: Writes multiple header values for a single name
     * @param {String} name
     * @param {Array} values
     */
    writeHeaderValues(name: string, values: any[]): void;
    /**
     * ExpressJS: Returns pending header from this response
     * @param {String} name
     * @returns {String|Array|undefined}
     */
    getHeader(name: string): string | any[] | undefined;
    /**
     * ExpressJS: Removes header from this response
     * @param {String} name
     */
    removeHeader(name: string): void;
    /**
     * ExpressJS: Alias of Response.cookie()
     * @param {String} name
     * @param {String} value
     * @param {Object} options
     */
    setCookie(name: string, value: string, options: any): Response;
    /**
     * ExpressJS: checks if a cookie exists
     * @param {String} name
     * @returns {Boolean}
     */
    hasCookie(name: string): boolean;
    /**
     * ExpressJS: Alias of Response.delete_cookie()
     * @param {String} name
     */
    removeCookie(name: string): Response;
    /**
     * ExpressJS: Alias of Response.delete_cookie() method.
     * @param {String} name
     */
    clearCookie(name: string): Response;
    /**
     * ExpressJS: Alias of Response.send()
     */
    end(data: any): boolean;
    /**
     * Unsupported method
     */
    format(): void;
    /**
     * ExpressJS: Returns the HTTP response header specified by field. The match is case-insensitive.
     * @param {String} name
     * @returns {String|Array}
     */
    get(name: string): string | any[];
    /**
     * ExpressJS: Joins the links provided as properties of the parameter to populate the response’s Link HTTP header field.
     * @param {Object} links
     */
    links(links: any): string;
    /**
     * ExpressJS: Sets the response Location HTTP header to the specified path parameter.
     * @param {String} path
     */
    location(path: string): Response;
    /**
     * Unsupported method
     */
    render(): void;
    /**
     * ExpressJS: Alias of Response.file()
     * @param {String} path
     */
    sendFile(path: string): Promise<void>;
    /**
     * ExpressJS: Alias of Response.status()
     * @param {Number} status_code
     */
    sendStatus(status_code: number): Response;
    /**
     * ExpressJS: Sets the response’s HTTP header field to value. To set multiple fields at once, pass an object as the parameter.
     * @param {Object} object
     */
    set(field: any, value: any): void;
    /**
     * ExpressJS: Adds the field to the Vary response header, if it is not there already.
     * @param {String} name
     */
    vary(name: string): Response;
    #private;
}
