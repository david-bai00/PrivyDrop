module.exports = {
  apps: [
    {
      name: "signaling-server",
      cwd: "./backend",
      script: "./dist/server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        BACKEND_PORT: 3001,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/signaling-server-error.log",
      out_file: "/var/log/signaling-server-out.log",
      max_memory_restart: "500M",
      instances: 1,
      exec_mode: "fork",
      group: "ssl-cert",
    },
    {
      name: "privydrop-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "run start",
      watch: false,
      env: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/privydrop-frontend-error.log",
      out_file: "/var/log/privydrop-frontend-out.log",
    }
  ]
}; 