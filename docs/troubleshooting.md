# Troubleshooting Guide

This guide helps you resolve common issues with the n8n observability setup.

## 🚨 Common Issues

### 1. Services Not Starting

**Symptom**: Docker containers fail to start or exit immediately

**Solutions**:

```bash
# Check service status
docker-compose ps

# View error logs
docker-compose logs parseable
docker-compose logs n8n
docker-compose logs postgres

# Check port conflicts
netstat -tulpn | grep -E ':(5678|8000|5432)'

# Restart with fresh containers
docker-compose down -v
docker-compose up -d --build
```

### 2. No Data in Parseable Streams

**Symptom**: Streams exist but contain no data

**Diagnosis**:
```bash
# Check if streams exist
curl -u admin:admin http://localhost:8000/api/v1/logstream

# Check n8n container logs for send confirmations
docker logs n8n 2>&1 | grep "📤 Sent"

# Test direct log sending
docker exec n8n node -e "
const logger = require('/usr/local/lib/node_modules/n8n-winston-logger.js');
logger.info('Test log', { test_id: 123 });
"
```

**Solutions**:

1. **Network Connectivity**:
   ```bash
   # Test network connectivity between containers
   docker exec n8n ping parseable
   
   # Check if Parseable is accessible from n8n
   docker exec n8n node -e "
   const http = require('http');
   const req = http.get('http://parseable:8000/api/v1/logstream', {
     auth: 'admin:admin'
   }, (res) => {
     console.log('Status:', res.statusCode);
     res.on('data', (data) => console.log(data.toString()));
   });
   req.on('error', (err) => console.error('Error:', err.message));
   "
   ```

2. **Authentication Issues**:
   ```bash
   # Test Parseable API access
   curl -u admin:admin http://localhost:8000/api/v1/logstream
   
   # If unauthorized, check credentials in docker-compose.yml
   grep -A 5 -B 5 "PARSEABLE_USERNAME\|PARSEABLE_PASSWORD" docker-compose.yml
   ```

3. **Winston Transport Issues**:
   ```bash
   # Check if Winston transport is initialized
   docker logs n8n 2>&1 | grep "Winston Transport initialized"
   
   # Check for batch sending
   docker logs n8n 2>&1 | grep "📤 Sent"
   ```

### 3. Authentication Failures

**Symptom**: "Unauthorized" errors when accessing Parseable

**Solutions**:

1. **Check Default Credentials**:
   ```bash
   # Verify credentials work
   curl -u admin:admin http://localhost:8000/api/v1/logstream
   
   # If changed, update docker-compose.yml
   ```

2. **Reset Parseable**:
   ```bash
   # Stop and remove Parseable data
   docker-compose stop parseable
   docker-compose rm parseable
   docker volume rm n8n-observability_parseable-data
   
   # Restart with fresh data
   docker-compose up -d parseable
   ```

### 4. High Memory Usage

**Symptom**: Containers consuming excessive memory

**Solutions**:

1. **Adjust Batch Sizes**:
   ```javascript
   // In n8n-winston-logger.js, reduce batch sizes:
   this.batchSize = opts.batchSize || 2; // Reduced from 5
   this.flushInterval = opts.flushInterval || 5000; // Increased interval
   ```

2. **Configure Log Retention**:
   ```bash
   # Add retention policy to docker-compose.yml
   environment:
     - P_LOG_RETENTION=7d  # Keep logs for 7 days
   ```

3. **Monitor Resource Usage**:
   ```bash
   # Check container resource usage
   docker stats
   
   # Check specific container
   docker stats n8n parseable postgres
   ```

### 5. Logs Not Appearing in Correct Stream

**Symptom**: Logs appear in wrong stream or not at all

**Diagnosis**:
```bash
# Check all streams
curl -u admin:admin http://localhost:8000/api/v1/logstream

# Check stream schema
curl -u admin:admin http://localhost:8000/api/v1/logstream/n8n-logs/info

# Query each stream for data
curl -X POST http://localhost:8000/api/v1/query \
  -u admin:admin \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) FROM \"n8n-logs\"","startTime":"2024-01-01T00:00:00Z","endTime":"2025-12-31T23:59:59Z"}'
```

**Solutions**:

1. **Check Stream Headers**:
   ```javascript
   // In n8n-winston-logger.js, verify headers:
   headers: {
     'Content-Type': 'application/json',
     'Authorization': this.authHeader,
     'x-p-stream': this.streamName,        // Must match target stream
     'x-p-log-source': 'otel-logs'        // Required for OTLP format
   }
   ```

2. **Verify OTLP Format**:
   ```bash
   # Check if logs are in OTLP format
   docker logs n8n 2>&1 | grep "resourceLogs"
   ```

### 6. Performance Issues

**Symptom**: Slow n8n response times or high CPU usage

**Solutions**:

