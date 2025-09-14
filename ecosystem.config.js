module.exports = {
  apps: [{
    name: 'opss-backend',
    script: 'index.js',
    instances: 'max',  // Use all CPU cores for clustering
    exec_mode: 'cluster',  // Enable clustering mode
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',  // Increased memory limit
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/opss-backend/error.log',
    out_file: '/var/log/opss-backend/out.log',
    log_file: '/var/log/opss-backend/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Performance optimizations
    listen_timeout: 10000,
    kill_timeout: 5000,
    health_check_grace_period: 3000,
    health_check_interval: 30000
  }]
};
