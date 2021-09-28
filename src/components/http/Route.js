const operators = require('../../shared/operators.js');

class Route {
    #app;
    #method;
    #pattern;
    #handler;
    #middlewares = [];
    #path_parameters_key;

    /**
     * Route information holder object.
     *
     * @param {String} method
     * @param {String} pattern
     * @param {Function} handler
     */
    constructor(app, method, pattern, handler, middlewares) {
        this.#app = app;
        this.#method = method.toUpperCase();
        this.#pattern = pattern;
        this.#handler = handler;
        this.#middlewares = middlewares;
        this.#path_parameters_key = operators.parse_path_params(pattern);
    }

    /**
     * Updates the handler for this route.
     *
     * @param {String} handler
     */
    set_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('Route.set_handler(handler) -> handler must be a Function');
        this.#handler = handler;
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

    get middlewares() {
        return this.#middlewares;
    }

    get path_parameters_key() {
        return this.#path_parameters_key;
    }
}

module.exports = Route;
