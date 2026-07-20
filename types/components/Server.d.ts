import { ReadableOptions, WritableOptions } from 'stream';
import * as uWebsockets from 'uWebSockets.js';
import { SendableData } from './http/Response';
import { Request } from './http/Request';
import { Response } from './http/Response';
import { Router } from './router/Router';
import { HostManager } from './plugins/HostManager';

export interface ServerConstructorOptions {
    key_file_name?: string;
    cert_file_name?: string;
    passphrase?: string;
    dh_params_file_name?: string;
    ca_file_name?: string;
    ssl_ciphers?: string;
    ssl_prefer_low_memory_usage?: boolean;
    auto_close?: boolean;
    exclusive_port?: boolean;
    fast_buffers?: boolean;
    fast_abort?: boolean;
    strict_middleware?: boolean;
    trust_proxy?: boolean;
    max_body_buffer?: number;
    max_body_length?: number;
    streaming?: {
        readable?: ReadableOptions;
        writable?: WritableOptions;
    };
}

export type GlobalErrorHandler = (request: Request, response: Response, error: Error) => unknown;
export type GlobalNotFoundHandler = (request: Request, response: Response) => unknown;

export class Server extends Router {
    constructor(options?: ServerConstructorOptions);

    /**
     * This object can be used to store properties/references local to this Server instance.
     */
    locals: Object;

    /* Server Methods */

    /**
     * Starts HyperExpress webserver on specified port and host.
     *
     * @param {Number} port
     * @param {String=} host Optional. Default: 0.0.0.0
     * @param {Function=} callback Optional. Callback to be called when the server is listening. Default: "0.0.0.0"
     * @returns {Promise} Promise
     */
    listen(
        port: number,
        callback?: (listen_socket: uWebsockets.us_listen_socket) => void
    ): Promise<uWebsockets.us_listen_socket>;
    listen(
        port: number,
        host?: string,
        callback?: (listen_socket: uWebsockets.us_listen_socket) => void
    ): Promise<uWebsockets.us_listen_socket>;
    listen(
        unix_path: string,
        callback?: (listen_socket: uWebsockets.us_listen_socket) => void
    ): Promise<uWebsockets.us_listen_socket>;

    /**
     * Stops accepting new connections, then resolves after all pending HTTP requests complete.
     * WebSocket connections are not part of the graceful drain count.
     *
     * @param {uWebSockets.us_listen_socket=} [listen_socket] Optional
     * @returns {Promise<Boolean>}
     */
    shutdown(listen_socket?: uWebsockets.us_listen_socket): Promise<boolean>;

    /**
     * Stops/Closes HyperExpress webserver instance.
     *
     * @param {uWebSockets.us_listen_socket=} [listen_socket] Optional
     * @returns {Boolean}
     */
    close(listen_socket?: uWebsockets.us_listen_socket): boolean;

    /** Forcefully closes all native listen, HTTP, and WebSocket sockets. */
    force_close(): boolean;

    /**
     * Sets a global error handler which will catch most uncaught errors across all routes/middlewares.
     *
     * @param {GlobalErrorHandler} handler
     */
    set_error_handler(handler: GlobalErrorHandler): this;

    /**
     * Sets a global not found handler which will handle all requests that are unhandled by any registered route.
     *
     * @param {GlobalNotFoundHandler} handler
     */
    set_not_found_handler(handler: GlobalNotFoundHandler): this;

    /**
     * Publish a message to a topic in MQTT syntax to all WebSocket connections on this Server instance.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @returns {Boolean}
     */
    publish(topic: string, message: SendableData, is_binary?: boolean, compress?: boolean): boolean;

    /**
     * Returns the number of subscribers to a topic across all WebSocket connections on this Server instance.
     *
     * @param {String} topic
     * @returns {Number}
     */
    num_of_subscribers(topic: string): number;

    /** Returns the native application descriptor for worker distribution. */
    get_descriptor(): uWebsockets.AppDescriptor;

    /** Adds a child application descriptor for worker distribution. */
    add_child_app_descriptor(descriptor: uWebsockets.AppDescriptor): this;

    /** Removes a child application descriptor from worker distribution. */
    remove_child_app_descriptor(descriptor: uWebsockets.AppDescriptor): this;

    /* Server Properties */

    /** Returns whether this server uses TLS. */
    get is_ssl(): boolean;

    /**
     * Returns the local server listening port of the server instance.
     * @returns {Number}
     */
    get port(): number;

    /**
     * Returns the server's internal uWS listening socket.
     * @returns {uWebSockets.us_listen_socket=}
     */
    get socket(): uWebsockets.us_listen_socket | null;

    /**
     * Underlying uWS instance.
     * @returns {uWebSockets.TemplatedApp}
     */
    get uws_instance(): uWebsockets.TemplatedApp;

    /**
     * Server instance global handlers.
     * @returns {Object}
     */
    get handlers(): Object;

    /**
     * Returns the Server Hostnames manager for this instance.
     * Use this to support multiple hostnames on the same server with different SSL configurations.
     * @returns {HostManager}
     */
    get hosts(): HostManager;
}
