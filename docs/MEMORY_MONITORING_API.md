# Memory Monitoring API Documentation

## Endpoint
```
GET /admin/memory-stats
```

**Authentication:** Requires admin authentication

## Response Format

The memory monitoring endpoint now returns comprehensive, intelligent memory statistics with environment-aware thresholds and smart alerting.

### Complete Response Structure

```json
{
  "success": true,
  "memory": {
    "heapUsed": 34,                    // Current heap usage in MB
    "heapTotal": 37,                   // Total heap allocated in MB
    "rss": 92,                         // Resident Set Size (physical memory) in MB
    "external": 5,                     // External memory (C++ objects) in MB
    "usagePercent": 91.48,             // Heap usage percentage
    "threshold": 85.0,                 // Current high usage threshold (%)
    "criticalThreshold": 95.0,         // Current critical usage threshold (%)
    "isMonitoring": true,              // Whether monitoring is active
    "environment": "production",       // Environment (development/production)
    "minHeapForAlerts": 100,          // Minimum heap size for alerts (MB)
    "checkInterval": 60,               // Monitoring check interval (seconds)
    "stats": {
      "totalChecks": 3,                // Total monitoring checks performed
      "highUsageAlerts": 0,            // Number of high usage alerts
      "criticalAlerts": 0,             // Number of critical alerts
      "emergencyCleanups": 0,          // Number of emergency cleanups
      "falseAlarms": 2,                // Number of false alarms detected
      "startTime": 1758581877256,      // Monitoring start timestamp
      "lastHeapSize": 36.8,            // Last recorded heap size (MB)
      "maxHeapSize": 65,               // Maximum heap size recorded (MB)
      "avgHeapSize": 46,               // Average heap size (MB)
      "heapSizeHistory": [             // Recent heap size history
        64.8,
        36.8,
        36.8
      ],
      "falseAlarmRate": 67             // False alarm rate percentage
    }
  },
  "monitoring": {
    "totalChecks": 3,                  // Total monitoring checks
    "highUsageAlerts": 0,              // High usage alerts
    "criticalAlerts": 0,               // Critical alerts
    "emergencyCleanups": 0,            // Emergency cleanups
    "falseAlarms": 2,                  // False alarms
    "startTime": 1758581877256,        // Start timestamp
    "lastHeapSize": 36.8,              // Last heap size
    "maxHeapSize": 65,                 // Max heap size
    "avgHeapSize": 46,                 // Average heap size
    "heapSizeHistory": [               // Heap size history
      64.8,
      36.8,
      36.8
    ],
    "uptime": 138,                     // Monitoring uptime (seconds)
    "uptimeFormatted": "2m 17s",       // Human-readable uptime
    "isMonitoring": true,              // Monitoring status
    "threshold": 85.0,                 // High usage threshold
    "criticalThreshold": 95.0,         // Critical threshold
    "environment": "production",       // Environment
    "checkInterval": 60,               // Check interval
    "minHeapForAlerts": 100,          // Min heap for alerts
    "falseAlarmRate": 67,              // False alarm rate
    "healthScore": 70                  // System health score (0-100)
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

## Key Changes from Previous Version

### 1. **Smart Thresholds**
- **Before:** Fixed 75%/90% thresholds
- **Now:** Dynamic thresholds based on environment and heap size
  - Development: 85%/95%
  - Production: 80%/90%
  - Small heaps (<200MB): +5% more lenient
  - Large heaps (>1GB): -5% more strict

### 2. **False Alarm Detection**
- **New Field:** `falseAlarms` and `falseAlarmRate`
- **Logic:** Alerts suppressed for heap sizes < 100MB
- **Benefit:** Eliminates false alarms during startup

### 3. **Environment Awareness**
- **New Field:** `environment` (development/production)
- **Impact:** Different monitoring behavior per environment
- **Check Interval:** 30s (dev) vs 60s (prod)

### 4. **Health Scoring**
- **New Field:** `healthScore` (0-100)
- **Calculation:** Based on false alarm rate, critical alerts, and cleanups
- **Usage:** Overall system health indicator

### 5. **Enhanced Statistics**
- **New Fields:** `maxHeapSize`, `avgHeapSize`, `heapSizeHistory`
- **Purpose:** Better understanding of memory patterns
- **Usage:** Trend analysis and capacity planning

## Frontend Implementation Guide

### 1. **Status Indicators**

```javascript
// Memory Status Logic
function getMemoryStatus(memoryData) {
  const { usagePercent, heapTotal, minHeapForAlerts, falseAlarmRate } = memoryData;
  
  // Small heap - likely false alarm
  if (heapTotal < minHeapForAlerts) {
    return {
      status: 'startup',
      color: 'blue',
      message: 'System starting up - monitoring active',
      showAlert: false
    };
  }
  
  // High usage
  if (usagePercent >= memoryData.criticalThreshold) {
    return {
      status: 'critical',
      color: 'red',
      message: 'Critical memory usage',
      showAlert: true
    };
  }
  
  if (usagePercent >= memoryData.threshold) {
    return {
      status: 'warning',
      color: 'orange',
      message: 'High memory usage',
      showAlert: true
    };
  }
  
  // Healthy
  return {
    status: 'healthy',
    color: 'green',
    message: 'Memory usage normal',
    showAlert: false
  };
}
```

### 2. **Health Score Display**

```javascript
// Health Score Logic
function getHealthScoreDisplay(healthScore) {
  if (healthScore >= 90) {
    return { color: 'green', label: 'Excellent', icon: '✅' };
  } else if (healthScore >= 70) {
    return { color: 'yellow', label: 'Good', icon: '⚠️' };
  } else if (healthScore >= 50) {
    return { color: 'orange', label: 'Fair', icon: '🔶' };
  } else {
    return { color: 'red', label: 'Poor', icon: '❌' };
  }
}
```

### 3. **Dashboard Widget Example**

```javascript
// React Component Example
function MemoryMonitoringWidget({ memoryData }) {
  const status = getMemoryStatus(memoryData.memory);
  const health = getHealthScoreDisplay(memoryData.monitoring.healthScore);
  
  return (
    <div className="memory-widget">
      <div className="status-indicator" style={{ color: status.color }}>
        {status.message}
      </div>
      
      <div className="memory-stats">
        <div>Heap: {memoryData.memory.heapUsed}MB / {memoryData.memory.heapTotal}MB</div>
        <div>Usage: {memoryData.memory.usagePercent.toFixed(1)}%</div>
        <div>RSS: {memoryData.memory.rss}MB</div>
      </div>
      
      <div className="health-score">
        <span className={health.color}>{health.icon} {health.label}</span>
        <span>Health Score: {memoryData.monitoring.healthScore}/100</span>
      </div>
      
      {memoryData.memory.stats.falseAlarmRate > 0 && (
        <div className="false-alarms">
          False Alarm Rate: {memoryData.memory.stats.falseAlarmRate}%
          <small>(Normal during startup)</small>
        </div>
      )}
    </div>
  );
}
```

### 4. **Alert Logic**

```javascript
// Alert Display Logic
function shouldShowAlert(memoryData) {
  const { memory, monitoring } = memoryData;
  
  // Don't show alerts for small heaps (startup phase)
  if (memory.heapTotal < memory.minHeapForAlerts) {
    return false;
  }
  
  // Show alerts for legitimate high usage
  if (memory.usagePercent >= memory.criticalThreshold) {
    return { level: 'critical', message: 'Critical memory usage detected' };
  }
  
  if (memory.usagePercent >= memory.threshold) {
    return { level: 'warning', message: 'High memory usage detected' };
  }
  
  return false;
}
```

## Environment-Specific Behavior

### Development Environment
- **Thresholds:** 85%/95% (more lenient)
- **Check Interval:** 30 seconds
- **False Alarms:** More common during development
- **Health Score:** May be lower due to frequent restarts

### Production Environment
- **Thresholds:** 80%/90% (more strict)
- **Check Interval:** 60 seconds
- **False Alarms:** Rare after startup
- **Health Score:** Should be 90+ in stable production

## Monitoring Best Practices

### 1. **Startup Phase (First 5-10 minutes)**
- Expect high false alarm rates (50-80%)
- Heap sizes typically 30-100MB
- Health scores may be 60-80
- **Action:** Show "System Starting" status

### 2. **Normal Operation**
- False alarm rate should be 0-10%
- Heap sizes 200MB-1GB depending on load
- Health scores should be 90-100
- **Action:** Show normal monitoring

### 3. **High Load**
- Legitimate high usage alerts
- Heap sizes 1GB+
- Health scores may drop to 70-90
- **Action:** Show appropriate warnings

## Error Handling

```javascript
// Error Response Format
{
  "success": false,
  "error": "Failed to get memory statistics",
  "message": "Error details",
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

## Rate Limiting

- **Endpoint:** Rate limited by admin middleware
- **Frequency:** Recommended polling every 30-60 seconds
- **Caching:** Consider caching responses for 10-15 seconds

## Security Notes

- **Authentication:** Requires admin privileges
- **Data Sensitivity:** Memory data is internal system information
- **Logging:** All memory monitoring events are logged

---

**Last Updated:** 2025-09-22
**Version:** 2.0 (Optimized Memory Monitoring)
