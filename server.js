/**
 * @file Main server script for the BBS.
 * Initializes the database, starts the Express API server,
 * the Telnet server, and a live-server for static web assets.
 * Also includes Chokidar for watching file changes and rebuilding assets (primarily for system.css theme development).
 */

const chokidar = require("chokidar");
const build = require("./build"); // Script for building CSS and potentially other assets.

// Chokidar watches for file changes in specified paths and triggers a rebuild.
// This is mainly for development convenience, especially for the system.css theme.
chokidar
  .watch(["style.css", "build.js", "docs", "fonts", "icon", "scripts.js"], {
    usePolling: true, // Polling might be needed in some environments (e.g., Docker).
  })
  .on("change", (file) => {
    console.log(
      `[${new Date().toLocaleTimeString()}] ${file} changed -- rebuilding...`
    );
    build(); // Calls the build script.
  });

const liveServer = require("live-server"); // For serving static web client (index.html, etc.) with auto-reload.
const { startTelnetServer } = require("./telnetServer"); // Function to start the Telnet server.
const express = require('express');
const cors = require('cors'); // CORS middleware for Express.
// Import initializeGeneralBoardCache along with other bbsLogic functions
const { createSession, processInput, getSession, initializeGeneralBoardCache } = require('./bbsLogic');
const { initDb } = require('./database'); // Database initialization function.

/**
 * Main startup sequence.
 * Initializes the database, then the general board cache, and finally starts all servers.
 * Exits the process if critical initialization fails.
 */
async function main() {
  try {
    // 1. Initialize Database
    await new Promise((resolve, reject) => {
      initDb((err) => {
        if (err) {
          reject(err);
        } else {
          console.log("Database initialized successfully.");
          resolve();
        }
      });
    });

    // 2. Initialize General Board Cache (from bbsLogic.js)
    // This needs to happen after initDb ensures the 'boards' table exists.
    await initializeGeneralBoardCache();
    // initializeGeneralBoardCache logs its own success or critical failure.
    // If it were to throw an error for a missing 'General' board (and halt server),
    // this await would propagate it, and the catch block below would handle it.

    // 3. Start all servers
    startServers();

  } catch (error) {
    console.error("Critical error during server startup:", error);
    process.exit(1);
  }
}

// Call the main startup function.
main();


const app = express(); // Create an Express application.
const EXPRESS_PORT = process.env.API_PORT || 3001; // Port for the Express API server.

// --- Express Middleware Setup ---
app.use(cors());
app.use(express.json());

// --- Express API Routes ---
/**
 * @route POST /api/command
 * @description Endpoint for web clients to send commands to the BBS.
 * @async
 */
app.post('/api/command', async (req, res) => {
  let { sessionId, command } = req.body;

  if (!sessionId || !getSession(sessionId)) {
    try {
        // createSession is no longer async if setDefaultBoardForSession is fully synchronous from cache
        // However, keeping await here provides flexibility if createSession becomes async again.
        // Let's verify createSession's signature. It was changed to not be async.
        sessionId = createSession('web'); // createSession is now synchronous
    } catch (sessionError) {
        console.error("Error creating web session:", sessionError);
        return res.status(500).json({ error: "Failed to create session." });
    }
  }

  try {
    const bbsResponse = await processInput(sessionId, command);
    res.json({ response: bbsResponse, sessionId: sessionId });
  } catch (processingError) {
    console.error("Error processing API command:", processingError);
    res.status(500).json({ error: "Error processing command." });
  }
});

/**
 * Starts all the servers: Express API, live-server for static files, and Telnet server.
 */
function startServers() {
  app.listen(EXPRESS_PORT, () => {
    console.log(`BBS Express API server listening on port ${EXPRESS_PORT}`);
  });

  liveServer.start({
    port: process.env.WEB_PORT || 3000,
    root: "./",
    file: "index.html",
    open: false,
    wait: 500,
    logLevel: 2
  });
  console.log(`BBS Web client served on http://localhost:${process.env.WEB_PORT || 3000}`);

  startTelnetServer();
}
