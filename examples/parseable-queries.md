# Parseable Query Examples

This document provides example queries for analyzing n8n observability data in Parseable.

## 📊 Log Analysis Queries

### Recent Workflow Activity
```sql
SELECT body, severity_text, time_unix_nano 
FROM "n8n-logs" 
WHERE body LIKE '%workflow%' 
ORDER BY time_unix_nano DESC 
LIMIT 20
```

### Error Analysis
```sql
SELECT body, severity_text, time_unix_nano, scope_name
FROM "n8n-logs" 
WHERE severity_text = 'ERROR' 
ORDER BY time_unix_nano DESC
LIMIT 10
```

### Workflow Execution Status
```sql
SELECT 
  body,
  time_unix_nano,
  CASE 
    WHEN body LIKE '%workflow_started%' THEN 'STARTED'
    WHEN body LIKE '%workflow_completed%' THEN 'COMPLETED'
    WHEN body LIKE '%workflow_failed%' THEN 'FAILED'
  END as status
FROM "n8n-logs"
WHERE body LIKE '%workflow_%'
ORDER BY time_unix_nano DESC
```

### Node Execution Performance
```sql
SELECT 
  body,
  severity_text,
  time_unix_nano
FROM "n8n-logs"
WHERE body LIKE '%node_%' 
  AND body LIKE '%duration%'
ORDER BY time_unix_nano DESC
```

## 🔍 Trace Analysis Queries

### HTTP Request Performance
```sql
SELECT 
  span_name,
  duration_nanos / 1000000 as duration_ms,
  status_code,
  start_time_unix_nano
FROM "otel-traces"
WHERE span_name LIKE '%http%'
ORDER BY duration_nanos DESC
LIMIT 10
```

### Database Operations
```sql
SELECT 
  span_name,
  duration_nanos / 1000000 as duration_ms,
  status_code
FROM "otel-traces"
WHERE span_name LIKE '%sql%' OR span_name LIKE '%postgres%'
ORDER BY start_time_unix_nano DESC
```

### Long Running Operations
```sql
SELECT 
  span_name,
  duration_nanos / 1000000 as duration_ms,
  status_code,
  start_time_unix_nano
FROM "otel-traces"
WHERE duration_nanos > 5000000000  -- > 5 seconds
ORDER BY duration_nanos DESC
```

## 📈 Metrics Analysis Queries

### Request Rate
```sql
SELECT 
  metric_name,
  COUNT(*) as request_count,
  AVG(CAST(gauge_value AS FLOAT)) as avg_value
FROM "otel-metrics"
WHERE metric_name LIKE '%request%'
GROUP BY metric_name
```

### Memory Usage Trends
```sql
SELECT 
  metric_name,
  gauge_value,
  time_unix_nano
FROM "otel-metrics"
WHERE metric_name LIKE '%memory%'
ORDER BY time_unix_nano DESC
LIMIT 50
```

## 🚨 Alert Queries

### High Error Rate
```sql
SELECT 
  COUNT(*) as error_count,
  COUNT(*) * 100.0 / (
    SELECT COUNT(*) 
    FROM "n8n-logs" 
    WHERE time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '5 minutes') * 1000000000)
  ) as error_percentage
FROM "n8n-logs"
WHERE severity_text = 'ERROR'
  AND time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '5 minutes') * 1000000000)
```

### Failed Workflows
```sql
SELECT 
  body,
  time_unix_nano
FROM "n8n-logs"
WHERE body LIKE '%workflow_failed%'
  AND time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour') * 1000000000)
ORDER BY time_unix_nano DESC
```

### Slow Database Operations
```sql
SELECT 
  span_name,
  duration_nanos / 1000000 as duration_ms
FROM "otel-traces"
WHERE (span_name LIKE '%sql%' OR span_name LIKE '%postgres%')
  AND duration_nanos > 1000000000  -- > 1 second
ORDER BY duration_nanos DESC
```

## 📊 Dashboard Queries

