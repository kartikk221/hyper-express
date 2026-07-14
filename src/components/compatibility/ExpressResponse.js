'use strict';

class ExpressResponse {
    /* Methods */
    append(name, values) {
        return this.header(name, values);
    }

    setHeader(name, values) {
        return this.append(name, values);
    }

    writeHeaders(headers) {
        // Node.js also accepts an Array of raw header name/value pairs
        if (Array.isArray(headers)) {
            if (headers.length % 2 !== 0)
                throw new Error('HyperExpress.Response.writeHeaders(): Raw header arrays must contain name/value pairs.');

            for (let index = 0; index < headers.length; index += 2) {
                const header_key = headers[index];
                const header_value = headers[index + 1];
                this.header(header_key, header_value);
            }
        } else {
            const header_keys = Object.keys(headers);
            for (let index = 0; index < header_keys.length; index++) {
                const header_key = header_keys[index];
                const header_value = headers[header_key];
                this.header(header_key, header_value);
            }
        }
    }

    /**
     * Provides compatibility with Node.js ServerResponse.writeHead().
     * @param {Number} status_code
     * @param {String|Object|Array<String>=} status_message
     * @param {Object|Array<String>=} headers
     * @returns {Response} Response (Chainable)
     */
    writeHead(status_code, status_message, headers) {
        // Support the writeHead(statusCode, headers) overload
        if (status_message && typeof status_message === 'object') {
            headers = status_message;
            status_message = undefined;
        }

        this.status(status_code, status_message);
        if (headers) this.writeHeaders(headers);
        return this;
    }

    setHeaders(headers) {
        this.writeHeaders(headers);
    }

    writeHeaderValues(name, values) {
        const header_values = values;
        for (const header_value of header_values) {
            this.header(name, header_value);
        }
    }

    getHeader(name) {
        return this._headers[name];
    }

    removeHeader(name) {
        delete this._headers[name];
    }

    setCookie(name, value, options) {
        return this.cookie(name, value, null, options);
    }

    hasCookie(name) {
        return this._cookies && this._cookies[name] !== undefined;
    }

    removeCookie(name) {
        return this.cookie(name, null);
    }

    clearCookie(name) {
        return this.cookie(name, null);
    }

    end(data) {
        return this.send(data);
    }

    format() {
        this._throw_unsupported('format()');
    }

    get(name) {
        let values = this._headers[name];
        if (values) return values.length == 0 ? values[0] : values;
    }

    links(links) {
        // Serialize each relation using the HTTP Link header format
        let chunks = [];
        const relation_keys = Object.keys(links);
        for (let index = 0; index < relation_keys.length; index++) {
            const relation_key = relation_keys[index];
            const relation_url = links[relation_key];
            chunks.push(`<${relation_url}>; rel="${relation_key}"`);
        }

        this.header('link', chunks.join(', '));
    }

    location(path) {
        return this.header('location', path);
    }

    render() {
        this._throw_unsupported('render()');
    }

    sendFile(path) {
        return this.file(path);
    }

    sendStatus(status_code) {
        return this.status(status_code).send();
    }

    set(field, value) {
        if (typeof field == 'object') {
            const header_keys = Object.keys(field);
            for (let index = 0; index < header_keys.length; index++) {
                const header_key = header_keys[index];
                const header_value = field[header_key];
                this.header(header_key, header_value);
            }
        } else {
            this.header(field, value);
        }
    }

    vary(name) {
        return this.header('vary', name);
    }

    /* Properties */
    get headersSent() {
        return this.initiated;
    }
}

module.exports = ExpressResponse;
