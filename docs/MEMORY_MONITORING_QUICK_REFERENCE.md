# Memory Monitoring - Quick Reference for Frontend Team

## 🚀 What Changed

**Before:** Fixed 75%/90% thresholds, constant false alarms
**Now:** Smart thresholds, false alarm detection, environment-aware

## 📊 Key Response Fields

### Essential Fields
```json
{
  "memory": {
    "heapUsed": 34,           // Current memory usage (MB)
    "heapTotal": 37,          // Total allocated memory (MB)
    "usagePercent": 91.48,    // Usage percentage
    "threshold": 85.0,        // High usage threshold
    "criticalThreshold": 95.0, // Critical threshold
    "environment": "production" // dev/production
  },
  "monitoring": {
    "healthScore": 70,        // System health (0-100)
    "falseAlarmRate": 67,     // False alarm percentage
    "isMonitoring": true      // Monitoring status
  }
}
```

## 🎯 Status Logic

```javascript
// Simple status determination
function getStatus(memory) {
  // Small heap = startup phase
  if (memory.heapTotal < 100) {
    return { status: 'startup', color: 'blue', alert: false };
  }
  
  // High usage
  if (memory.usagePercent >= memory.criticalThreshold) {
    return { status: 'critical', color: 'red', alert: true };
  }
  
  if (memory.usagePercent >= memory.threshold) {
    return { status: 'warning', color: 'orange', alert: true };
  }
  
  // Normal
  return { status: 'healthy', color: 'green', alert: false };
}
```

## 🏥 Health Score Guide

| Score | Status | Color | Meaning |
|-------|--------|-------|---------|
| 90-100 | Excellent | Green | System running optimally |
| 70-89 | Good | Yellow | Normal operation, minor issues |
| 50-69 | Fair | Orange | Some problems, monitoring needed |
| 0-49 | Poor | Red | Significant issues detected |

## 🚨 Alert Rules

### Show Alert When:
- `heapTotal >= 100MB` AND `usagePercent >= threshold`
- `healthScore < 50`

### Don't Show Alert When:
- `heapTotal < 100MB` (startup phase)
- `falseAlarmRate > 50%` (system learning)

## 📈 Expected Patterns

### Single User (Current)
- Heap: 30-100MB
- False Alarm Rate: 50-80%
- Health Score: 60-80
- Status: "System Starting"

### Multiple Users (Future)
- Heap: 200MB-1GB+
- False Alarm Rate: 0-10%
- Health Score: 90-100
- Status: "Normal Operation"

## 🎨 UI Recommendations

### Status Colors
- **Green:** Healthy operation
- **Blue:** Startup/initialization
- **Yellow:** Warning state
- **Red:** Critical state

### Display Elements
```jsx
<div className="memory-status">
  <div className="status-indicator" style={{color: status.color}}>
    {status.message}
  </div>
  <div className="memory-usage">
    {memory.heapUsed}MB / {memory.heapTotal}MB ({memory.usagePercent}%)
  </div>
  <div className="health-score">
    Health: {monitoring.healthScore}/100
  </div>
  {monitoring.falseAlarmRate > 0 && (
    <div className="startup-notice">
      System starting up - {monitoring.falseAlarmRate}% false alarms
    </div>
  )}
</div>
```

## 🔧 Environment Differences

| Environment | Thresholds | Check Interval | Behavior |
|-------------|------------|----------------|----------|
| Development | 85%/95% | 30s | More lenient, frequent checks |
| Production | 80%/90% | 60s | Stricter, less frequent checks |

## ⚡ Quick Implementation

```javascript
// Polling frequency
const POLL_INTERVAL = 30000; // 30 seconds

// Status check
const status = getStatus(response.memory);
if (status.alert) {
  showNotification(status.message, status.color);
}

// Health display
const health = response.monitoring.healthScore;
const healthColor = health >= 90 ? 'green' : health >= 70 ? 'yellow' : 'red';
```

## 🚫 What NOT to Do

- ❌ Don't show alerts for `heapTotal < 100MB`
- ❌ Don't panic about high `falseAlarmRate` during startup
- ❌ Don't use old 75%/90% thresholds
- ❌ Don't poll more frequently than 30 seconds

## ✅ What TO Do

- ✅ Use dynamic thresholds from response
- ✅ Show startup status for small heaps
- ✅ Display health score prominently
- ✅ Handle false alarm rate gracefully
- ✅ Use environment-aware logic

---

**Need Help?** Check the full documentation in `MEMORY_MONITORING_API.md`
