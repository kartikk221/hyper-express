import { BusboyConfig } from 'busboy';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { Options, Ranges, Result } from 'range-parser';
import { Readable } from 'stream';
import * as uWebsockets from 'uWebSockets.js';
import { MultipartHandler, MultipartLimitReject } from '../plugins/MultipartField';
import { Server } from '../Server';

type default_value = any;

export class Request {
    /* HyperExpress Request Methods */

    /**
     * Pauses the current request and any incoming body chunks.
     * @returns {Request}
     */
    pause(): Request;

    /**
     * Resumes the current request and consumption of any remaining body chunks.
     * @returns {Request}
     */
    resume(): Request;

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
     * @returns {String} String OR undefined
     */
    unsign(signed_value: string, secret: string): string | void;

    /**
     * Asynchronously downloads and returns request body as a Buffer.
     *
     * @returns {Promise} Promise
     */
    buffer(): Promise<Buffer>;

    /**
     * Asynchronously parses and returns request body as a String.
     *
     * @returns {Promise} Promise
     */
    text(): Promise<string>;

    /**
     * Parses and resolves an Object of json values from body.
     * Passing default_value as undefined will lead to the function throwing an exception
     * if JSON parsing fails.
     *
     * @param {Any} default_value Default: {}
     * @returns {Promise} Promise
     */
    json<T = any, D = any>(default_value?: D): Promise<T | D>;

    /**
     * Parses and resolves an Object of urlencoded values from body.
     *
     * @returns {Promise} Promise
     */
    urlencoded<T = any>(): Promise<T>;

    /**
     * Parses incoming multipart form and allows for easy consumption of fields/values including files.
     *
     * @param {MultipartHandler} handler
     * @returns {Promise<void|String|Error>} A promise which is resolved once all multipart fields have been processed
     */
    multipart(handler: MultipartHandler): Promise<MultipartLimitReject | Error>;

    /**
     * Parses incoming multipart form and allows for easy consumption of fields/values including files.
     *
     * @param {BusboyConfig|MultipartHandler} options
     * @param {MultipartHandler} handler
     * @returns {Promise<void|MultipartLimitReject|Error>} A promise which is resolved once all multipart fields have been processed
     */
    multipart(options: BusboyConfig, handler: MultipartHandler): Promise<MultipartLimitReject | Error>;

    /* HyperExpress Request Properties */

    /**
     * Returns underlying uWS.Request reference.
     * Note! Utilizing any of uWS.Request's methods after initial synchronous call will throw a forbidden access error.
     */
    get raw(): uWebsockets.HttpRequest;

    /**
     * Returns the HyperExpress.Server instance this Request object originated from.
     *
     * @returns {Server}
     */
    get app(): Server;

    /**
     * Returns the underlying readable incoming body data stream for this request.
     *
     * @returns {Readable|void}
     */
    get stream(): Readable | void;

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
     * @returns {Record<string, string>}
     */
    get headers(): Record<string, string>;

    /**
     * Returns cookies from incoming request.
     * @returns {Record<string, unknown>}
     */
    get cookies(): Record<string, unknown>;

    /**
     * Returns path parameters from incoming request in Object form {key: value}
     * @returns {Record<string, string>}
     */
    get path_parameters(): Record<string, string>;

    /**
     * Returns query parameters from incoming request in Object form {key: value}
     * @returns {Record<string, string>}
     */
    get query_parameters(): Record<string, string>;

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

    /* ExpressJS Compatibility Properties & Methods */
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