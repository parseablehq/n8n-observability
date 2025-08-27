const winston = require('winston');
const Transport = require('winston-transport');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Parseable Winston Transport - Direct HTTP logging to Parseable
 * This sends structured logs directly to Parseable's log ingestion endpoint
 */
class ParseableTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    
    // Configuration
    this.parseableUrl = opts.parseableUrl || process.env.PARSEABLE_URL || 'http://parseable:8000';
    this.username = opts.username || process.env.PARSEABLE_USERNAME || 'admin';
    this.password = opts.password || process.env.PARSEABLE_PASSWORD || 'admin';
    this.streamName = opts.streamName || 'n8n-logs';
    this.batchSize = opts.batchSize || 5;
    this.flushInterval = opts.flushInterval || 3000; // 3 seconds
    
    // Internal state
    this.batch = [];
    this.timer = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // Create auth header
    this.authHeader = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    
    // Parse URL
    try {
      this.parsedUrl = new URL(this.parseableUrl);
      this.isHttps = this.parsedUrl.protocol === 'https:';
      this.httpModule = this.isHttps ? https : http;
    } catch (error) {
      console.error('❌ Invalid Parseable URL:', this.parseableUrl);
      this.httpModule = http;
    }
    
    // Start batch processing
    this.startBatchProcessor();
    
    console.log('✅ Parseable Winston Transport initialized');
    console.log(`   Stream: ${this.streamName}`);
    console.log(`   URL: ${this.parseableUrl}`);
    console.log(`   Batch size: ${this.batchSize}, Flush interval: ${this.flushInterval}ms`);
  }

  log(info, callback) {
    // Create structured log entry for Parseable
    const logEntry = {
      p_timestamp: new Date().toISOString(),
      level: info.level.toUpperCase(),
      message: info.message,
      service: 'n8n-comprehensive',
      logger: 'winston',
      ...this.extractMetadata(info)
    };

    this.batch.push(logEntry);
    
    if (this.batch.length >= this.batchSize) {
      this.flush();
    }

    if (callback) {
      setImmediate(callback);
    }
  }

  extractMetadata(info) {
    const metadata = {};
    
    for (const [key, value] of Object.entries(info)) {
      if (!['level', 'message', 'timestamp', Symbol.for('level'), Symbol.for('message')].includes(key)) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'object') {
            metadata[key] = JSON.stringify(value);
          } else {
            metadata[key] = String(value);
          }
        }
      }
    }
    
    return metadata;
  }

  startBatchProcessor() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    this.timer = setInterval(() => {
      if (this.batch.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  async flush() {
    if (this.batch.length === 0) return;
    
    const logsToSend = [...this.batch];
    this.batch = [];
    
    try {
      await this.sendToParseable(logsToSend);
      this.retryCount = 0; // Reset retry count on success
    } catch (error) {
      console.error(`❌ Failed to send ${logsToSend.length} logs to Parseable:`, error.message);
      
      // Simple retry logic
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.batch.unshift(...logsToSend.slice(-3)); // Keep last 3 for retry
        console.log(`🔄 Will retry sending logs (attempt ${this.retryCount}/${this.maxRetries})`);
      }
    }
  }

  sendToParseable(logs) {
    return new Promise((resolve, reject) => {
      // Format logs in OTLP format for Parseable /v1/logs endpoint
      const otlpPayload = {
        resourceLogs: [{
          resource: {
            attributes: [{
              key: "service.name",
              value: { stringValue: "n8n-comprehensive" }
            }]
          },
          scopeLogs: [{
            scope: {
              name: "winston",
              version: "3.0.0"
            },
            logRecords: logs.map(log => ({
              timeUnixNano: String(new Date(log.p_timestamp).getTime() * 1000000),
              severityText: log.level,
              body: {
                stringValue: log.message
              },
              attributes: Object.entries(log)
                .filter(([key]) => !['p_timestamp', 'level', 'message'].includes(key))
                .map(([key, value]) => ({
                  key,
                  value: { stringValue: String(value) }
                }))
            }))
          }]
        }]
      };
      
      const payload = JSON.stringify(otlpPayload);
      
      const options = {
        hostname: this.parsedUrl.hostname,
        port: this.parsedUrl.port || (this.isHttps ? 443 : 80),
        path: `/v1/logs`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': this.authHeader,
          'x-p-stream': this.streamName,
          'x-p-log-source': 'otel-logs'
        }
      };

      const req = this.httpModule.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`📤 Sent ${logs.length} logs to Parseable/${this.streamName} (${res.statusCode})`);
            resolve(responseData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.batch.length > 0) {
      this.flush();
    }
  }
}

/**
 * Create comprehensive n8n Winston logger
 */
function createN8nLogger() {
  const logger = winston.createLogger({
    level: process.env.N8N_LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      // Console transport for Docker logs
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      
      // Parseable transport for structured logging
      new ParseableTransport({
        level: process.env.N8N_LOG_LEVEL || 'info',
        parseableUrl: process.env.PARSEABLE_URL,
        username: process.env.PARSEABLE_USERNAME,
        password: process.env.PARSEABLE_PASSWORD,
        streamName: 'n8n-logs',
        batchSize: 3,
        flushInterval: 2000
      })
    ],
    exitOnError: false
  });

  // Add workflow-specific convenience methods
  logger.workflow = {
    started: (workflowId, workflowName, executionId, metadata = {}) => {
      logger.info('Workflow execution started', {
        event_type: 'workflow_started',
        workflow_id: workflowId,
        workflow_name: workflowName,
        execution_id: executionId,
        ...metadata
      });
    },
    
    completed: (workflowId, workflowName, executionId, duration, metadata = {}) => {
      logger.info('Workflow execution completed', {
        event_type: 'workflow_completed',
        workflow_id: workflowId,
        workflow_name: workflowName,
        execution_id: executionId,
        duration_seconds: duration,
        ...metadata
      });
    },
    
    failed: (workflowId, workflowName, executionId, error, duration, metadata = {}) => {
      logger.error('Workflow execution failed', {
        event_type: 'workflow_failed',
        workflow_id: workflowId,
        workflow_name: workflowName,
        execution_id: executionId,
        duration_seconds: duration,
        error_message: error.message,
        error_name: error.name,
        error_stack: error.stack,
        ...metadata
      });
    }
  };

  // Add node-specific convenience methods  
  logger.node = {
    started: (workflowId, executionId, nodeType, nodeName, metadata = {}) => {
      logger.debug('Node execution started', {
        event_type: 'node_started',
        workflow_id: workflowId,
        execution_id: executionId,
        node_type: nodeType,
        node_name: nodeName,
        ...metadata
      });
    },
    
    completed: (workflowId, executionId, nodeType, nodeName, duration, metadata = {}) => {
      logger.debug('Node execution completed', {
        event_type: 'node_completed',
        workflow_id: workflowId,
        execution_id: executionId,
        node_type: nodeType,
        node_name: nodeName,
        duration_seconds: duration,
        ...metadata
      });
    },
    
    failed: (workflowId, executionId, nodeType, nodeName, error, duration, metadata = {}) => {
      logger.error('Node execution failed', {
        event_type: 'node_failed',
        workflow_id: workflowId,
        execution_id: executionId,
        node_type: nodeType,
        node_name: nodeName,
        duration_seconds: duration,
        error_message: error.message,
        error_name: error.name,
        error_stack: error.stack,
        ...metadata
      });
    }
  };

  // Add HTTP request logging
  logger.http = {
    request: (method, url, headers = {}, metadata = {}) => {
      logger.info('HTTP request made', {
        event_type: 'http_request',
        http_method: method,
        http_url: url,
        http_headers: JSON.stringify(headers),
        ...metadata
      });
    },
    
    response: (method, url, statusCode, duration, metadata = {}) => {
      logger.info('HTTP response received', {
        event_type: 'http_response',
        http_method: method,
        http_url: url,
        http_status: statusCode,
        duration_seconds: duration,
        ...metadata
      });
    }
  };

  return logger;
}

// Create and export the logger
const n8nLogger = createN8nLogger();

console.log('🔧 n8n Winston Logger initialized');
console.log(`   Level: ${process.env.N8N_LOG_LEVEL || 'info'}`);
console.log(`   Parseable URL: ${process.env.PARSEABLE_URL}`);
console.log('   Features: workflow tracking, node execution, HTTP requests');

module.exports = n8nLogger;

// Make it globally available for easy access
global.n8nLogger = n8nLogger;
