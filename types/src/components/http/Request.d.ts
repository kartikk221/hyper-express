export = Request;
declare class Request {
    constructor(raw_request: any, raw_response: any, path_parameters_key: any, master_context: any);
    /**
     * @private
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method parses initial data from uWS.Request and uWS.Response to prevent forbidden
     * stack memory access errors for asynchronous usage
     */
    private _request_information;
    /**
     * This method parses path parameters from incoming request using a parameter key
     * @private
     * @param {Array} parameters_key [[key, index], ...]
     */
    private _path_parameters;
    /**
     * Securely signs a value with provided secret and returns the signed value.
     *
     * @param {String} string
     * @param {String} secret
     * @returns {String} String OR undefined
     */
    sign(string: string, secret: string): string;
    /**
     * Securely unsigns a value with provided secret and returns its original value upon successful verification.
     *
     * @param {String} signed_value
     * @param {String} secret
     * @returns {String} String OR undefined
     */
    unsign(signed_value: string, secret: string): string;
    /**
     * Initiates body buffer download process.
     *
     * @private
     * @param {Number} content_length
     * @returns {Promise}
     */
    private _download_buffer;
    /**
     * @private
     * Aborts pending body buffer downloads if request is prematurely aborted.
     */
    private _abort_buffer;
    /**
     * Asynchronously downloads and returns request body as a Buffer.
     *
     * @returns {Promise} Promise
     */
    buffer(): Promise<any>;
    /**
     * Asynchronously parses and returns request body as a String.
     *
     * @returns {Promise} Promise
     */
    text(): Promise<any>;
    /**
     * @private
     * Parses JSON from provided string. Resolves default_value or throws exception on failure.
     *
     * @param {String} string
     * @param {Any} default_value
     * @returns {Any}
     */
    private _parse_json;
    /**
     * Parses and resolves an Object of json values from body.
     * Passing default_value as undefined will lead to the function throwing an exception
     * if JSON parsing fails.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise} Promise(String: body)
     */
    json(default_value?: any): Promise<any>;
    /**
     * Parses and resolves an Object of urlencoded values from body.
     *
     * @returns {Promise} Promise(Object: body)
     */
    urlencoded(): Promise<any>;
    /**
     * Returns underlying uWS.Request reference.
     * Note! Utilizing any of uWS.Request's methods after initial synchronous call will throw a forbidden access error.
     */
    get raw(): any;
    /**
     * Returns HTTP request method for incoming request in all uppercase.
     */
    get method(): any;
    /**
     * Set the full request url for incoming request (path + query).
     */
    set url(arg: any);
    /**
     * Returns full request url for incoming request (path + query).
     */
    get url(): any;
    /**
     * Set the path for incoming request.
     */
    set path(arg: any);
    /**
     * Returns path for incoming request.
     */
    get path(): any;
    /**
     * Returns query for incoming request without the '?'.
     */
    get path_query(): any;
    /**
     * Set the request headers from incoming request.
     */
    set headers(arg: any);
    /**
     * Returns request headers from incoming request.
     */
    get headers(): any;
    /**
     * Returns cookies from incoming request.
     */
    get cookies(): any;
    /**
     * Set the path parameters from incoming request in Object form {key: value}
     */
    set path_parameters(arg: any);
    /**
     * Returns path parameters from incoming request in Object form {key: value}
     */
    get path_parameters(): any;
    /**
     * Returns query parameters from incoming request in Object form {key: value}
     */
    get query_parameters(): any;
    /**
     * Returns remote IP address in string format from incoming request.
     */
    get ip(): any;
    /**
     * Returns remote proxy IP address in string format from incoming request.
     */
    get proxy_ip(): any;
    /**
     * ExpressJS: Returns header for specified name.
     * @param {String} name
     * @returns {String|undefined}
     */
    get(name: string): string | undefined;
    /**
     * ExpressJS: Alias of .get(name) method.
     * @param {String} name
     * @returns {String|undefined}
     */
    header(name: string): string | undefined;
    /**
     * ExpressJS: Checks if provided types are accepted.
     * @param {String|Array} types
     * @returns {String|Array|Boolean}
     */
    accepts(...args: any[]): string | any[] | boolean;
    /**
     * ExpressJS: Checks if provided encodings are accepted.
     * @param {String|Array} encodings
     * @returns {String|Array}
     */
    acceptsEncodings(...args: any[]): string | any[];
    /**
     * ExpressJS: Checks if provided charsets are accepted
     * @param {String|Array} charsets
     * @returns {String|Array}
     */
    acceptsCharsets(...args: any[]): string | any[];
    /**
     * ExpressJS: Checks if provided languages are accepted
     * @param {String|Array} charsets
     * @returns {String|Array}
     */
    acceptsLanguages(...args: any[]): string | any[];
    /**
     * ExpressJS: Parse Range header field, capping to the given `size`.
     * @param {Number} size
     * @param {Object} options
     * @param {Boolean} options.combine Default: false
     * @returns {Number|Array}
     */
    range(size: number, options: {
        combine: boolean;
    }): number | any[];
    /**
     * ExpressJS: Return the value of param `name` when present or `defaultValue`.
     * @param {String} name
     * @param {Any} default_value
     * @returns {String}
     */
    param(name: string, default_value: any): string;
    /**
     * ExpressJS: Check if the incoming request contains the "Content-Type" header field, and it contains the give mime `type`.
     * @param {String|Array} types
     * @returns {String|false|null}
     */
    is(types: string | any[], ...args: any[]): string | false | null;
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
     * Returns expected body from route options
     */
    get body(): any;
    /**
     * ExpressJS: Alias of HyperExpress.Request.path
     */
    set baseUrl(arg: any);
    /**
     * ExpressJS: Alias of HyperExpress.Request.path
     */
    get baseUrl(): any;
    /**
     * ExpressJS: Alias of HyperExpress.Request.url
     */
    set originalUrl(arg: any);
    /**
     * ExpressJS: Alias of HyperExpress.Request.url
     */
    get originalUrl(): any;
    /**
     * ExpressJS: Alias of HyperExpress.Request.path_parameters
     */
    set params(arg: any);
    /**
     * ExpressJS: Alias of HyperExpress.Request.path_parameters
     */
    get params(): any;
    /**
     * ExpressJS: Returns query parameters
     */
    set query(arg: any);
    /**
     * ExpressJS: Returns query parameters
     */
    get query(): any;
    /**
     * Unsupported property
     */
    get route(): void;
    /**
     * ExpressJS: Returns the current protocol
     * @returns {('https'|'http')}
     */
    get protocol(): "http" | "https";
    /**
     * ExpressJS: Returns true when request is on https protocol
     * @returns {Boolean}
     */
    get secure(): boolean;
    /**
     * ExpressJS: When "trust proxy" is set, trusted proxy addresses + client.
     * @returns {Array}
     */
    get ips(): any[];
    /**
     * ExpressJS: Parse the "Host" header field to a hostname.
     */
    get hostname(): string;
    /**
     * ExpressJS: Return subdomains as an array.
     * @returns {Array}
     */
    get subdomains(): any[];
    /**
     * Unsupported Property
     */
    get fresh(): void;
    /**
     * Unsupported Property
     */
    get stale(): void;
    /**
     * ExpressJS: Check if the request was an _XMLHttpRequest_.
     * @returns {Boolean}
     */
    get xhr(): boolean;
    #private;
}
