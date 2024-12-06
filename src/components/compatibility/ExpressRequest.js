'use strict';
const Negotiator = require('negotiator');
const mime_types = require('mime-types');
const parse_range = require('range-parser');
const type_is = require('type-is');
const is_ip = require('net').isIP;

class ExpressRequest {
    #negotiator;

    ExpressRequest() {
        this.#negotiator = new Negotiator(this);
    }

    /* Methods */
    get(name) {
        let lowercase = name.toLowerCase();
        switch (lowercase) {
            case 'referer':
            // Continue execution to below case for catching of both spelling variations
            case 'referrer':
                return this.headers['referer'] || this.headers['referrer'];
            default:
                return this.headers[lowercase];
        }
    }

    header(name) {
        return this.get(name);
    }

    accepts(types) {
        if (arguments.length === 0) {
            return this.#negotiator.mediaTypes();
        }

        const arrayTypes = Array.isArray(types) ? types : Array.from(arguments);
        if (!arrayTypes.length) {
            return this.#negotiator.mediaTypes();
        }

        const mimes = arrayTypes.map((type) => (type.indexOf('/') === -1 ? mime_types.lookup(type) : type));
        const first = this.#negotiator.mediaType(mimes.filter((type) => typeof type === 'string'));
        return first ? arrayTypes[mimes.indexOf(first)] : false;
    }

    acceptsEncodings(encodings) {
        if (arguments.length === 0) {
            return this.#negotiator.encodings();
        } else if (Array.isArray(encodings)) {
            if (!encodings.length) return this.#negotiator.encodings();
            return this.#negotiator.encoding(encodings) || false;
        }
        return this.#negotiator.encoding(Array.from(arguments)) || false;
    }

    acceptsCharsets(charsets) {
        if (arguments.length === 0) {
            return this.#negotiator.charsets();
        } else if (Array.isArray(charsets)) {
            if (!charsets.length) return this.#negotiator.charsets();
            return this.#negotiator.charset(charsets) || false;
        }
        return this.#negotiator.charset(Array.from(arguments)) || false;
    }

    acceptsLanguages(languages) {
        if (arguments.length === 0) {
            return this.#negotiator.languages();
        } else if (Array.isArray(languages)) {
            if (!languages.length) return this.#negotiator.languages();
            return this.#negotiator.language(languages) || false;
        }
        return this.#negotiator.language(Array.from(arguments)) || false;
    }

    range(size, options) {
        let range = this.get('Range');
        if (!range) return;
        return parse_range(size, range, options);
    }

    param(name, default_value) {
        // Parse three dataset candidates
        let body = this.body;
        let path_parameters = this.path_parameters;
        let query_parameters = this.query_parameters;

        // First check path parameters, body, and finally query_parameters
        if (null != path_parameters[name] && path_parameters.hasOwnProperty(name)) return path_parameters[name];
        if (null != body[name]) return body[name];
        if (null != query_parameters[name]) return query_parameters[name];

        return default_value;
    }

    is(types) {
        // support flattened arguments
        let arr = types;
        if (!Array.isArray(types)) {
            arr = new Array(arguments.length);
            for (let i = 0; i < arr.length; i++) arr[i] = arguments[i];
        }
        return type_is(this, arr);
    }

    /* Properties */
    get baseUrl() {
        return this.path;
    }

    get originalUrl() {
        return this.url;
    }

    /**
     * @benoitlahoz Only tested with `vite` middlewares used for SSR
     * that actually change the `originalUrl` of the request.
     *
     * @see https://github.com/kartikk221/hyper-express/issues/324
     */
    set originalUrl(url) {
        this.url = url;
    }

    get fresh() {
        this._throw_unsupported('fresh');
    }

    get params() {
        return this.path_parameters;
    }

    get hostname() {
        // Retrieve the host header and determine if we can trust intermediary proxy servers
        let host = this.get('X-Forwarded-Host');
        const trust_proxy = this.route.app._options.trust_proxy;
        if (!host || !trust_proxy) {
            // Use the 'Host' header as fallback
            host = this.get('Host');
        } else {
            // Note: X-Forwarded-Host is normally only ever a single value, but this is to be safe.
            host = host.split(',')[0];
        }

        // If we don't have a host, return undefined
        if (!host) return;

        // IPv6 literal support
        let offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
        let index = host.indexOf(':', offset);
        return index !== -1 ? host.substring(0, index) : host;
    }

    get ips() {
        // Retrieve the client and proxy IP addresses
        const client_ip = this.ip;
        const proxy_ip = this.proxy_ip;

        // Determine if we can trust intermediary proxy servers and have a x-forwarded-for header
        const trust_proxy = this.route.app._options.trust_proxy;
        const x_forwarded_for = this.get('X-Forwarded-For');
        if (trust_proxy && x_forwarded_for) {
            // Will split and return all possible IP addresses in the x-forwarded-for header (e.g. "client, proxy1, proxy2")
            return x_forwarded_for.split(',');
        } else {
            // Returns all valid IP addresses available from uWS
            return [client_ip, proxy_ip].filter((ip) => ip);
        }
    }

    get protocol() {
        // Resolves x-forwarded-proto header if trust proxy is enabled
        const trust_proxy = this.route.app._options.trust_proxy;
        const x_forwarded_proto = this.get('X-Forwarded-Proto');
        if (trust_proxy && x_forwarded_proto) {
            // Return the first protocol in the x-forwarded-proto header
            // If the header contains a single value, the split will contain that value in the first index element anyways
            return x_forwarded_proto.split(',')[0];
        } else {
            // Use HyperExpress/uWS initially defined protocol as fallback
            return this.route.app.is_ssl ? 'https' : 'http';
        }
    }

    get query() {
        return this.query_parameters;
    }

    get secure() {
        return this.protocol === 'https';
    }

    get signedCookies() {
        this._throw_unsupported('signedCookies');
    }

    get stale() {
        this._throw_unsupported('stale');
    }

    get subdomains() {
        let hostname = this.hostname;
        if (!hostname) return [];

        let offset = 2;
        let subdomains = !is_ip(hostname) ? hostname.split('.').reverse() : [hostname];
        return subdomains.slice(offset);
    }

    get xhr() {
        return (this.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
    }
}

module.exports = ExpressRequest;
