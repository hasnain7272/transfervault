module.exports = {
  apps: [
    {
      name: 'transfervault-daemon',
      script: './dist/index.js',
      cwd: './packages/daemon',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_file: './packages/daemon/.env',
      max_memory_restart: '1G',
      log_file: './logs/daemon.log',
      error_file: './logs/daemon-error.log',
      out_file: './logs/daemon-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