### Workflow Success Rate (Last 24 Hours)
```sql
WITH workflow_stats AS (
  SELECT 
    CASE 
      WHEN body LIKE '%workflow_completed%' THEN 'completed'
      WHEN body LIKE '%workflow_failed%' THEN 'failed'
    END as status
  FROM "n8n-logs"
  WHERE (body LIKE '%workflow_completed%' OR body LIKE '%workflow_failed%')
    AND time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000000000)
)
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM workflow_stats
WHERE status IS NOT NULL
GROUP BY status
```

### Top Workflow Types by Execution Count
```sql
SELECT 
  REGEXP_EXTRACT(body, 'workflow_name":"([^"]+)"') as workflow_name,
  COUNT(*) as execution_count
FROM "n8n-logs"
WHERE body LIKE '%workflow_started%'
  AND time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000000000)
GROUP BY workflow_name
ORDER BY execution_count DESC
LIMIT 10
```

### Average Execution Time by Hour
```sql
SELECT 
  EXTRACT(HOUR FROM TO_TIMESTAMP(time_unix_nano / 1000000000)) as hour,
  AVG(CAST(REGEXP_EXTRACT(body, 'duration_seconds":([0-9.]+)') AS FLOAT)) as avg_duration
FROM "n8n-logs"
WHERE body LIKE '%workflow_completed%'
  AND body LIKE '%duration_seconds%'
  AND time_unix_nano > (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000000000)
GROUP BY hour
ORDER BY hour
```

## 🔧 Advanced Queries

### Correlation: Errors with High Memory Usage
```sql
WITH error_times AS (
  SELECT time_unix_nano
  FROM "n8n-logs"
  WHERE severity_text = 'ERROR'
),
memory_at_errors AS (
  SELECT 
    m.gauge_value,
    m.time_unix_nano
  FROM "otel-metrics" m
  JOIN error_times e ON ABS(m.time_unix_nano - e.time_unix_nano) < 60000000000  -- within 1 minute
  WHERE m.metric_name LIKE '%memory%'
)
SELECT 
  AVG(CAST(gauge_value AS FLOAT)) as avg_memory_at_errors
FROM memory_at_errors
```

### Workflow Execution Funnel
```sql
WITH workflow_events AS (
  SELECT 
    REGEXP_EXTRACT(body, 'execution_id":"([^"]+)"') as execution_id,
    CASE 
      WHEN body LIKE '%workflow_started%' THEN 1
      WHEN body LIKE '%workflow_completed%' THEN 2
      WHEN body LIKE '%workflow_failed%' THEN 3
    END as stage,
    time_unix_nano
  FROM "n8n-logs"
  WHERE body LIKE '%workflow_%'
    AND body LIKE '%execution_id%'
)
SELECT 
  stage,
  CASE 
    WHEN stage = 1 THEN 'Started'
    WHEN stage = 2 THEN 'Completed'
    WHEN stage = 3 THEN 'Failed'
  END as stage_name,
  COUNT(DISTINCT execution_id) as unique_executions
FROM workflow_events
WHERE execution_id IS NOT NULL
GROUP BY stage
ORDER BY stage
```

## 📋 Query Templates

### Custom Time Range Template
```sql
-- Replace @start_time and @end_time with your values
SELECT body, severity_text, time_unix_nano 
FROM "n8n-logs" 
WHERE time_unix_nano BETWEEN @start_time AND @end_time
ORDER BY time_unix_nano DESC
```

### Filter by Workflow Template
```sql
-- Replace @workflow_id with your workflow ID
SELECT body, severity_text, time_unix_nano 
FROM "n8n-logs" 
WHERE body LIKE '%@workflow_id%'
ORDER BY time_unix_nano DESC
```

### Performance Threshold Template
```sql
-- Replace @threshold_ms with your threshold in milliseconds
SELECT 
  span_name,
  duration_nanos / 1000000 as duration_ms
FROM "otel-traces"
WHERE duration_nanos > (@threshold_ms * 1000000)
ORDER BY duration_nanos DESC
```

---

These queries provide a starting point for analyzing your n8n observability data. Adjust the time ranges, thresholds, and filters based on your specific monitoring needs.
