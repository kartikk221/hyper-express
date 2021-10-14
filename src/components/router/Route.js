const { parse_path_parameters } = require('../../shared/operators.js');

class Route {
    #app;
    #method;
    #pattern;
    #handler;
    #options;
    #path_parameters_key;

    /**
     * Route information holder object.
     *
     * @param {String} method
     * @param {String} pattern
     * @param {Function} handler
     */
    constructor({ app, method, pattern, options, handler }) {
        this.#app = app;
        this.#method = method.toUpperCase();
        this.#pattern = pattern;
        this.#handler = handler;
        this.#options = options;
        this.#path_parameters_key = parse_path_parameters(pattern);
    }

    /**
     * Binds middleware to this route and sorts middlewares to ensure execution order.
     *
     * @private
     * @param {Function} handler
     */
    use(middleware) {
        // Store and sort middlewares to ensure proper execution order
        this.#options.middlewares.push(middleware);
        this.#options.middlewares.sort((a, b) => a.priority - b.priority);
    }

    /* Route Getters */

    get app() {
        return this.#app;
    }

    get method() {
        return this.#method;
    }

    get pattern() {
        return this.#pattern;
    }

    get handler() {
        return this.#handler;
    }

    get options() {
        return this.#options;
    }

    get middlewares() {
        return this.#options.middlewares;
    }

    get path_parameters_key() {
        return this.#path_parameters_key;
    }
}

module.exports = Route;
