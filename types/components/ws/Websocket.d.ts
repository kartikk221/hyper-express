import * as uWebsockets from 'uWebSockets.js';
import { EventEmitter } from "events";
import { Readable, Writable } from 'stream';
import { SendableData } from "../http/Response";

export type WebsocketContext = {
    [key: string]: string
}

export class Websocket extends EventEmitter {
    /* EventEmitter Overrides */
    on(eventName: 'message' | 'close' | 'drain' | 'ping' | 'pong', listener: (...args: any[]) => void): this;
    once(eventName: 'message' | 'close' | 'drain' | 'ping' | 'pong', listener: (...args: any[]) => void): this;

    /* Websocket Methods */

    /**
     * Alias of uWS.cork() method. Accepts a callback with multiple operations for network efficiency.
     *
     * @param {Function} callback
     * @returns {Websocket}
     */
    atomic(callback: () => void): Websocket;

    /**
     * Sends a message to websocket connection.
     * Returns true if message was sent successfully.
     * Returns false if message was not sent due to buil up backpressure.
     *
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     * @returns {Boolean}
     */
    send(message: SendableData, is_binary?: boolean, compress?: boolean): boolean;

    /**
     * Sends a ping control message.
     * Returns Boolean depending on backpressure similar to send().
     *
     * @param {String|Buffer|ArrayBuffer=} message
     * @returns {Boolean}
     */
    ping(message?: SendableData): void;

    /**
     * Gracefully closes websocket connection by sending specified code and short message.
     *
     * @param {Number=} code
     * @param {(String|Buffer|ArrayBuffer)=} message
     */
    close(code?: number, message?: SendableData): void;

    /**
     * Forcefully closes websocket connection.
     * No websocket close code/message is sent.
     * This will immediately emit the 'close' event.
     */
    destroy(): void;

    /**
     * Returns whether this `Websocket` is subscribed to the specified topic.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    is_subscribed(topic: string): boolean;

    /**
     * Subscribe to a topic in MQTT syntax.
     * MQTT syntax includes things like "root/child/+/grandchild" where "+" is a wildcard and "root/#" where "#" is a terminating wildcard.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    subscribe(topic: string): boolean;

    /**
     * Unsubscribe from a topic.
     * Returns true on success, if the WebSocket was subscribed.
     *
     * @param {String} topic
     * @returns {Boolean}
     */
    unsubscribe(topic: string): boolean;

    /**
     * Publish a message to a topic in MQTT syntax.
     * You cannot publish using wildcards, only fully specified topics.
     *
     * @param {String} topic
     * @param {String|Buffer|ArrayBuffer} message
     * @param {Boolean=} is_binary
     * @param {Boolean=} compress
     */
    publish(topic: string, message: SendableData, is_binary?: boolean, compress?: boolean): boolean;

    /**
     * This method is used to stream a message to the receiver.
     * Note! The data is streamed as binary by default due to how partial fragments are sent.
     * This is done to prevent processing errors depending on client's receiver's incoming fragment processing strategy.
     *
     * @param {Readable} readable A Readable stream which will be consumed as message
     * @param {Boolean=} is_binary Whether data being streamed is in binary. Default: true
     * @returns {Promise}
     */
    stream(readable: Readable, is_binary?: boolean): Promise<any>;

    /* Websocket Properties */

    /**
     * Underlying uWS.Websocket object
     */
    get raw(): uWebsockets.WebSocket;

    /**
     * Returns IP address of this websocket connection.
     * @returns {String}
     */
    get ip(): string;

    /**
     * Returns context values from the response.update(context) connection upgrade call.
     * @returns {Object}
     */
    get context(): WebsocketContext;

    /**
     * Returns whether is websocket connection is closed.
     * @returns {Boolean}
     */
    get closed(): boolean;

    /**
     * Returns the bytes buffered in backpressure.
     * This is similar to the bufferedAmount property in the browser counterpart.
     * @returns {Number}
     */
    get buffered(): number;

    /**
     * Returns a list of topics this websocket is subscribed to.
     * @returns {Array.<String>}
     */
    get topics(): Array<string>;

    /**
     * Returns a Writable stream associated with this response to be used for piping streams.
     * Note! You can only retrieve/use only one writable at any given time.
     *
     * @returns {Writable}
     */
    get writable(): Writable;
}
