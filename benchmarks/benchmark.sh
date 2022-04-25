# Define Execution Variables
HOST="localhost";
PORT_START=3000;
PORT_END=3004;
NUM_OF_CONNECTIONS=2500;
DURATION_SECONDS=30;
PIPELINE_FACTOR=4;

# Ensure "autocannon" is not installed, install it with NPM
if ! [ -x "$(command -v autocannon)" ]; then
  echo 'Error: autocannon is not installed. Attempting to install with NPM.';
    npm install autocannon -g;
fi

# Iterate a for loop from PORT_START to PORT_END
for ((PORT=$PORT_START; PORT<=$PORT_END; PORT++))
do
    # Execute the benchmark
    echo "Benchmarking Webserver @ Port: $HOST:$PORT";

    # Use the autocannon utility to benchmark
    autocannon -c $NUM_OF_CONNECTIONS -d $DURATION_SECONDS -p $PIPELINE_FACTOR http://localhost:$PORT/;

    # Append a visual line to separate results
    echo "----------------------------------------------------";
done