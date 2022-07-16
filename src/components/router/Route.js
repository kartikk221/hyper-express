const Server = require('../Server.js'); // lgtm [js/unused-local-variable]
const { parse_path_parameters } = require('../../shared/operators.js');

class Route {
    app = null;
    method = null;
    pattern = null;
    handler = null;
    options = null;
    streaming = null;
    max_body_length = null;
    path_parameters_key = null;

    /**
     * Constructs a new Route object.
     * @param {Object} options
     * @param {Server} options.app - The server instance.
     * @param {String} options.method - The HTTP method.
     * @param {String} options.pattern - The route pattern.
     * @param {Function} options.handler - The route handler.
     */
    constructor({ app, method, pattern, options, handler }) {
        this.app = app;
        this.pattern = pattern;
        this.handler = handler;
        this.options = options;
        this.method = method.toUpperCase();
        this.streaming = options.streaming || app._options.streaming || {};
        this.max_body_length = options.max_body_length || app._options.max_body_length;
        this.path_parameters_key = parse_path_parameters(pattern);
    }

    /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @param {Function} handler
     */
    use(middleware) {
        // Store and sort middlewares to ensure proper execution order
        this.options.middlewares.push(middleware);
        this.options.middlewares.sort((a, b) => a.priority - b.priority);
    }
}

module.exports = Route;
