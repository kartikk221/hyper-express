# HyperExpress v7 comparison gate

This gate compares the current checkout with the final pre-v7 foundation commit under Node.js 22. It independently measures a static GET, a route with eight precompiled synchronous middlewares, and a fixed-length JSON parse/response. For each scenario it alternates baseline and candidate measurements, reports median throughput and p95 latency from five runs, and exits nonzero when throughput regresses by more than 5% or p95 latency regresses by more than 10%.

Prepare the baseline once:

```sh
mkdir -p /tmp/hyper-express-v6-baseline
git archive fd25014 | tar -x -C /tmp/hyper-express-v6-baseline
```

Run the gate from the repository root:

```sh
fnm exec --using=22 npm run benchmark:v7
```

The optional environment variables `HYPER_EXPRESS_BENCHMARK_RUNS`, `HYPER_EXPRESS_BENCHMARK_DURATION_MS`, and `HYPER_EXPRESS_BENCHMARK_CONCURRENCY` control the repeated run count, duration, and client concurrency.
