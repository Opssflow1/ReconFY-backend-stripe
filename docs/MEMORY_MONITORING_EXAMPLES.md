# Memory Monitoring - Example Responses

## Example 1: Single User (Startup Phase)
```json
{
  "success": true,
  "memory": {
    "heapUsed": 34,
    "heapTotal": 37,
    "rss": 92,
    "external": 5,
    "usagePercent": 91.48,
    "threshold": 85.0,
    "criticalThreshold": 95.0,
    "isMonitoring": true,
    "environment": "production",
    "minHeapForAlerts": 100,
    "checkInterval": 60,
    "stats": {
      "totalChecks": 3,
      "highUsageAlerts": 0,
      "criticalAlerts": 0,
      "emergencyCleanups": 0,
      "falseAlarms": 2,
      "falseAlarmRate": 67
    }
  },
  "monitoring": {
    "healthScore": 70,
    "falseAlarmRate": 67,
    "isMonitoring": true,
    "environment": "production"
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

**Frontend Interpretation:**
- Status: "System Starting" (blue)
- Alert: No (heap < 100MB)
- Health: Good (70/100)
- Note: 67% false alarm rate is normal during startup

## Example 2: Multiple Users (Normal Operation)
```json
{
  "success": true,
  "memory": {
    "heapUsed": 450,
    "heapTotal": 600,
    "rss": 800,
    "external": 25,
    "usagePercent": 75.0,
    "threshold": 80.0,
    "criticalThreshold": 90.0,
    "isMonitoring": true,
    "environment": "production",
    "minHeapForAlerts": 100,
    "checkInterval": 60,
    "stats": {
      "totalChecks": 150,
      "highUsageAlerts": 2,
      "criticalAlerts": 0,
      "emergencyCleanups": 1,
      "falseAlarms": 5,
      "falseAlarmRate": 3
    }
  },
  "monitoring": {
    "healthScore": 95,
    "falseAlarmRate": 3,
    "isMonitoring": true,
    "environment": "production"
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

**Frontend Interpretation:**
- Status: "Healthy" (green)
- Alert: No (75% < 80% threshold)
- Health: Excellent (95/100)
- Note: Low false alarm rate indicates stable operation

## Example 3: High Load (Warning State)
```json
{
  "success": true,
  "memory": {
    "heapUsed": 1200,
    "heapTotal": 1500,
    "rss": 2000,
    "external": 50,
    "usagePercent": 80.0,
    "threshold": 80.0,
    "criticalThreshold": 90.0,
    "isMonitoring": true,
    "environment": "production",
    "minHeapForAlerts": 100,
    "checkInterval": 60,
    "stats": {
      "totalChecks": 500,
      "highUsageAlerts": 15,
      "criticalAlerts": 0,
      "emergencyCleanups": 8,
      "falseAlarms": 10,
      "falseAlarmRate": 2
    }
  },
  "monitoring": {
    "healthScore": 85,
    "falseAlarmRate": 2,
    "isMonitoring": true,
    "environment": "production"
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

**Frontend Interpretation:**
- Status: "High Usage" (orange)
- Alert: Yes (80% >= 80% threshold)
- Health: Good (85/100)
- Note: Legitimate high usage, system handling load

## Example 4: Critical State
```json
{
  "success": true,
  "memory": {
    "heapUsed": 2700,
    "heapTotal": 3000,
    "rss": 3500,
    "external": 100,
    "usagePercent": 90.0,
    "threshold": 80.0,
    "criticalThreshold": 90.0,
    "isMonitoring": true,
    "environment": "production",
    "minHeapForAlerts": 100,
    "checkInterval": 60,
    "stats": {
      "totalChecks": 1000,
      "highUsageAlerts": 50,
      "criticalAlerts": 5,
      "emergencyCleanups": 20,
      "falseAlarms": 15,
      "falseAlarmRate": 1
    }
  },
  "monitoring": {
    "healthScore": 60,
    "falseAlarmRate": 1,
    "isMonitoring": true,
    "environment": "production"
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

**Frontend Interpretation:**
- Status: "Critical" (red)
- Alert: Yes (90% >= 90% critical threshold)
- Health: Fair (60/100)
- Note: Critical memory usage, immediate attention needed

## Example 5: Development Environment
```json
{
  "success": true,
  "memory": {
    "heapUsed": 200,
    "heapTotal": 250,
    "rss": 400,
    "external": 15,
    "usagePercent": 80.0,
    "threshold": 85.0,
    "criticalThreshold": 95.0,
    "isMonitoring": true,
    "environment": "development",
    "minHeapForAlerts": 100,
    "checkInterval": 30,
    "stats": {
      "totalChecks": 50,
      "highUsageAlerts": 0,
      "criticalAlerts": 0,
      "emergencyCleanups": 0,
      "falseAlarms": 8,
      "falseAlarmRate": 16
    }
  },
  "monitoring": {
    "healthScore": 75,
    "falseAlarmRate": 16,
    "isMonitoring": true,
    "environment": "development"
  },
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

**Frontend Interpretation:**
- Status: "Healthy" (green)
- Alert: No (80% < 85% dev threshold)
- Health: Good (75/100)
- Note: Development environment with more lenient thresholds

## Error Response Example
```json
{
  "success": false,
  "error": "Failed to get memory statistics",
  "message": "Memory monitoring service unavailable",
  "timestamp": "2025-09-22T23:00:14.938Z"
}
```

## Frontend Status Logic Examples

### JavaScript Status Function
```javascript
function getMemoryStatus(response) {
  const { memory, monitoring } = response;
  
  // Error case
  if (!response.success) {
    return { status: 'error', color: 'red', message: 'Monitoring unavailable' };
  }
  
  // Startup phase
  if (memory.heapTotal < memory.minHeapForAlerts) {
    return { 
      status: 'startup', 
      color: 'blue', 
      message: 'System starting up',
      showAlert: false
    };
  }
  
  // Critical
  if (memory.usagePercent >= memory.criticalThreshold) {
    return { 
      status: 'critical', 
      color: 'red', 
      message: 'Critical memory usage',
      showAlert: true
    };
  }
  
  // Warning
  if (memory.usagePercent >= memory.threshold) {
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

### React Component Example
```jsx
function MemoryStatus({ memoryData }) {
  const status = getMemoryStatus(memoryData);
  const health = memoryData.monitoring.healthScore;
  
  return (
    <div className={`memory-status ${status.status}`}>
      <div className="status-indicator" style={{ color: status.color }}>
        {status.message}
      </div>
      
      <div className="memory-details">
        <div>Heap: {memoryData.memory.heapUsed}MB / {memoryData.memory.heapTotal}MB</div>
        <div>Usage: {memoryData.memory.usagePercent.toFixed(1)}%</div>
        <div>Health: {health}/100</div>
      </div>
      
      {memoryData.memory.stats.falseAlarmRate > 0 && (
        <div className="startup-notice">
          Startup phase - {memoryData.memory.stats.falseAlarmRate}% false alarms
        </div>
      )}
      
      {status.showAlert && (
        <div className="alert-banner">
          ⚠️ {status.message}
        </div>
      )}
    </div>
  );
}
```

## Testing Scenarios

### 1. Startup Testing
- Use Example 1 response
- Verify no alerts shown
- Check startup status display

### 2. Normal Operation Testing
- Use Example 2 response
- Verify healthy status
- Check health score display

### 3. High Load Testing
- Use Example 3 response
- Verify warning alert
- Check threshold logic

### 4. Critical State Testing
- Use Example 4 response
- Verify critical alert
- Check emergency handling

### 5. Error Handling Testing
- Use Error Response Example
- Verify error state display
- Check fallback behavior
