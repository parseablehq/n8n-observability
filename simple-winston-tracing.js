"use strict";

console.log("🔧 Initializing n8n with Winston logging to Parseable...");

try {
  // Basic OpenTelemetry for HTTP and database tracing
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const { resourceFromAttributes } = require("@opentelemetry/resources");
  const { SEMRESATTRS_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
  const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");

  // Initialize Winston logger
  const n8nLogger = require('/usr/local/lib/node_modules/n8n-winston-logger');
  
  // Common headers for Parseable
  const parseableHeaders = {
    'Authorization': `Basic ${Buffer.from(`${process.env.PARSEABLE_USERNAME}:${process.env.PARSEABLE_PASSWORD}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'X-P-Stream': 'otel-traces',
  };

  // Configure basic trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${process.env.PARSEABLE_URL}/v1/traces`,
    headers: parseableHeaders,
  });

  // Create resource
  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "n8n-comprehensive",
    'service.version': '1.107.4',
    'deployment.environment': process.env.NODE_ENV || 'production',
  });

  // Initialize basic SDK for HTTP/DB tracing
  const sdk = new NodeSDK({
    resource: resource,
    traceExporter: traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Only enable essential instrumentations
        '@opentelemetry/instrumentation-http': { 
          enabled: true,
          requestHook: (span, request) => {
            span.setAttributes({
              'n8n.http.user_agent': request.headers['user-agent'] || 'unknown',
              'n8n.http.url': request.url || 'unknown',
            });
          }
        },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        
        // Disable everything else
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-winston': { enabled: false }, // We'll handle Winston manually
      }),
    ],
  });

  // Start SDK
  sdk.start();
  console.log("✅ Basic OpenTelemetry tracing initialized");
  
  // Log successful initialization
  n8nLogger.info('n8n Winston logging initialized', {
    service: process.env.OTEL_SERVICE_NAME || 'n8n-comprehensive',
    parseable_url: process.env.PARSEABLE_URL,
    initialization_time: new Date().toISOString(),
  });

  // Test workflow execution logging
  setTimeout(() => {
    console.log("🧪 Testing workflow logging...");
    
    // Simulate workflow events
    const testWorkflowId = 'test-workflow-123';
    const testExecutionId = `exec-${Date.now()}`;
    
    n8nLogger.workflow.started(testWorkflowId, 'Test Workflow', testExecutionId, {
      trigger_type: 'manual',
      user: 'system',
    });
    
    setTimeout(() => {
      n8nLogger.workflow.completed(testWorkflowId, 'Test Workflow', testExecutionId, 1.5, {
        nodes_executed: 3,
        data_processed: 100,
      });
    }, 1000);
    
  }, 3000);

  // Export logger globally for n8n to use
  global.n8nLogger = n8nLogger;
  global.logWorkflow = n8nLogger.workflow;
  global.logNode = n8nLogger.node;
  global.logHttp = n8nLogger.http;

  console.log("✅ Winston logging globals exported");
  
} catch (error) {
  console.error("❌ Failed to initialize n8n logging:", error);
  console.log("⚠️  Continuing without enhanced logging...");
}
