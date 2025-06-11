const sqlite3 = require('sqlite3').verbose();
const DB_PATH = './bbs.sqlite';

let db = null;

function initDb(callback) {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Error opening database", err.message);
      return callback(err);
    }
    console.log("Connected to the BBS SQLite database.");

    db.serialize(() => {
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            registration_date TEXT NOT NULL,
            role TEXT DEFAULT 'user' NOT NULL
        );
      `, (err) => {
        if (err) {
          console.error("Error creating users table", err.message);
          return callback(err);
        }
        console.log("Users table checked/created.");
      });

      // Create messages table
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER,
            user_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `, (err) => {
        if (err) {
          console.error("Error creating messages table", err.message);
          return callback(err);
        }
        console.log("Messages table checked/created.");

        // Create boards table
        db.run(`
          CREATE TABLE IF NOT EXISTS boards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT UNIQUE NOT NULL,
              description TEXT
          );
        `, (err) => {
          if (err) {
            console.error("Error creating boards table", err.message);
            return callback(err); // Propagate error
          }
          console.log("Boards table checked/created.");

          // Add default "General" board if it doesn't exist
          db.run(`
            INSERT INTO boards (name, description)
            SELECT 'General', 'General discussion and announcements'
            WHERE NOT EXISTS (SELECT 1 FROM boards WHERE name = 'General');
          `, function(err) { // Use function to access this.changes
            if (err) {
              console.error("Error inserting General board", err.message);
              // Don't necessarily stop DB init for this, but log it.
              // return callback(err);
            } else {
              if (this.changes > 0) {
                console.log("Default 'General' board inserted.");
              } else {
                console.log("'General' board already exists.");
              }
            }
            // This is the last step in this part of serialize, call callback if provided
            if (callback) {
              callback(null); // Signal success of initDb
            }
          });
        });
      }); // End of db.serialize
    }); // End of db.Database connection callback
  }); // End of db.Database call - THIS WAS A TYPO, should be }); for serialize, then }); for connect
}
// Corrected structure:
// function initDb(callback) {
//   db = new sqlite3.Database(DB_PATH, (errOpen) => {
//     if (errOpen) { /* handle open error */ return callback(errOpen); }
//     console.log("Connected...");
//     db.serialize(() => {
//       // users table
//       db.run(sqlUsers, (errUsers) => {
//         if (errUsers) { /* handle users error */ return callback(errUsers); }
//         console.log("Users table checked/created.");
//         // messages table
//         db.run(sqlMessages, (errMessages) => {
//           if (errMessages) { /* handle messages error */ return callback(errMessages); }
//           console.log("Messages table checked/created.");
//           // boards table
//           db.run(sqlBoards, (errBoards) => {
//             if (errBoards) { /* handle boards error */ return callback(errBoards); }
//             console.log("Boards table checked/created.");
//             // insert general board
//             db.run(sqlInsertGeneral, function(errInsert) {
//               if (errInsert) { /* handle insert error, but maybe not fatal */ }
//               console.log("General board checked/inserted.");
//               if (callback) callback(null); // SUCCESS
//             });
//           });
//         });
//       });
//     });
//   });
// }
// The original structure was problematic with callback placement. Let's fix the nesting.

// Corrected version of initDb
function initDbCorrected(callback) {
  db = new sqlite3.Database(DB_PATH, (errOpen) => {
    if (errOpen) {
      console.error("Error opening database", errOpen.message);
      return callback(errOpen);
    }
    console.log("Connected to the BBS SQLite database.");

    db.serialize(() => {
      // Create users table
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

        // Create messages table
        // Note: board_id FOREIGN KEY will be added if schema modification is done later.
        // For now, it's just an INTEGER.
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

          // Create boards table
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

            // Add default "General" board if it doesn't already exist
            db.run(`
              INSERT INTO boards (name, description)
              SELECT 'General', 'General discussion and announcements'
              WHERE NOT EXISTS (SELECT 1 FROM boards WHERE name = 'General');
            `, function(errInsert) { // Use function to access this.changes
              if (errInsert) {
                console.error("Error inserting General board", errInsert.message);
                // Not necessarily fatal for DB init, but good to know.
                // return callback(errInsert); // Decide if this should halt init
              } else {
                if (this.changes > 0) {
                  console.log("Default 'General' board inserted.");
                } else {
                  console.log("'General' board already exists.");
                }
              }
              // Create private_messages table
              db.run(`
                CREATE TABLE IF NOT EXISTS private_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    recipient_id INTEGER NOT NULL,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0, -- 0 for false, 1 for true
                    FOREIGN KEY (sender_id) REFERENCES users (id),
                    FOREIGN KEY (recipient_id) REFERENCES users (id)
                );
              `, (errPm) => {
                if (errPm) {
                  console.error("Error creating private_messages table", errPm.message);
                  return callback(errPm);
                }
                console.log("Private_messages table checked/created.");

                // Create file_areas table
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

                  // Add default "General Files" area
                  db.run(`
                    INSERT INTO file_areas (name, description)
                    SELECT 'General Files', 'Miscellaneous files and utilities'
                    WHERE NOT EXISTS (SELECT 1 FROM file_areas WHERE name = 'General Files');
                  `, function(errInsertFa) {
                    if (errInsertFa) {
                      console.error("Error inserting General Files area", errInsertFa.message);
                    } else {
                      if (this.changes > 0) console.log("Default 'General Files' area inserted.");
                      else console.log("'General Files' area already exists.");
                    }

                    // Create file_listings table
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

                      // This is now the final step
                      if (callback) {
                        callback(null); // Signal success of all initDb operations
                      }
                    });
                  });
                });
              });
            });
          });
        });
      });
    }); // End of db.serialize
  }); // End of db.Database connection
}
// Replace the old initDb with the corrected one for the diff
const originalInitDb = initDb; // Keep a reference if needed, or just overwrite
initDb = initDbCorrected;      // Overwrite with the corrected version

// Function to get the database instance
}

// Function to get the database instance
// Ensures that db is initialized before being used.
function getDb() {
  if (!db) {
    // This is a fallback, ideally initDb is called at startup.
    console.error("Database not initialized. Call initDb first.");
    // You could throw an error or attempt to initialize it here,
    // but for now, let's rely on server.js calling initDb.
    return null;
  }
  return db;
}

module.exports = {
  initDb,
  getDb, // Export getDb to be used by other modules
  // We don't export 'db' directly to encourage using getDb() after initDb()
};
