import { Response } from "../http/Response";

export class SSEventStream {
    constructor(response: Response)

    /**
     * Opens the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    open(): boolean;

    /**
     * Closes the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    close(): boolean;

    /**
     * Sends a comment-type message to the client that will not be emitted by EventSource.
     * This can be useful as a keep-alive mechanism if messages might not be sent regularly.
     *
     * @param {String} data
     * @returns {Boolean}
     */
    comment(data: string): boolean;

    /**
     * Sends a message to the client based on the specified event and data.
     * Note! You must retry failed messages if you receive a false output from this method.
     *
     * @param {String} id
     * @param {String=} event
     * @param {String=} data
     * @returns {Boolean}
     */
    send(data: string): boolean;
    send(event: string, data: string): boolean;
    send(id: string, event: string, data: string): boolean;

    /* SSEventStream properties */

    /**
     * Whether this Server-Sent Events stream is still active.
     *
     * @returns {Boolean}
     */
    get active(): boolean;
}