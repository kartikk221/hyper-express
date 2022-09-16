const TimeCost = require('time-cost');

// Initialize costs for certain executions in HyperExpress
const MEASUREMENTS = {};
setInterval(() => {
    Object.keys(MEASUREMENTS).forEach((key) => {
        const measurement = MEASUREMENTS[key];
        if (measurement.data.length) console.log(key, measurement.statistics);
    });
}, 35000);

function MEASURE_COST(key) {
    // Return from cache
    if (MEASUREMENTS[key]) return MEASUREMENTS[key].record();

    // Create new cost measurement
    MEASUREMENTS[key] = new TimeCost();

    // Return cost measurement
    return MEASUREMENTS[key].record();
}

module.exports = MEASURE_COST;