1. **Optimize Instrumentation**:
   ```javascript
   // In simple-winston-tracing.js, disable unused instrumentations:
   registerInstrumentations({
     instrumentations: [
       new HttpInstrumentation(),
       // Comment out heavy instrumentations if not needed
       // new DatabaseInstrumentation(),
     ]
   });
   ```

2. **Adjust Sampling**:
   ```javascript
   // Add sampling to reduce trace volume:
   const sdk = new NodeSDK({
     // ... other config
     sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10% of traces
   });
   ```

3. **Increase Batch Intervals**:
   ```javascript
   // Reduce frequency of log shipping:
   this.flushInterval = 10000; // 10 seconds instead of 2
   ```

## 🔍 Diagnostic Commands

### Check Service Health
```bash
# All services status
docker-compose ps

# Service-specific health
docker-compose exec n8n curl -f http://localhost:5678/healthz || echo "n8n unhealthy"
docker-compose exec parseable curl -f http://localhost:8000/api/v1/about || echo "Parseable unhealthy"
```

### Network Diagnostics
```bash
# Check Docker networks
docker network ls
docker network inspect n8n-observability_default

# Test inter-container connectivity
docker exec n8n ping -c 3 parseable
docker exec n8n nc -zv parseable 8000
```

### Data Flow Testing
```bash
# Test full pipeline
docker exec n8n node -e "
const logger = require('/usr/local/lib/node_modules/n8n-winston-logger.js');
console.log('Sending test data...');
logger.info('Pipeline test', { 
  timestamp: new Date().toISOString(),
  test_type: 'full_pipeline',
  data: { key: 'value' }
});
setTimeout(() => console.log('Test complete'), 3000);
"

# Check if data arrived
sleep 5
curl -X POST http://localhost:8000/api/v1/query \
  -u admin:admin \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT body FROM \"n8n-logs\" WHERE body LIKE \"%pipeline_test%\" ORDER BY time_unix_nano DESC LIMIT 1"}'
```

### Log Analysis
```bash
# Check n8n startup sequence
docker logs n8n 2>&1 | grep -E "(Winston|OpenTelemetry|Parseable)"

# Check for errors
docker logs n8n 2>&1 | grep -i error

# Check successful log transmissions
docker logs n8n 2>&1 | grep "📤 Sent"

# Monitor real-time activity
docker logs n8n -f --tail 20
```

## 🛠️ Advanced Troubleshooting

### Debug Winston Transport
```bash
# Enable debug logging in n8n container
docker exec n8n node -e "
process.env.DEBUG = 'winston:*';
const logger = require('/usr/local/lib/node_modules/n8n-winston-logger.js');
logger.info('Debug test message');
"
```

### Check OpenTelemetry Setup
```bash
# Verify OTLP endpoints
docker exec n8n node -e "
console.log('OTLP Endpoint:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
console.log('Service Name:', process.env.OTEL_SERVICE_NAME);
"

# Test OTLP endpoint connectivity
docker exec n8n node -e "
const http = require('http');
const req = http.get('http://parseable:8000/v1/traces', (res) => {
  console.log('OTLP endpoint status:', res.statusCode);
});
req.on('error', (err) => console.error('OTLP endpoint error:', err.message));
"
```

### Database Connectivity
```bash
# Test n8n database connection
docker exec n8n-postgres psql -U postgres -d n8n -c "SELECT COUNT(*) FROM pg_stat_activity;"

# Check if n8n can connect to database
docker logs n8n 2>&1 | grep -E "(database|postgres)" | tail -10
```

## 🚨 Recovery Procedures

### Complete Reset
```bash
# Stop all services
docker-compose down -v

# Remove all data volumes
docker volume ls | grep n8n-observability | awk '{print $2}' | xargs docker volume rm

# Remove networks
docker network ls | grep n8n-observability | awk '{print $2}' | xargs docker network rm

# Rebuild and start fresh
docker-compose build --no-cache
docker-compose up -d
```

### Partial Reset (Keep n8n Data)
```bash
# Stop only observability services
docker-compose stop parseable

# Remove observability data
docker volume rm n8n-observability_parseable-data

# Restart observability stack
docker-compose up -d parseable
```

### Export Data Before Reset
```bash
# Export n8n workflows
docker exec n8n-postgres pg_dump -U postgres -d n8n > n8n_backup.sql

# Export Parseable logs (if needed)
curl -X POST http://localhost:8000/api/v1/query \
  -u admin:admin \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM \"n8n-logs\""}' > parseable_logs.json
```

## 📞 Getting Help

If you continue experiencing issues:

1. **Check Logs**: Always start with `docker-compose logs`
2. **GitHub Issues**: [Report issues](https://github.com/parseablehq/n8n-observability/issues) with:
   - Docker version: `docker --version`
   - Docker Compose version: `docker-compose --version`
   - Error logs from affected containers
   - Steps to reproduce the issue

3. **Community Support**: 
   - [Parseable Discord](https://discord.gg/parseable)
   - [n8n Community Forum](https://community.n8n.io/)

Remember to include relevant log excerpts and system information when asking for help!
