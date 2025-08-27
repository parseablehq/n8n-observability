# n8n Observability with Parseable

This repository provides a complete solution for monitoring n8n workflow automation with comprehensive observability using [Parseable](https://parseable.com) - an open-source, unified observability platform.

## 🎯 What This Provides

- **📊 Traces**: HTTP requests, database operations, and workflow execution spans
- **📈 Metrics**: Resource utilization, execution counts, and performance metrics  
- **📝 Logs**: Structured workflow logs, node execution logs, and error tracking
- **🔧 Easy Setup**: Docker Compose based deployment with minimal configuration

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   n8n       │───▶│ OpenTelemetry│───▶│ Parseable   │
│             │    │ Instrumentation  │ │             │
│ - Workflows │    │ - Winston Logs   │ │ - Traces    │
│ - Nodes     │    │ - HTTP Tracing   │ │ - Metrics   │
│ - Triggers  │    │ - DB Tracing     │ │ - Logs      │
└─────────────┘    └──────────────┘    └─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### 1. Clone and Setup

```bash
git clone https://github.com/parseablehq/n8n-observability.git
cd n8n-observability
```

### 2. Start the Stack

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f n8n
```

### 3. Access Services

- **n8n**: http://localhost:5678 (admin/admin)
- **Parseable**: http://localhost:8000 (admin/admin)

### 4. Verify Observability

1. Create a workflow in n8n
2. Execute the workflow
3. Check Parseable for traces, metrics, and logs:
   - `otel-traces` stream: Workflow execution traces
   - `otel-metrics` stream: Performance metrics
   - `n8n-logs` stream: Structured logs

## 📋 What's Included

### Core Files

- `docker-compose.yml` - Complete stack orchestration
- `Dockerfile` - Custom n8n image with observability
- `n8n-winston-logger.js` - Winston transport for structured logging
- `simple-winston-tracing.js` - OpenTelemetry setup
- `docker-entrypoint.sh` - Container initialization script

### Services

1. **n8n** - Workflow automation platform with observability
2. **Parseable** - Log analytics and observability backend  
3. **PostgreSQL** - n8n database backend

## 🔧 Configuration

### Environment Variables

Key variables in `docker-compose.yml`:

```yaml
# n8n Configuration
N8N_HOST: "localhost"
N8N_PORT: 5678
N8N_PROTOCOL: "http"
N8N_WINSTON_LOGGING: "true"

# Database
DB_TYPE: "postgresdb"
DB_POSTGRESDB_HOST: "postgres"
DB_POSTGRESDB_DATABASE: "n8n"

# Parseable Integration
PARSEABLE_URL: "http://parseable:8000"
PARSEABLE_USERNAME: "admin" 
PARSEABLE_PASSWORD: "admin"

# OpenTelemetry
OTEL_SERVICE_NAME: "n8n-comprehensive"
OTEL_EXPORTER_OTLP_ENDPOINT: "http://parseable:8000"
```

### Parseable Streams

The setup creates three streams automatically:

- **`n8n-logs`**: Structured application logs
- **`otel-traces`**: Execution traces and spans
- **`otel-metrics`**: Performance and resource metrics

## 📊 Observability Features

### Logs

**Workflow Events**:
```javascript
logger.workflow.started(workflowId, workflowName, executionId, metadata);
logger.workflow.completed(workflowId, workflowName, executionId, duration, metadata);
logger.workflow.failed(workflowId, workflowName, executionId, error, duration, metadata);
```

**Node Events**:
```javascript
logger.node.started(workflowId, executionId, nodeType, nodeName, metadata);
logger.node.completed(workflowId, executionId, nodeType, nodeName, duration, metadata);
logger.node.failed(workflowId, executionId, nodeType, nodeName, error, duration, metadata);
```

**HTTP Events**:
```javascript
logger.http.request(method, url, headers, metadata);
logger.http.response(method, url, statusCode, duration, metadata);
```

### Traces

Automatic instrumentation for:
- HTTP requests (incoming/outgoing)
- Database operations
- Workflow execution spans
- Node execution spans

### Metrics

Collected metrics include:
- Request counts and durations
- Database connection pools
- Memory and CPU usage
- Workflow execution statistics

## 🔍 Querying Data

### Sample Parseable Queries

**Recent Workflow Executions**:
```sql
SELECT body, severity_text, time_unix_nano 
FROM "n8n-logs" 
WHERE body LIKE '%workflow%' 
ORDER BY time_unix_nano DESC 
LIMIT 10
```

**Error Analysis**:
```sql
SELECT body, severity_text, time_unix_nano 
FROM "n8n-logs" 
WHERE severity_text = 'ERROR' 
ORDER BY time_unix_nano DESC
```

**Performance Traces**:
```sql
SELECT span_name, duration_nanos, status_code 
FROM "otel-traces" 
ORDER BY start_time_unix_nano DESC
```

## 🎛️ Customization

### Adding Custom Logging

Extend the Winston logger in `n8n-winston-logger.js`:

```javascript
// Add custom log methods
logger.custom = {
  event: (eventType, data) => {
    logger.info('Custom event', {
      event_type: eventType,
      ...data
    });
  }
};
```

### Adding Custom Instrumentation

Extend OpenTelemetry setup in `simple-winston-tracing.js`:

```javascript
// Add custom instrumentations
const { YourCustomInstrumentation } = require('your-instrumentation');

registerInstrumentations({
  instrumentations: [
    // ... existing instrumentations
    new YourCustomInstrumentation()
  ]
});
```

## 🐛 Troubleshooting

### Common Issues

**1. Logs not appearing in Parseable**
- Check container connectivity: `docker network ls`
- Verify Parseable is running: `docker-compose logs parseable`
- Check n8n logs: `docker-compose logs n8n`

**2. Authentication errors**
- Verify credentials in `docker-compose.yml`
- Check Parseable access: `curl -u admin:admin http://localhost:8000/api/v1/logstream`

**3. High memory usage**
- Adjust batch sizes in `n8n-winston-logger.js`
- Configure log retention in Parseable

### Debug Commands

```bash
# Check service health
docker-compose ps

# View real-time logs
docker-compose logs -f n8n
docker-compose logs -f parseable

# Test Parseable API
curl -u admin:admin http://localhost:8000/api/v1/logstream

# Check n8n database
docker exec -it n8n-postgres psql -U postgres -d n8n
```

## 🔐 Security Considerations

### Production Deployment

1. **Change Default Credentials**:
   ```yaml
   PARSEABLE_USERNAME: "your-username"
   PARSEABLE_PASSWORD: "your-secure-password"
   ```

2. **Use Environment Variables**:
   ```bash
   export PARSEABLE_PASSWORD=$(openssl rand -base64 32)
   ```

3. **Network Security**:
   - Use Docker networks for isolation
   - Configure firewall rules
   - Enable TLS/SSL for production

4. **Data Retention**:
   - Configure log rotation
   - Set retention policies
   - Monitor disk usage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request

## 📝 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [n8n](https://n8n.io/) - Workflow automation platform
- [Parseable](https://parseable.com/) - Log analytics platform  
- [OpenTelemetry](https://opentelemetry.io/) - Observability framework
- [Winston](https://github.com/winstonjs/winston) - Logging library

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/parseablehq/n8n-observability/issues)
- **Discussions**: [GitHub Discussions](https://github.com/parseablehq/n8n-observability/discussions)
- **Parseable Community**: [Discord](https://logg.ing/community)

---

⭐ **Star this repo** if you find it useful!
