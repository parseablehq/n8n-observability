FROM n8nio/n8n:latest

USER root

# Install simplified OpenTelemetry for basic tracing + Winston for logging
RUN npm install -g \
    @opentelemetry/api \
    @opentelemetry/sdk-node \
    @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http \
    @opentelemetry/resources \
    @opentelemetry/semantic-conventions \
    winston \
    winston-transport

# Copy simplified tracing configuration
COPY simple-winston-tracing.js /usr/local/lib/node_modules/tracing.js

# Copy Winston logger for n8n
COPY n8n-winston-logger.js /usr/local/lib/node_modules/n8n-winston-logger.js

# Copy entrypoint script
COPY docker-entrypoint-simple.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER node

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]
