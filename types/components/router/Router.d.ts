import { ReadableOptions } from 'stream';
import { DefaultRequestLocals, Request, RequestParams } from '../http/Request';
import { Response } from '../http/Response';
import { Websocket } from '../ws/Websocket';
import { MiddlewareHandler } from '../middleware/MiddlewareHandler';

// Define types for HTTP Route Creators
export type UserRouteHandler<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {Locals? : DefaultRequestLocals}> = (request: Request<RequestOptions>, response: Response) => any;
export interface UserRouteOptions {
    middlewares?: Array<MiddlewareHandler>;
    stream_options?: ReadableOptions;
    max_body_length?: number;
}

// Define types for Websocket Route Creator
export type WSRouteHandler<TUserData = unknown> = (websocket: Websocket<TUserData>) => void;
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

// Define the pattern based on Request params
type HyphenedKeys<S extends string | number | symbol> = keyof { [key in S as key extends string ? `${string}/:${key}${string}` : never] : any};
type UnionToIntersection<U> = (U extends any ? (k: U)=>void : never) extends ((k: infer I)=>void) ? I : never
export type Pattern<RequestOptions extends {Params ? : RequestParams}> = RequestOptions['Params'] extends undefined ? string : UnionToIntersection<HyphenedKeys<keyof RequestOptions['Params']>>


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
    use<RequestOptions extends {Locals? : DefaultRequestLocals, Body?: any, Params?: RequestParams}>(...middlewares: MiddlewareHandler<RequestOptions>[]): void;
    use(pattern: string, router: Router): void;
    use(pattern: string, ...routers: Router[]): void;
    use<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<RequestOptions>, ...middlewares: MiddlewareHandler<RequestOptions>[]): void;
	use<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : [Router] | Router[] | MiddlewareHandler<RequestOptions>[] | [string, Router] | [string, ...Router[]] | [string, ...MiddlewareHandler<RequestOptions>[]]) : void;

    /**
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    any<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<RequestOptions>, handler: UserRouteHandler<RequestOptions>): void;
    any<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<RequestOptions>, ...handlers: [...MiddlewareHandler<RequestOptions>[], UserRouteHandler<RequestOptions>]): void;
    any<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<RequestOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RequestOptions>[], UserRouteHandler<RequestOptions>]): void;
	any<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : 
			[Pattern<RequestOptions>, UserRouteHandler<RequestOptions>] 
		| 	[Pattern<RequestOptions>, ...MiddlewareHandler<RequestOptions>[], UserRouteHandler<RequestOptions>] 
		| 	[Pattern<RequestOptions>, UserRouteOptions, ...MiddlewareHandler<RequestOptions>[], UserRouteHandler<RequestOptions>]
	): void;

    /**
     * Alias of any() method.
     * Creates an HTTP route that handles any HTTP method requests.
     * Note! ANY routes do not support route specific middlewares.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    all<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    all<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    all<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	all<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>] 
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>] 
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles GET method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    get<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = any>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    get<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = any>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    get<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = any>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	get<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = any>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>] 
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles POST method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    post<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    post<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    post<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	post<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles PUT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
	put<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    put<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    put<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	put<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles DELETE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    delete<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    delete<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    delete<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	delete<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles HEAD method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    head<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    head<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    head<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	head<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles OPTIONS method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    options<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    options<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    options<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	options<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles PATCH method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    patch<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    patch<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    patch<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	patch<Custom extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles TRACE method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    trace<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    trace<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    trace<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	trace<Custom extends { Locals? : DefaultRequestLocals, Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Creates an HTTP route that handles CONNECT method requests.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    connect<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    connect<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    connect<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	connect<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * Intercepts and handles upgrade requests for incoming websocket connections.
     * Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
     *
     * @param {String} pattern
     * @param {...(RouteOptions|MiddlewareHandler)} args
     */
    upgrade<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, handler: UserRouteHandler<Custom>): void;
    upgrade<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
    upgrade<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(pattern: Pattern<Custom>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]): void;
	upgrade<Custom extends { Locals? : DefaultRequestLocals,  Params? : RequestParams} = {}>(...args : 
			[Pattern<Custom>, UserRouteHandler<Custom>]
		|	[Pattern<Custom>, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
		|	[Pattern<Custom>, UserRouteOptions, ...MiddlewareHandler<Custom>[], UserRouteHandler<Custom>]
	): void;

    /**
     * @param {String} pattern
     * @param {WSRouteOptions|WSRouteHandler} options
     * @param {WSRouteHandler} handler
     */
    ws<TUserData = unknown>(pattern: string, handler: WSRouteHandler<TUserData>): void;
    ws<TUserData = unknown>(pattern: string, options: WSRouteOptions, handler: WSRouteHandler<TUserData>): void;

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
