module.exports = {
  apps: [
    {
      name: "signaling-server",
      script: "./dist/server.js", // Point to the compiled file
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
      group: "ssl-cert", // Add this line to specify the group the process runs as
    },
  ],
};
