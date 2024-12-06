import { Readable } from 'stream';
import { Server } from '../Server';
import { BusboyConfig } from 'busboy';
import { HttpRequest } from 'uWebSockets.js';
import { Options, Ranges, Result } from 'range-parser';
import { MultipartHandler } from '../plugins/MultipartField';

type default_value = any;

interface ParamsDictionary {
    [key: string]: string;
}

interface ParsedQs {
    [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}

type DefaultRequestLocals = {
    [key: string]: any;
};

export class Request<Locals = DefaultRequestLocals> extends Readable {
    /**
     * Underlying raw lazy initialized readable body stream.
     */
    _readable: null | Readable;

    /**
     * Returns whether all expected incoming request body chunks have been received.
     * @returns {Boolean}
     */
    received: boolean;

    /* HyperExpress Methods */

    /**
     * Returns the raw uWS.HttpRequest instance.
     * Note! This property is unsafe and should not be used unless you have no asynchronous code or you are accessing from the first top level synchronous middleware before any asynchronous code.
     * @returns {import('uWebSockets.js').HttpRequest}
     */
    get raw(): HttpRequest;

    /**
     * Securely signs a value with provided secret and returns the signed value.
     *
     * @param {String} string
     * @param {String} secret
     * @returns {String} String OR undefined
     */
    sign(string: string, secret: string): string | void;

    /**
     * Securely unsigns a value with provided secret and returns its original value upon successful verification.
     *
     * @param {String} signed_value
     * @param {String} secret
     * @returns {String=} String OR undefined
     */
    unsign(signed_value: string, secret: string): string | void;

    /**
     * Downloads and returns request body as a Buffer.
     * @returns {Promise<Buffer>}
     */
    buffer(): Promise<Buffer>;

    /**
     * Downloads and parses the request body as a String.
     * @returns {Promise<string>}
     */
    text(): Promise<string>;

    /**
     * Downloads and parses the request body as a JSON object.
     * Passing default_value as undefined will lead to the function throwing an exception if invalid JSON is received.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise}
     */
    json<T = any, D = any>(default_value?: D): Promise<T | D>;

    /**
     * Parses and resolves an Object of urlencoded values from body.
     * @returns {Promise}
     */
    urlencoded<T = any>(): Promise<T>;

    /**
     * Parses incoming multipart form and allows for easy consumption of fields/values including files.
     *
     * @param {MultipartHandler} handler
     * @returns {Promise} A promise which is resolved once all multipart fields have been processed
     */
    multipart(handler: MultipartHandler): Promise<void>;

    /**
     * Parses incoming multipart form and allows for easy consumption of fields/values including files.
     *
     * @param {BusboyConfig} options
     * @param {MultipartHandler} handler
     * @returns {Promise} A promise which is resolved once all multipart fields have been processed
     */
    multipart(options: BusboyConfig, handler: MultipartHandler): Promise<void>;

    /* HyperExpress Properties */

    /**
     * Returns the HyperExpress.Server instance this Request object originated from.
     * @returns {Server}
     */
    get app(): Server;

    /**
     * Returns whether this request is in a paused state and thus not consuming any body chunks.
     * @returns {Boolean}
     */
    get paused(): boolean;

    /**
     * Returns HTTP request method for incoming request in all uppercase.
     * @returns {String}
     */
    get method(): string;

    /**
     * Returns full request url for incoming request (path + query).
     * @returns {String}
     */
    get url(): string;

    /**
     * Allow to change request url.
     *
     * @benoitlahoz Only tested with `vite` middlewares used for SSR
     * that actually change the `originalUrl` of the request.
     *
     * @see https://github.com/kartikk221/hyper-express/issues/324
     */
    set url(url: string);

    /**
     * Returns path for incoming request.
     * @returns {String}
     */
    get path(): string;

    /**
     * Returns query for incoming request without the '?'.
     * @returns {String}
     */
    get path_query(): string;

    /**
     * Returns request headers from incoming request.
     * @returns {Object.<string, string>}
     */
    get headers(): { [key: string]: string };

    /**
     * Returns request cookies from incoming request.
     * @returns {Object.<string, string>}
     */
    get cookies(): { [key: string]: string };

    /**
     * Returns path parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get path_parameters(): { [key: string]: string };

    /**
     * Returns query parameters from incoming request.
     * @returns {Object.<string, string>}
     */
    get query_parameters(): { [key: string]: string };

    /**
     * Returns remote IP address in string format from incoming request.
     * @returns {String}
     */
    get ip(): string;

    /**
     * Returns remote proxy IP address in string format from incoming request.
     * @returns {String}
     */
    get proxy_ip(): string;

    /* ExpressJS Methods */
    get(name: 'set-cookie'): string[];
    get(name: string): string;
    header(name: 'set-cookie'): string[];
    header(name: string): string;
    accepts(): string[];
    accepts(type: string): string | false;
    accepts(type: string[]): string | false;
    accepts(...type: string[]): string | false;
    acceptsCharsets(): string[];
    acceptsCharsets(charset: string): string | false;
    acceptsCharsets(charset: string[]): string | false;
    acceptsCharsets(...charset: string[]): string | false;
    acceptsEncodings(): string[];
    acceptsEncodings(encoding: string): string | false;
    acceptsEncodings(encoding: string[]): string | false;
    acceptsEncodings(...encoding: string[]): string | false;
    acceptsLanguages(): string[];
    acceptsLanguages(lang: string): string | false;
    acceptsLanguages(lang: string[]): string | false;
    acceptsLanguages(...lang: string[]): string | false;
    range(size: number, options?: Options): Ranges | Result;
    param(name: string, defaultValue?: any): string;
    is(type: string | string[]): string | false;

    /* ExpressJS Properties */
    locals: Locals;
    protocol: string;
    secure: boolean;
    ips: string[];
    subdomains: string[];
    hostname: string;
    fresh: boolean;
    stale: boolean;
    xhr: boolean;
    body: any;
    params: ParamsDictionary;
    query: ParsedQs;
    originalUrl: string;
    baseUrl: string;
}
