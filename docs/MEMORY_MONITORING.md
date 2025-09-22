# Memory Monitoring Documentation

## Overview

The ReconFY backend includes a comprehensive memory monitoring system designed to prevent memory leaks and optimize performance during file processing operations.

## Features

### 🧠 **Smart Memory Monitoring**
- **Environment-based thresholds**: Different settings for development, staging, and production
- **Intelligent alerting**: Prevents false positives with cooldown periods and minimum heap size checks
- **Real-time statistics**: Tracks memory usage, alerts, and cleanup operations

### 🔧 **Automatic Cleanup**
- **File buffer cleanup**: Automatically clears file buffers after processing
- **Garbage collection**: Forces GC when memory usage is high
- **Temp file management**: Cleans up temporary files and directories

### 📊 **Admin Dashboard Integration**
- **Memory stats endpoint**: `/admin/memory-stats` provides real-time memory information
- **Monitoring statistics**: Tracks total checks, alerts, and cleanup operations
- **Environment information**: Shows current configuration and thresholds

## Configuration

### Environment-Based Settings

| Environment | High Threshold | Critical Threshold | Check Interval | Alert Cooldown |
|-------------|----------------|-------------------|----------------|----------------|
| Development | 85% | 95% | 30s | 5min |
| Production  | 75% | 90% | 15s | 1min |

### Memory Limits

| Environment | Max Heap Size | Max File Size | Max Files |
|-------------|---------------|---------------|-----------|
| Development | 256MB | 10MB | 3 |
| Production  | 1024MB | 25MB | 5 |

## API Endpoints

### GET `/admin/memory-stats`

Returns comprehensive memory statistics:

```json
{
  "success": true,
  "memory": {
    "heapUsed": 34,
    "heapTotal": 43,
    "rss": 104,
    "external": 5,
    "usagePercent": 78.99,
    "threshold": 75,
    "criticalThreshold": 90,
    "minHeapSize": 100,
    "isMonitoring": true,
    "environment": "development",
    "stats": {
      "totalChecks": 318,
      "highUsageAlerts": 126,
      "criticalAlerts": 190,
      "emergencyCleanups": 316,
      "skippedChecks": 0,
      "startTime": 1758573356915
    }
  },
  "monitoring": {
    "totalChecks": 318,
    "highUsageAlerts": 126,
    "criticalAlerts": 190,
    "emergencyCleanups": 316,
    "skippedChecks": 0,
    "startTime": 1758573356915,
    "uptime": 4761,
    "uptimeFormatted": "1h 19m 21s",
    "isMonitoring": true,
    "threshold": 75,
    "criticalThreshold": 90,
    "minHeapSize": 100,
    "alertCooldown": 300000,
    "environment": "development"
  },
  "timestamp": "2025-09-22T21:55:18.081Z"
}
```

## Troubleshooting

### High Alert Counts

If you see high numbers of alerts with no actual operations:

1. **Check heap size**: Small heaps (< 100MB) cause false positives
2. **Verify environment**: Development mode has higher thresholds
3. **Review cooldown**: Alerts are throttled to prevent spam

### Memory Leaks

If memory usage continues to grow:

1. **Check file processing**: Ensure files are properly cleaned up
2. **Review temp files**: Verify temporary files are deleted
3. **Monitor garbage collection**: Check if GC is working properly

### Performance Issues

If monitoring affects performance:

1. **Adjust check interval**: Increase interval in development
2. **Review thresholds**: Raise thresholds if too sensitive
3. **Check cooldown**: Ensure alerts aren't too frequent

## Best Practices

### Development
- Use `npm run dev` for development with optimized memory settings
- Monitor logs for memory usage patterns
- Test with realistic file sizes

### Production
- Use `npm run start:prod` for production with higher memory limits
- Enable PM2 clustering for better memory distribution
- Monitor memory stats regularly via admin dashboard

### File Processing
- Always use `memoryCleanup.comprehensiveCleanup()` after file operations
- Clear file buffers immediately after processing
- Use appropriate file size limits for your environment

## Configuration Files

### `utils/memoryConfig.js`
Central configuration for all memory-related settings.

### `utils/memoryMonitor.js`
Main monitoring class with alerting and cleanup logic.

### `utils/memoryCleanup.js`
Utility functions for cleaning up memory after file processing.

### `package.json`
Node.js startup scripts with memory optimization flags.

### `ecosystem.config.js`
PM2 configuration for production clustering.

## Monitoring Commands

```bash
# Development with memory monitoring
npm run dev

# Production with optimized memory
npm run start:prod

# PM2 cluster mode
npm run start:cluster

# Check memory stats
curl https://api.myreconfy.com/admin/memory-stats
```

## Alert Types

### High Usage Alert
- Triggered when memory usage exceeds the high threshold
- Logs warning message
- Triggers emergency cleanup

### Critical Usage Alert
- Triggered when memory usage exceeds the critical threshold
- Logs error message
- Triggers aggressive cleanup

### Emergency Cleanup
- Forces garbage collection
- Clears file processing caches
- Logs cleanup results

## Integration

The memory monitoring system integrates with:

- **File processing routes**: Automatic cleanup after file operations
- **Admin dashboard**: Real-time memory statistics
- **Logging system**: Comprehensive memory usage logs
- **Error handling**: Memory-related error reporting

## Future Enhancements

- **Predictive monitoring**: Alert before memory issues occur
- **Memory profiling**: Detailed memory usage analysis
- **Automatic scaling**: Adjust resources based on memory usage
- **Historical tracking**: Long-term memory usage trends
