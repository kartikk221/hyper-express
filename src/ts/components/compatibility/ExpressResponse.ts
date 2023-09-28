import { CookieOptions } from "express";

export default class ExpressResponse {
    /* Methods */
    append(name: string, values: string | string[]) {
        return this.header(name, values);
    }

    setHeader = this.append;

    writeHeaders(headers: Record<string, string | string[]>) {
        Object.keys(headers).forEach((name) => this.header(name, headers[name]));
    }

    setHeaders = this.writeHeaders;

    writeHeaderValues(name: string, values: string[]) {
        values.forEach((value) => this.header(name, value));
    }

    getHeader(name: string): string | string[] {
        return this._headers[name];
    }

    removeHeader(name: string) {
        delete this._headers[name];
    }

    setCookie(name: string, value: string, options: CookieOptions) {
        return this.cookie(name, value, null, options);
    }

    hasCookie(name: string) {
        return this._cookies && this._cookies[name] !== undefined;
    }

    removeCookie(name: string) {
        return this.cookie(name, null);
    }

    clearCookie(name: string) {
        return this.cookie(name, null);
    }

    end(data: string | ArrayBuffer | Buffer) {
        return this.send(data);
    }

    format() {
        this._throw_unsupported('format()');
    }

    get(name: string) {
        let values = this._headers[name];
        if (values) return values.length == 0 ? values[0] : values;
        return;
    }

    links(links: Record<string, string>) {
        // Build chunks of links and combine into header spec
        let chunks: string[] = [];
        Object.keys(links).forEach((rel) => {
            let url = links[rel];
            chunks.push(`<${url}>; rel="${rel}"`);
        });

        // Write the link header
        this.header('link', chunks.join(', '));
    }

    location(path: string) {
        return this.header('location', path);
    }

    render() {
        this._throw_unsupported('render()');
    }

    sendFile(path: string) {
        return this.file(path);
    }

    sendStatus(status_code: string) {
        return this.status(status_code);
    }

    set(field: string | Record<string, string | string[]>, value: string | string[]) {
        if (typeof field == 'object') {
            const reference = this;
            Object.keys(field).forEach((name) => {
                let value = field[name];
                reference.header(field, value);
            });
        } else {
            this.header(field, value);
        }
    }

    vary(name: string) {
        return this.header('vary', name);
    }

    /* Properties */
    get headersSent() {
        return this.initiated;
    }
}
