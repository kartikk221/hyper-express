'use strict';
class SSEventStream {
    #response;

    constructor(response) {
        // Store the response object locally
        this.#response = response;
    }

    /**
     * @private
     * Writes the required Server-Sent Events headers to the client.
     */
    _write_sse_headers() {
        // Only write headers if the response has not been initiated yet
        if (!this.#response.initiated) {
            this.#response.header('content-type', 'text/event-stream');
            this.#response.header('cache-control', 'no-cache');
            this.#response.header('connection', 'keep-alive');
            this.#response.header('x-accel-buffering', 'no');
        }
    }

    /**
     * Opens the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    open() {
        // We simply send a comment-type message to the client to indicate that the connection has been established
        // The "data" can be anything as it will not be handled by the client EventSource object
        return this.comment('open');
    }

    /**
     * Closes the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    close() {
        // Ends the connection by sending the final empty message
        return this.#response.send();
    }

    /**
     * Sends a comment-type message to the client that will not be emitted by EventSource.
     * This can be useful as a keep-alive mechanism if messages might not be sent regularly.
     *
     * @param {String} data
     * @returns {Boolean}
     */
    comment(data) {
        // Prefix the message with a colon character to signify a comment
        return this.#response.write(`: ${data}\n`);
    }

    /**
     * Sends a message to the client based on the specified event and data.
     * Note! You must retry failed messages if you receive a false output from this method.
     *
     * @param {String} id
     * @param {String=} event
     * @param {String=} data
     * @returns {Boolean}
     */
    send(id, event, data) {
        // Parse arguments into overloaded parameter translations
        const _id = id && event && data ? id : undefined;
        const _event = id && event ? (_id ? event : id) : undefined;
        const _data = data || event || id;

        // Build message parts to prepare a payload
        const parts = [];
        if (_id) parts.push(`id: ${_id}`);
        if (_event) parts.push(`event: ${_event}`);
        if (_data) parts.push(`data: ${_data}`);

        // Push an empty line to indicate the end of the message
        parts.push('', '');

        // Ensure the proper SSE headers are written
        this._write_sse_headers();

        // Write the string based payload to the client
        return this.#response.write(parts.join('\n'));
    }

    /* SSEConnection Properties */

    /**
     * Whether this Server-Sent Events stream is still active.
     *
     * @returns {Boolean}
     */
    get active() {
        return !this.#response.completed;
    }
}

module.exports = SSEventStream;
