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
            .header('content-type', 'text/event-stream; charset=utf-8')
            .header('cache-control', 'no-cache');

        return true;
    }

    /**
     * @private
     * Internal method to write data to the response stream.
     * @returns {Boolean} Whether the data was written
     */
    _write(data) {
        if (!this.active) return false;
        // Lazily apply SSE headers before the first payload
        this._initiate_sse_stream();
        return this._response.write(data);
    }

    /** @private */
    _lines(value) {
        return String(value ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n');
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
        const lines = this._lines(data).map((line) => (line ? `: ${line}` : ':'));
        return this._write(`${lines.join('\n')}\n\n`);
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
        // Parse overloads by argument count so empty strings and other falsey values survive.
        let _id;
        let _event;
        let _data;
        if (arguments.length >= 3) {
            _id = id;
            _event = event;
            _data = data;
        } else if (arguments.length === 2) {
            _event = id;
            _data = event;
        } else {
            _data = id;
        }

        const parts = [];
        if (_id !== undefined) {
            const safe_id = String(_id).replace(/[\r\n\0]/g, '');
            parts.push(safe_id ? `id: ${safe_id}` : 'id:');
        }
        if (_event !== undefined) {
            const safe_event = String(_event).replace(/[\r\n\0]/g, '');
            parts.push(safe_event ? `event: ${safe_event}` : 'event:');
        }
        for (const line of this._lines(_data)) parts.push(line ? `data: ${line}` : 'data:');

        // A blank line terminates each SSE message
        return this._write(`${parts.join('\n')}\n\n`);
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
