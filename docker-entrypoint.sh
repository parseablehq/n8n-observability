#!/bin/sh

# Set up environment variables for Parseable integration
export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-n8n}"
export PARSEABLE_URL="${PARSEABLE_URL:-http://parseable:8000}"
export PARSEABLE_USERNAME="${PARSEABLE_USERNAME:-admin}"
export PARSEABLE_PASSWORD="${PARSEABLE_PASSWORD:-admin}"

# Set NODE_PATH to include global modules
export NODE_PATH="/usr/local/lib/node_modules:$NODE_PATH"

# Create logs directory if it doesn't exist
mkdir -p /home/node/.n8n/logs

echo "🚀 Starting n8n with comprehensive observability..."
echo "📡 Parseable URL: $PARSEABLE_URL"
echo "👤 Service Name: $OTEL_SERVICE_NAME"
echo "📝 Log Level: ${N8N_LOG_LEVEL:-info}"
echo "📤 Log Output: ${N8N_LOG_OUTPUT:-console}"

# Initialize logging setup first, then tracing
echo "🔧 Initializing enhanced logging and tracing..."

# Start n8n with OpenTelemetry tracing (includes automatic Winston logging via instrumentation)
exec node --require /usr/local/lib/node_modules/tracing.js /usr/local/bin/n8n "$@"
