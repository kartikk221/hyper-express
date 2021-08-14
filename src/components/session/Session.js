const signature = require('cookie-signature');

class Session {
    // Session Core Data
    #id;
    #signed_id;
    #session_data = {};
    #wrapped_request;
    #session_engine;
    #prefixes = {
        duration: '__cust_dur',
    };

    // Session State Booleans
    #parsed_id = false;
    #ready = false;
    #from_database = false;
    #persist = false;
    #destroyed = false;

    constructor(session_engine, wrapped_request) {
        this.#session_engine = session_engine;
        this.#wrapped_request = wrapped_request;
    }

    /**
     * This method asynchronously generates a cryptographically random id
     *
     * @returns {Promise} Promise -> String
     */
    async generate_id() {
        return await this.#session_engine._methods.id();
    }

    /**
     * This method sets the current session's id to provided session_id.
     * Note! This method does not perform any verification on provided session_id
     * thus is not recommended to be used with any user provided data.
     *
     * @param {String} id
     * @returns {Session} Session (chainable)
     */
    set_id(session_id) {
        if (typeof session_id !== 'string') throw new Error('set_id(id) -> id must be a string');
        this.#id = session_id;
        this.#parsed_id = true;
        return this;
    }

    /**
     * This method sets the current session's id to provided signed session id.
     * Note! This method is recommended over .set_id() as this method will attempt to
     * unsign the the provided id and thus verifies input.
     *
     * @param {String} signed_id Signed Session ID
     * @param {String} secret Optional (Utilizes session_engine.secret by default)
     * @returns {Boolean} Boolean (true || false)
     */
    set_signed_id(signed_id, secret) {
        // Attempt to unsign provided id and secret with fallback to Session Engine secret
        let cookie_options = this.#session_engine._cookie_options;
        let final_secret = secret || cookie_options.secret;
        let unsigned_id = signature.unsign(signed_id, final_secret);
        if (unsigned_id === false) return false;

        // Set provided unsigned/signed_id to Session state
        this.#id = unsigned_id;
        this.#signed_id = signed_id;
        this.#parsed_id = true;
        return true;
    }

    /**
     * This method is used to update the duration of current session to a custom value in milliseconds.
     *
     * @param {Number} duration In Milliseconds
     * @returns {Session} Session (Chainable)
     */
    set_duration(duration) {
        if (typeof duration !== 'number')
            throw new Error(
                'HyperExpress: set_duration(duration) -> duration must be a number in milliseconds'
            );

        let prefix = this.#prefixes.duration;
        this.#session_data[prefix] = duration;
        this.#persist = true;
        return this;
    }

    /**
     * This method is used to start a session for incoming request.
     * Note! This method is asynchronous as it attempts to read session data
     * from specified 'read' event handler for session engine.
     *
     * @returns {Promise} Promise
     */
    async start() {
        // Ensure session has already not been started
        if (this.#ready) return;
        let engine_methods = this.#session_engine._methods;

        // Parse session id and treat current operation as a fresh session with a fresh id
        let session_id = this.id;
        if (typeof session_id !== 'string' || session_id.length == 0) {
            this.#id = await this.generate_id();
            this.#parsed_id = true;
            this.#ready = true;
            return; // Do not pull from database since this is a fresh session with a brand new id
        }

        // Trigger 'read' event in attempt to read session data for parsed id
        let session_data = await engine_methods.read(session_id);
        if (typeof session_data == 'object') {
            this.#from_database = true;
            this.#session_data = session_data;
        } else {
            this.#from_database = false;
        }

        // Mark session as ready for further operations
        this.#ready = true;
    }

    /**
     * Rolls current session's id to a new session id.
     * Note! This operation performs 2 underlying operations as it first
     * deletes old session and then persists session data under new session id.
     *
     * @returns {Promise} Promise -> Boolean (true || false)
     */
    async roll() {
        // Ensure session has been started & is ready
        if (this.#ready) {
            // Destroy old session if it is from database
            if (this.#from_database) await this.destroy();

            // Generate a new session id and allow post request persistance to handle migration
            this.#id = await this.generate_id();
            this.#signed_id = null; // Null cached signed id to force re-signing at persistance
            this.#parsed_id = true;
            this.#destroyed = false;
            this.#persist = true;
            this.#from_database = false;
            return true;
        }

        throw new Error('HyperExpress: You must first start() a session before calling .roll()');
    }

    /**
     * This method can be used to touch/update the current session's expiry timestamp in storage mechanism.
     *
     * @returns {Promise} Promise
     */
    async touch() {
        // Parse session id and trigger 'touch' event if upon a valid session id
        let session_id = this.id;
        if (typeof session_id !== 'string') return;

        let expiry_ts = this.expiry_timestamp;
        await this.#session_engine._methods.touch(session_id, expiry_ts);
    }

    /**
     * This method is used to destroy the current session.
     * Note! This method is asynchronous as it instantly triggers
     * the 'destroy' session engine event causing session to be deleted
     * from storage mechanism.
     *
     * @returns {Promise} Promise
     */
    async destroy() {
        // Do not attempt to destroy session if it has already been destroyed
        if (this.#destroyed) return true;

        // Retrieve session id and attempt to destroy session by triggering 'destroy' session engine event
        let session_id = this.id;
        if (typeof session_id !== 'string') return;
        await this.#session_engine._methods.destroy(session_id);
        this.#session_data = {};
        this.#destroyed = true; // Mark session as destroyed to unset session cookie during request end
    }

    /**
     * This method is used to store data values in current session.
     *
     * @param {String} name
     * @param {Any} value class based objects such as Date() are not supported due to string conversion
     * @returns {Session} Session (Chainable)
     */
    set(name, value) {
        // Check to ensure the key/value pair is changed and requires a persist request
        if (this.#session_data[name] !== value) {
            this.#session_data[name] = value;
            this.#persist = true;
        }

        return this;
    }

    /**
     * This method can be used to overwrite the whole session data object in one operation.
     *
     * @param {Object} data Object
     * @returns {Session} Session (Chainable)
     */
    set_all(data) {
        // Enforce Object type for input set_all data
        if (typeof data !== 'object' || data == null)
            throw new Error('HyperExpress: .set_all(data) -> data must be an Object with values.');

        // Overwrite all session data and mark for persistance
        this.#session_data = data;
        this.#persist = true;
        return this;
    }

    /**
     * This method is used to retrieve data values from current session.
     * Note! This method can only be used after session has been started.
     *
     * @param {String} name
     * @returns {Any} Any || undefined
     */
    get(name) {
        return this.#session_data[name];
    }

    /**
     * This method returns all data values from current session as an object.
     * Note! This method can only be used after session has been started.
     *
     * @returns {Object} Object
     */
    get_all() {
        return this.#session_data;
    }

    /**
     * This method is used to delete data values from current session.
     * Note! This method can only be used after session has been started.
     *
     * @param {String} name
     * @returns {Session} Session (Chainable)
     */
    delete(name) {
        // Check to ensure the deleted value actually exists and session requires persistance
        if (this.#session_data[name]) {
            delete this.#session_data[name];
            this.#persist = true;
        }

        return this;
    }

    /**
     * This method is used to delete all data values from curren session in one operation.
     *
     * @returns {Session} Session (Chainable)
     */
    delete_all() {
        // Retain custom duration value throughout cleaning process to retain custom duration state
        let prefix = this.#prefixes.duration;
        let custom_duration = this.get(prefix);
        this.#session_data = {};
        if (custom_duration) this.set(prefix, custom_duration);

        // Mark session for persistance
        this.#persist = true;
        return this;
    }

    /**
     * INTERNAL METHOD! This method is an internal method and should NOT be called manually.
     * This method is used to trigger post request session operations such as persisting/cleanup.
     *
     * @param {Response} wrapped_response Required
     * @param {Server} master_context Required
     */
    async _perform_closure(wrapped_response, master_context) {
        let wrapped_request = this.#wrapped_request;

        // Set proper set-cookie header depending on session state
        let cookie_options = this.#session_engine._cookie_options;
        if (this.#destroyed) {
            wrapped_response.delete_cookie(cookie_options.name);
        } else if (typeof this.#signed_id == 'string') {
            // Do not re-sign cookie if signed id value is already cached (faster)
            wrapped_response.cookie(
                cookie_options.name,
                this.#signed_id,
                this.duration,
                cookie_options,
                false
            );
        } else if (typeof this.#id == 'string') {
            // Sign and set session cookie in the scenario a cached signed session id is not found
            wrapped_response.cookie(cookie_options.name, this.#id, this.duration, cookie_options);
        }

        if (this.#destroyed) return; // Do not perform any persistance operations if session has been destroyed already

        // Catch any errors during the persistance process and report to catchall global handler
        try {
            let engine_methods = this.#session_engine._methods;
            let require_manual_touch = this.#session_engine._manual_touch;
            if (this.#persist) {
                // Persist session if session state is marked to persist
                await engine_methods.write(
                    this.#id,
                    this.#session_data,
                    this.expiry_timestamp,
                    this.#from_database
                );
            } else if (this.#from_database && require_manual_touch !== true) {
                // touch session unless manual touches are enabled
                await this.touch();
            }
        } catch (error) {
            master_context.error_handler(wrapped_request, wrapped_response, error);
        }
    }

    /* Session Getters */

    /**
     * This method is used to retrieve the session id from an incoming request.
     *
     * @returns {String} String OR undefined
     */
    get id() {
        // Return from cache if id has already been parsed once
        if (this.#parsed_id) return this.#id;

        // Attempt to parse and unsign session id from request cookie header
        let request_cookies = this.#wrapped_request.cookies;
        let cookie_options = this.#session_engine._cookie_options;
        let signed_cookie_id = request_cookies[cookie_options.name];
        if (signed_cookie_id) {
            // Unsign raw cookie value to verify signature
            let unsigned_value = this.#wrapped_request.unsign(
                signed_cookie_id,
                cookie_options.secret
            );

            // Store raw id and signed id locally for faster access in future operations
            if (unsigned_value !== false) {
                this.#id = unsigned_value;
                this.#signed_id = signed_cookie_id;
            }
        }

        // Mark session id as parsed for faster lookups
        this.#parsed_id = true;
        return this.#id;
    }

    /**
     * This method is an alias of .id() except it returns the raw signed id (parsed from cookie header)
     *
     * @returns {String} String or undefined
     */
    get signed_id() {
        // Check cache for faster lookup
        if (this.#signed_id) return this.#signed_id;

        // Retrieve's current session's id and signs it
        let unsigned_id = this.id;
        let cookie_options = this.#session_engine._cookie_options;
        if (unsigned_id && this.#signed_id == undefined)
            this.#signed_id = signature.sign(unsigned_id, cookie_options.secret);

        return this.#signed_id;
    }

    /**
     * Returns whether session is ready and its data has been retrieved.
     */
    get ready() {
        return this.#ready;
    }

    /**
     * Returns the current session's duration in milliseconds.
     */
    get duration() {
        let custom_duration = this.#session_data[this.#prefixes.duration];
        let default_duration = this.#session_engine._default_duration;
        return typeof custom_duration == 'number' ? custom_duration : default_duration;
    }

    /**
     * Returns the expiry timestamp in milliseconds of current session.
     */
    get expiry_timestamp() {
        return Date.now() + this.duration;
    }
}

module.exports = Session;
