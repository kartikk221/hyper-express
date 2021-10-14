// Memory store with simulated functionalities similar to SQL databases
class MemoryStore {
    #container = {};
    constructor() {}

    /**
     * This method can be used to lookup/select specific keys from store
     *
     * @param {String} key
     * @returns {Any} Any OR undefined
     */
    select(key) {
        return this.#container?.[key]?.data;
    }

    /**
     *
     * @param {String} key
     * @param {Object} data
     * @param {Number} expiry_ts In Milliseconds
     */
    insert(key, data, expiry_ts) {
        // Throw on overwrites
        if (this.#container[key])
            throw new Error('MemoryStore: key ' + key + ' already exists. Use update() method.');

        this.#container[key] = {
            data: data,
            expiry: expiry_ts,
        };
    }

    update(key, data, expiry_ts) {
        // Throw on non existent source
        if (this.#container[key] == undefined)
            throw new Error(
                'MemoryStore: key ' + key + ' does not exist in store. Use insert() method.'
            );

        this.#container[key].data = data;
        if (typeof expiry_ts == 'number') this.#container[key].expiry = expiry_ts;
    }

    touch(key, expiry_ts) {
        // Throw on non existent source
        if (this.#container[key] == undefined)
            throw new Error(
                'MemoryStore: cannot touch key ' + key + ' because it does not exist in store.'
            );

        this.#container[key].expiry = expiry_ts;
    }

    delete(key) {
        delete this.#container[key];
    }

    empty() {
        this.#container = {};
    }

    cleanup() {
        let removed = 0;
        Object.keys(this.#container).forEach((key) => {
            let data = this.#container[key];
            let expiry = data.expiry;
            if (expiry < Date.now()) {
                delete this.#container[key];
                removed++;
            }
        });
        return removed;
    }

    get data() {
        return this.#container;
    }
}

module.exports = MemoryStore;
