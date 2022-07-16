## Benchmarks
Below benchmark results were derived using the **[autocannon](https://www.npmjs.com/package/autocannon)** HTTP benchmarking utility. The benchmark source code is included in this repository in the benchmarks folder.

#### CLI Command
This command simulates a high stress situation where **2500 unique visitors** visit your website at the same time and their browsers on average make **4 pipelined requests** per TCP connection sustained for **30 seconds**.
```
autocannon -c 2500 -d 30 -p 4 http://HOST:PORT/
```

### Environment Specifications
* __Machine:__ Ubuntu 21.04 | **1 vCPU** | **1GB Mem** | 32GB Nvme | **Vultr Compute Instance @ $6/Month**
* __Node:__ `v18.0.0`
* __Method:__ Two rounds; one to warm-up, one to measure
* __Response Body:__ Small HTML page with a dynamic timestamp generated with `Date`. See more in [HTML Test](../benchmarks/scenarios/simple_html_page.js).
* __Linux Optimizations:__ None.

### Benchmark Results
**Note!** these benchmarks should be **run over network for proper results** as running these benchmarks on localhost significantly strains the C++ to Javascript communications and class initializations performance due to near **no latency** in request times which is **unrealistic for real world scenarios**.

|                          | Version | Requests/s | Latency | Throughput/s |
| :--                      | --:     | :-:        | --:     | --:          |
| uWebsockets.js           | 20.8.0  | 196,544    | 464 ms  | 102 Mb/s     |
| HyperExpress             | 6.0.0   | 195,832    | 469 ms  | 101 Mb/s     |
| Fastify                  | 3.28.0  | 13,329     | 746 ms  | 8 Mb/s      |
| Express                  | 4.17.3  | 5,608      | 1821 ms | 3.7 Mb/s     |

### Running Benchmarks
To run benchmarks in your own environments, you may follow the steps below.
1. Clone the HyperExpress repository to your machine.
2. Run `npm install` in the root of the HyperExpress directory.
3. Run the `index.js` file in the `/benchmarks` directory to start all webservers on neighboring ports.
4. You may run the `autocannon` command provided above yourself manually from any remote instance or you may customize and run the `benchmarks.sh` file to receive benchmark results for each webserver.