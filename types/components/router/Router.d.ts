import { ReadableOptions } from 'stream';
import { DefaultRequestLocals, Request, RequestParams } from '../http/Request';
import { Response } from '../http/Response';
import { Websocket } from '../ws/Websocket';
import { MiddlewareHandler } from '../middleware/MiddlewareHandler';

// Define types for HTTP Route Creators
export type UserRouteHandler<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {Locals? : DefaultRequestLocals}> = (request: Request<RouteOptions>, response: Response<RouteOptions>) => void;
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

// Defines the type for internal middleware records
export interface MiddlewareRecord {
    pattern: string;
    middleware: MiddlewareHandler;
}

// Define the pattern based on Request params
type HyphenedKeys<S extends string | number | symbol> = keyof { [key in S as key extends string ? `${string}/:${key}${string}` : never] : any};
type UnionToIntersection<U> = (U extends any ? (k: U)=>void : never) extends ((k: infer I)=>void) ? I : never
export type Pattern<RouteOptions extends {Params ? : RequestParams}> = RouteOptions['Params'] extends undefined ? string : UnionToIntersection<HyphenedKeys<keyof RouteOptions['Params']>>


export class Router {
	constructor();

	/**
	* Returns a chainable Router instance which can be used to bind multiple method routes or middlewares on the same path easily.
	* Example: `Router.route('/api/v1').get(getHandler).post(postHandler).delete(destroyHandler)`
	* Example: `Router.route('/api/v1').use(middleware).user(middleware2)`
	* @param {String} pattern
	* @returns {Router} A chainable Router instance with a context pattern set to this router's pattern.
	*/
	route(pattern: string): this;

	/**
	* Registers middlewares and router instances on the specified pattern if specified.
	* If no pattern is specified, the middleware/router instance will be mounted on the '/' root path by default of this instance.
	*
	* @param {...(String|MiddlewareHandler|Router)} args (request, response, next) => {} OR (request, response) => new Promise((resolve, reject) => {})
	*/
	use(router: Router): this;
	use(...routers: Router[]): this;
	use<RouteOptions extends {Locals? : DefaultRequestLocals, Body?: any, Params?: RequestParams, Response? : any}>(...middlewares: MiddlewareHandler<RouteOptions>[]): this;
	use(pattern: string, router: Router): this;
	use(pattern: string, ...routers: Router[]): this;
	use<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...middlewares: MiddlewareHandler<RouteOptions>[]): this;
	use<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(...args : [Router] | Router[] | MiddlewareHandler<RouteOptions>[] | [string, Router] | [string, ...Router[]] | [string, ...MiddlewareHandler<RouteOptions>[]]) : this;

	/**
	* Creates an HTTP route that handles any HTTP method requests.
	* Note! ANY routes do not support route specific middlewares.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	any(pattern: string, handler: UserRouteHandler): this;
	any(pattern: string, ...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]): this;
	any(
			pattern: string,
			options: UserRouteOptions | MiddlewareHandler,
			...handlers: [MiddlewareHandler | MiddlewareHandler[], UserRouteHandler]
	): this;

	/**
		* Alias of any() method.
		* Creates an HTTP route that handles any HTTP method requests.
		* Note! ANY routes do not support route specific middlewares.
		*
		* @param {String} pattern
		* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
		*/
	all<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	all<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	all<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	all<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>] 
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>] 
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles GET method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	get<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = any>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	get<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = any>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	get<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = any>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	get<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = any>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>] 
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles POST method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	post<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	post<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	post<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	post<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles PUT method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	put<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	put<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	put<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	put<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles DELETE method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	delete<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	delete<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	delete<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	delete<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles HEAD method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	head<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	head<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	head<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	head<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles OPTIONS method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	options<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	options<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	options<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	options<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles PATCH method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	patch<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	patch<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	patch<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	patch<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles TRACE method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	trace<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	trace<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	trace<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	trace<RouteOptions extends { Locals? : DefaultRequestLocals, Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Creates an HTTP route that handles CONNECT method requests.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	connect<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	connect<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	connect<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	connect<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* Intercepts and handles upgrade requests for incoming websocket connections.
	* Note! You must call response.upgrade(data) at some point in this route to open a websocket connection.
	*
	* @param {String} pattern
	* @param {...(RouteOptions|MiddlewareHandler|UserRouteHandler)} args
	*/
	upgrade<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, handler: UserRouteHandler<RouteOptions>): this;
	upgrade<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	upgrade<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(pattern: Pattern<RouteOptions>, options: UserRouteOptions, ...handlers: [...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]): this;
	upgrade<RouteOptions extends { Locals? : DefaultRequestLocals,  Params? : RequestParams, Response? : any} = {}>(...args : 
			[Pattern<RouteOptions>, UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
		|	[Pattern<RouteOptions>, UserRouteOptions, ...MiddlewareHandler<RouteOptions>[], UserRouteHandler<RouteOptions>]
	): this;

	/**
	* @param {String} pattern
	* @param {WSRouteOptions|WSRouteHandler} options
	* @param {WSRouteHandler} handler
	*/
	ws<TUserData = unknown>(pattern: string, handler: WSRouteHandler<TUserData>): this;
	ws<TUserData = unknown>(pattern: string, options: WSRouteOptions, handler: WSRouteHandler<TUserData>): this;

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
