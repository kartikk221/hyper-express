class SSEConnection {
    #id = 0;
    #response;

    constructor(response) {
        // Store the response object locally
        this.#response = response;
    }

    /**
     * Returns an incremented identifier unique to this connection.
     * Note! This method will automatically wrap the incremented identifier back to 0 if it exceeds the maximum safe value.
     *
     * @private
     * @returns {Number}
     */
    _get_id() {
        this.#id++;
        if (this.#id >= Number.MAX_SAFE_INTEGER) this.#id = 0;
        return this.#id;
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
        id = id && event && data ? id : this._get_id();
        event = id && event ? id || event : undefined;
        data = data || event || id;

        // Build message parts to prepare a payload
        const parts = [];
        if (id) parts.push(`id: ${id}`);
        if (event) parts.push(`event: ${event}`);
        if (data) parts.push(`data: ${data}`);

        // Push an empty line to indicate the end of the message
        parts.push('');

        // Ensure the proper SSE headers are written
        this._write_sse_headers();

        // Write the string based payload to the client
        return this.#response.write(parts.join('\n'));
    }
}

module.exports = SSEConnection;
