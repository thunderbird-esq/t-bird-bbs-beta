const chokidar = require("chokidar");
const build = require("./build");

chokidar
  .watch(["style.css", "build.js", "docs", "fonts", "icon", "scripts.js"], {
    usePolling: true,
  })
  .on("change", (file) => {
    console.log(
      `[${new Date().toLocaleTimeString()}] ${file} changed -- rebuilding...`
    );
    build();
  });

var liveServer = require("live-server");
const { startTelnetServer } = require("./telnetServer");
const express = require('express');
const cors = require('cors'); // Added CORS
const { createSession, processInput, getSession } = require('./bbsLogic');
const { initDb } = require('./database'); // Import initDb

// Initialize Database first
initDb((err) => {
  if (err) {
    console.error("Failed to initialize database. Exiting.", err);
    process.exit(1); // Exit if DB init fails
  } else {
    // Start servers only if DB is ready
    startServers();
  }
});

const app = express();
const EXPRESS_PORT = 3001; // Using a different port for Express API

app.use(cors()); // Use CORS middleware
app.use(express.json());

app.post('/api/command', (req, res) => {
  let { sessionId, command } = req.body;

  if (!sessionId || !getSession(sessionId)) {
    sessionId = createSession('web');
  }

  const bbsResponse = processInput(sessionId, command);
  res.json({ response: bbsResponse, sessionId: sessionId });
});

function startServers() {
  app.listen(EXPRESS_PORT, () => {
    console.log(`Express server listening on port ${EXPRESS_PORT}`);
  });

  // Keep live-server for static files and auto-reloading
  liveServer.start({ port: 3000, root: "./", file: "index.html" });
  startTelnetServer();
}
