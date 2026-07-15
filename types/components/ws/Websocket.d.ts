import * as uWebsockets from 'uWebSockets.js';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { SendableData } from '../http/Response';

export type WebsocketContext = Record<string, unknown>;
export type WebsocketMessage = string | Buffer | ArrayBuffer;
export type WebsocketSendStatus = 0 | 1 | 2;

export type WebsocketEvents = {
    message: (message: WebsocketMessage, is_binary: boolean) => unknown;
    dropped: (message: WebsocketMessage, is_binary: boolean) => unknown;
    close: (code: number, message: WebsocketMessage) => unknown;
    drain: () => unknown;
    ping: (message: WebsocketMessage) => unknown;
    pong: (message: WebsocketMessage) => unknown;
    subscription: (topic: string, new_count: number, old_count: number) => unknown;
    error: (error: Error) => unknown;
};

export class Websocket<TUserData = unknown> extends EventEmitter {
    on<Event extends keyof WebsocketEvents>(event_name: Event, listener: WebsocketEvents[Event]): this;
    once<Event extends keyof WebsocketEvents>(event_name: Event, listener: WebsocketEvents[Event]): this;

    /** Corks multiple native operations and always returns this HyperExpress wrapper. */
    atomic(callback: () => unknown): this;

    /** Returns 1 for success, 2 for a dropped message, and 0 for backpressure. */
    send(message: SendableData, is_binary?: boolean, compress?: boolean): WebsocketSendStatus;

    /** Returns the native send status, matching send(). */
    ping(message?: SendableData): WebsocketSendStatus;

    close(code?: number, message?: SendableData): void;
    destroy(): void;
    is_subscribed(topic: string): boolean;
    subscribe(topic: string): boolean;
    unsubscribe(topic: string): boolean;
    publish(topic: string, message: SendableData, is_binary?: boolean, compress?: boolean): boolean;

    /** Resolves only after the complete message, including its final fragment, has settled. */
    stream(readable: Readable, is_binary?: boolean): Promise<this>;

    get raw(): uWebsockets.WebSocket<TUserData> | null;
    get ip(): string;
    get remote_port(): number;
    get context(): WebsocketContext;
    get closed(): boolean;
    get buffered(): number;
    get topics(): Array<string>;
    get writable(): Writable;
}
