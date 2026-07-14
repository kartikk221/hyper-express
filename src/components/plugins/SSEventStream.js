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
        // SSE headers can only be applied once and before the underlying response starts
        if (this._response.initiated) return false;
        if (this.#wrote_headers) return false;
        this.#wrote_headers = true;

        this._response
            .header('content-type', 'text/event-stream')
            .header('cache-control', 'no-cache')
            .header('connection', 'keep-alive')
            .header('x-accel-buffering', 'no');

        return true;
    }

    /**
     * @private
     * Internal method to write data to the response stream.
     * @returns {Boolean} Whether the data was written
     */
    _write(data) {
        // Lazily apply SSE headers before the first payload
        this._initiate_sse_stream();
        return this._response.write(data);
    }

    /**
     * Opens the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    open() {
        // An SSE comment confirms the connection without dispatching a client event
        return this.comment('open');
    }

    /**
     * Closes the "Server-Sent Events" connection to the client.
     *
     * @returns {Boolean}
     */
    close() {
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
        // A leading colon marks an SSE comment rather than an event
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

        const parts = [];
        if (_id) parts.push(`id: ${_id}`);
        if (_event) parts.push(`event: ${_event}`);
        if (_data) parts.push(`data: ${_data}`);

        // A blank line terminates each SSE message
        parts.push('', '');

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
