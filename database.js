/**
 * @file Database initialization and management for the BBS.
 * Uses SQLite for data storage.
 */
const sqlite3 = require('sqlite3').verbose(); // Use verbose for more detailed stack traces on errors.
const DB_PATH = './bbs.sqlite'; // Defines the path to the SQLite database file.

/**
 * @type {sqlite3.Database | null}
 * Holds the singleton database connection instance. Initialized by initDb.
 */
let db = null;

/**
 * Initializes the SQLite database.
 * Creates necessary tables if they don't already exist and inserts default data.
 * This function should be called once at application startup.
 * The callback pattern is used here to ensure database setup completes before the application proceeds.
 *
 * @param {function(Error?): void} callback - A callback function that is called upon completion.
 *                                          It receives an error object if an error occurred, otherwise null.
 */
function initDb(callback) {
  // Open a new database connection. If the DB_PATH file doesn't exist, it's created.
  db = new sqlite3.Database(DB_PATH, (errOpen) => {
    if (errOpen) {
      console.error("Error opening database", errOpen.message);
      return callback(errOpen); // Critical error, pass to callback.
    }
    console.log("Connected to the BBS SQLite database.");

    // db.serialize ensures that database commands are executed in sequence.
    db.serialize(() => {
      // --- Users Table ---
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            registration_date TEXT NOT NULL,
            role TEXT DEFAULT 'user' NOT NULL
        );
      `, (errUsers) => {
        if (errUsers) {
          console.error("Error creating users table", errUsers.message);
          return callback(errUsers);
        }
        console.log("Users table checked/created.");

        // --- Messages Table ---
        db.run(`
          CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              board_id INTEGER,
              user_id INTEGER NOT NULL,
              body TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users (id)
          );
        `, (errMessages) => {
          if (errMessages) {
            console.error("Error creating messages table", errMessages.message);
            return callback(errMessages);
          }
          console.log("Messages table checked/created.");

          // --- Boards Table ---
          db.run(`
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT
            );
          `, (errBoards) => {
            if (errBoards) {
              console.error("Error creating boards table", errBoards.message);
              return callback(errBoards);
            }
            console.log("Boards table checked/created.");

            db.run(`
              INSERT INTO boards (name, description)
              SELECT 'General', 'General discussion and announcements'
              WHERE NOT EXISTS (SELECT 1 FROM boards WHERE name = 'General');
            `, function(errInsertBoard) {
              if (errInsertBoard) console.error("Error inserting General board", errInsertBoard.message);
              else if (this.changes > 0) console.log("Default 'General' board inserted.");
              else console.log("'General' board already exists.");

              // --- Private Messages Table ---
              db.run(`
                CREATE TABLE IF NOT EXISTS private_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    recipient_id INTEGER NOT NULL,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    FOREIGN KEY (sender_id) REFERENCES users (id),
                    FOREIGN KEY (recipient_id) REFERENCES users (id)
                );
              `, (errPm) => {
                if (errPm) {
                  console.error("Error creating private_messages table", errPm.message);
                  return callback(errPm);
                }
                console.log("Private_messages table checked/created.");

                // --- File Areas Table ---
                db.run(`
                  CREATE TABLE IF NOT EXISTS file_areas (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      name TEXT UNIQUE NOT NULL,
                      description TEXT
                  );
                `, (errFa) => {
                  if (errFa) {
                    console.error("Error creating file_areas table", errFa.message);
                    return callback(errFa);
                  }
                  console.log("File_areas table checked/created.");

                  db.run(`
                    INSERT INTO file_areas (name, description)
                    SELECT 'General Files', 'Miscellaneous files and utilities'
                    WHERE NOT EXISTS (SELECT 1 FROM file_areas WHERE name = 'General Files');
                  `, function(errInsertFa) {
                    if (errInsertFa) console.error("Error inserting General Files area", errInsertFa.message);
                    else if (this.changes > 0) console.log("Default 'General Files' area inserted.");
                    else console.log("'General Files' area already exists.");

                    // --- File Listings Table ---
                    db.run(`
                      CREATE TABLE IF NOT EXISTS file_listings (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          area_id INTEGER NOT NULL,
                          filename TEXT NOT NULL,
                          description TEXT,
                          uploader_user_id INTEGER NOT NULL,
                          upload_date TEXT NOT NULL,
                          download_count INTEGER DEFAULT 0,
                          FOREIGN KEY (area_id) REFERENCES file_areas (id),
                          FOREIGN KEY (uploader_user_id) REFERENCES users (id),
                          UNIQUE (area_id, filename)
                      );
                    `, (errFl) => {
                      if (errFl) {
                        console.error("Error creating file_listings table", errFl.message);
                        return callback(errFl);
                      }
                      console.log("File_listings table checked/created.");

                      // --- User Preferences Table ---
                      db.run(`
                        CREATE TABLE IF NOT EXISTS user_preferences (
                            user_id INTEGER PRIMARY KEY NOT NULL,
                            color_prompt TEXT,
                            color_username_output TEXT,
                            color_timestamp_output TEXT,
                            FOREIGN KEY (user_id) REFERENCES users (id)
                        );
                      `, (errUp) => {
                        if (errUp) {
                            console.error("Error creating user_preferences table", errUp.message);
                            return callback(errUp);
                        }
                        console.log("User_preferences table checked/created.");

                        // Final callback after all tables are processed
                        if (callback) callback(null);
                      }); // End user_preferences
                    }); // End file_listings
                  }); // End insert General Files area
                }); // End file_areas
              }); // End private_messages
            }); // End insert General board
          }); // End boards table
        }); // End messages table
      }); // End users table
    }); // End of db.serialize
  }); // End of db.Database connection
}


/**
 * Retrieves the singleton database connection instance.
 * It's crucial that initDb() has been called and successfully completed before calling getDb().
 *
 * @returns {sqlite3.Database | null} The database instance, or null if not initialized.
 */
function getDb() {
  if (!db) {
    console.error("Database not initialized. Call initDb first.");
    return null;
  }
  return db;
}

module.exports = {
  initDb,
  getDb,
};
