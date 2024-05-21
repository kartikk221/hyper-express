'use strict';
class SSEventStream {
    _response;

    #wrote_headers = false;
    /**
     * @private
     * Ensures the proper SSE headers are written to the client to initiate the SSE stream.
     * @returns {Boolean} Whether the headers were written
     */
    _initiate_sse_stream() {
        // If the response has already been initiated, we cannot write headers anymore
        if (this._response.initiated) return false;

        // If we have already written headers, we cannot write again
        if (this.#wrote_headers) return false;
        this.#wrote_headers = true;

        // Write the headers for the SSE stream to the client
        this._response
            .header('content-type', 'text/event-stream')
            .header('cache-control', 'no-cache')
            .header('connection', 'keep-alive')
            .header('x-accel-buffering', 'no');

        // Return true to signify that we have written headers
        return true;
    }

    /**
     * @private
     * Internal method to write data to the response stream.
     * @returns {Boolean} Whether the data was written
     */
    _write(data) {
        // Initialize the SSE stream
        this._initiate_sse_stream();

        // Write the data to the response stream
        return this._response.write(data);
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
        return this._response.send();
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
        return this._write(`: ${data}\n`);
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

        // Write the string based payload to the client
        return this._write(parts.join('\n'));
    }

    /* SSEConnection Properties */

    /**
     * Whether this Server-Sent Events stream is still active.
     *
     * @returns {Boolean}
     */
    get active() {
        return !this._response.completed;
    }
}

module.exports = SSEventStream;
