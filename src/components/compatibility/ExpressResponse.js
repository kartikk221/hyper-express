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
        Object.keys(headers).forEach((name) => this.header(name, headers[name]));
    }

    /**
     * @benoitlahoz Only tested with `vite` middlewares used for SSR.
     * `writeHead` method appears to have been removed from `express`
     * but `vite` middlewares use it.
     *
     * Original `http` module method accepts 3 parameters, `headers` being the third
     * but `vite` sends headers as second parameter and `undefined` as third.
     *
     * @see https://github.com/kartikk221/hyper-express/issues/324
     * @see https://github.com/kartikk221/hyper-express/issues/22
     */
    writeHead(statusCode, headers) {
        this.status(statusCode);
        if (headers && typeof headers === 'object') {
            Object.keys(headers).forEach((name) => this.header(name, headers[name]));
        }
    }

    setHeaders(headers) {
        this.writeHeaders(headers);
    }

    writeHeaderValues(name, values) {
        values.forEach((value) => this.header(name, value));
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
        // Build chunks of links and combine into header spec
        let chunks = [];
        Object.keys(links).forEach((rel) => {
            let url = links[rel];
            chunks.push(`<${url}>; rel="${rel}"`);
        });

        // Write the link header
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
            const reference = this;
            Object.keys(field).forEach((name) => {
                let value = field[name];
                reference.header(name, value);
            });
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
