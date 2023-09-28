"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const operators_1 = require("./operators");
// wrap_object test
const sampleA = {
    i: 4
};
const sampleB = {
    a: 1,
    b: "me",
    c: [
        1, 2, 3
    ],
    d: {
        e: 4,
        f: "me",
        g: [
            {
                a: 4,
                b: 3
            }
        ]
    }
};
console.log("wrap_object test started");
console.log("before", sampleA, sampleB);
(0, operators_1.wrap_object)(sampleA, sampleB);
console.log("after", sampleA, sampleB);
console.log("wrap_object test done");
// parse_path_parameters
const route = "ddd/:id/:ev/:co";
const res = (0, operators_1.parse_path_parameters)(route);
console.log("parse_path_parameters test started");
console.log("ddd/:id/:ev/:co", res);
console.log("parse_path_parameters test done");
// parsePathParameters
const res2 = (0, operators_1.parsePathParameters)(route);
console.log("parsePathParameters test started");
console.log("ddd/:id/:ev/:co", res2);
console.log("parsePathParameters test done");
// array_buffer_to_string
const ab = new ArrayBuffer(8);
const view = new Int8Array(ab);
const str = 'qwertyuiopd';
for (const index of [...Array(ab.byteLength).keys()]) {
    view[index] = str.charCodeAt(index);
}
const abString = (0, operators_1.array_buffer_to_string)(ab);
console.log("array_buffer_to_string test started");
console.log(ab);
console.log(abString);
console.log("array_buffer_to_string test done");
(async function async_wait_test() {
    console.log("async_wait test started");
    const now = (new Date()).getTime();
    console.log(now);
    await (0, operators_1.async_wait)(5000);
    const later = (new Date()).getTime();
    console.log(later);
    console.log("async_wait test done");
})();
console.log("merge_relative_paths test started");
[
    { base_path: "/", new_path: "/" },
    { base_path: "api", new_path: "docs" },
    { base_path: "/", new_path: "docs" },
    { base_path: "api", new_path: "/" },
    { base_path: "api/", new_path: "docs" },
].forEach(({ base_path, new_path }) => console.log({ base_path, new_path, merged_paths: (0, operators_1.merge_relative_paths)(base_path, new_path) }));
console.log("merge_relative_paths test ended");
console.log("get_all_property_descriptors test started");
class Forest {
    constructor() {
        this.p1 = 8;
        this.p2 = 9;
    }
}
class Tree extends Forest {
    constructor(name, other) {
        super();
        this.name = name;
        this.trx = new TreeX(other);
    }
}
class TreeX {
    constructor(name) {
        this.name = name;
    }
}
console.log((0, operators_1.get_all_property_descriptors)(new Tree("timi", "adesina")));
console.log("get_all_property_descriptors test done");
//# sourceMappingURL=operators.test.js.map