module.exports = {
  apps: [{
    name: "signaling-server",
    script: "./dist/server.js",  // 指向编译后的文件
    watch: false,
    env: {
      "NODE_ENV": "production",
      "PORT": 3001
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/var/log/signaling-server-error.log",
    out_file: "/var/log/signaling-server-out.log",
    max_memory_restart: "500M",
    instances: 1,
    exec_mode: "fork",
    group: "ssl-cert"  // 添加这行，指定进程运行的组
  }]
}