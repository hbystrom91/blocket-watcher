module.exports = {
  apps: [
    {
      name: "watcher",
      script: "server.js",
      node_args: "-r dotenv/config",
      error_file: "err.log",
      out_file: "out.log",
      log_file: "combined.log",
    },
  ],
};
