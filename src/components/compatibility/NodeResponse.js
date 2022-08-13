'use strict';

class NodeResponse {
    /* Properties */
    get statusCode() {
        return this._status_code;
    }

    set statusCode(value) {
        this._status_code = value;
    }
}

module.exports = NodeResponse;
