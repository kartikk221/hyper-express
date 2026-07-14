'use strict';
const Negotiator = require('negotiator');
const mime_types = require('mime-types');
const parse_range = require('range-parser');
const type_is = require('type-is');
const is_ip = require('net').isIP;

class ExpressRequest {
    /* Methods */
    get(name) {
        let lowercase = name.toLowerCase();
        switch (lowercase) {
            case 'referer':
            // Fall through so both standard spellings share the same lookup
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
        const negotiator = new Negotiator(this);
        if (arguments.length === 0) {
            return negotiator.mediaTypes();
        }

        const array_types = Array.isArray(types) ? types : Array.from(arguments);
        if (!array_types.length) {
            return negotiator.mediaTypes();
        }

        // Resolve MIME aliases while preserving the original candidate returned to the caller
        const candidates = [];
        const mimes = [];
        for (const candidate_type of array_types) {
            const mime_type =
                candidate_type.indexOf('/') === -1 ? mime_types.lookup(candidate_type) : candidate_type;
            if (typeof mime_type === 'string') {
                candidates.push(candidate_type);
                mimes.push(mime_type);
            }
        }

        const first = negotiator.mediaType(mimes);
        return first ? candidates[mimes.indexOf(first)] : false;
    }

    acceptsEncodings(encodings) {
        const negotiator = new Negotiator(this);
        if (arguments.length === 0) {
            return negotiator.encodings();
        } else if (Array.isArray(encodings)) {
            if (!encodings.length) return negotiator.encodings();
            return negotiator.encoding(encodings) || false;
        }
        return negotiator.encoding(Array.from(arguments)) || false;
    }

    acceptsCharsets(charsets) {
        const negotiator = new Negotiator(this);
        if (arguments.length === 0) {
            return negotiator.charsets();
        } else if (Array.isArray(charsets)) {
            if (!charsets.length) return negotiator.charsets();
            return negotiator.charset(charsets) || false;
        }
        return negotiator.charset(Array.from(arguments)) || false;
    }

    acceptsLanguages(languages) {
        const negotiator = new Negotiator(this);
        if (arguments.length === 0) {
            return negotiator.languages();
        } else if (Array.isArray(languages)) {
            if (!languages.length) return negotiator.languages();
            return negotiator.language(languages) || false;
        }
        return negotiator.language(Array.from(arguments)) || false;
    }

    range(size, options) {
        let range = this.get('Range');
        if (!range) return;
        return parse_range(size, range, options);
    }

    param(name, default_value) {
        // Preserve Express lookup precedence across parameters, body and query values
        let body = this.body;
        let path_parameters = this.path_parameters;
        let query_parameters = this.query_parameters;

        if (null != path_parameters[name] && path_parameters.hasOwnProperty(name)) return path_parameters[name];
        if (null != body[name]) return body[name];
        if (null != query_parameters[name]) return query_parameters[name];

        return default_value;
    }

    is(types) {
        // Normalize flattened arguments into the array expected by type-is
        let arr = types;
        if (!Array.isArray(types)) {
            arr = new Array(arguments.length);
            for (let index = 0; index < arr.length; index++) {
                arr[index] = arguments[index];
            }
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

    set originalUrl(value) {
        this.url = value;
    }

    get fresh() {
        this._throw_unsupported('fresh');
    }

    get params() {
        return this.path_parameters;
    }

    get hostname() {
        // Prefer the forwarded host only when intermediary proxies are trusted
        let host = this.get('X-Forwarded-Host');
        const trust_proxy = this.route.app._options.trust_proxy;
        if (!host || !trust_proxy) {
            host = this.get('Host');
        } else {
            // Use the first forwarded value if a proxy supplied a list
            host = host.split(',')[0];
        }

        if (!host) return;

        // Ignore colons inside bracketed IPv6 literals when stripping the port
        let offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
        let index = host.indexOf(':', offset);
        return index !== -1 ? host.substring(0, index) : host;
    }

    get ips() {
        const client_ip = this.ip;
        const proxy_ip = this.proxy_ip;

        // Expose the full forwarding chain only when intermediary proxies are trusted
        const trust_proxy = this.route.app._options.trust_proxy;
        const x_forwarded_for = this.get('X-Forwarded-For');
        if (trust_proxy && x_forwarded_for) {
            return x_forwarded_for.split(',');
        } else {
            const ips = [];
            if (client_ip) ips.push(client_ip);
            if (proxy_ip) ips.push(proxy_ip);
            return ips;
        }
    }

    get protocol() {
        // Resolve the forwarded protocol only when intermediary proxies are trusted
        const trust_proxy = this.route.app._options.trust_proxy;
        const x_forwarded_proto = this.get('X-Forwarded-Proto');
        if (trust_proxy && x_forwarded_proto) {
            return x_forwarded_proto.split(',')[0];
        } else {
            return this.route.app.is_ssl ? 'https' : 'http';
        }
    }

    get query() {
        return this.query_parameters;
    }

    set query(value) {
        this.query_parameters = value;
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
