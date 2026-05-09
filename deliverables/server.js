const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize file-based SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Create tables if they do not exist
function initializeDatabase() {
  db.serialize(() => {
    // 1. Check and Migrate Users Table
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
      if (row && row.sql.includes('UNIQUE')) {
        console.log('Migrating users table to remove UNIQUE constraint...');
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          db.run(`
            CREATE TABLE users_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              roll_number TEXT NOT NULL
            )
          `);
          db.run('INSERT INTO users_new SELECT * FROM users');
          db.run('DROP TABLE users');
          db.run('ALTER TABLE users_new RENAME TO users');
          db.run('COMMIT');
          console.log('Migration complete.');
        });
      } else if (!row) {
        // Create table from scratch if it doesn't exist
        db.run(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll_number TEXT NOT NULL
          )
        `);
      }
    });

    // 2. Entries Table
    db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `, (err) => {
      if (err) console.error('Error creating entries table:', err.message);
    });
  });
}

/**
 * API Endpoint: POST /api/register-or-login
 * Description: Registers a student if their roll number is new, or logs them in.
 * Request Body: { name: "Alice", roll_number: "CS-2023-01" }
 */
app.post('/api/register-or-login', (req, res) => {
  const { name, roll_number } = req.body;

  if (!name || !roll_number) {
    return res.status(400).json({ error: 'Name and Roll Number are required' });
  }

  // Sanitize roll number (uppercase and trimmed)
  const cleanRollNumber = roll_number.trim().toUpperCase();
  const cleanName = name.trim();

  // Check if student exists
  db.get('SELECT * FROM users WHERE name = ? AND roll_number = ?', [cleanName, cleanRollNumber], (err, user) => {
    if (err) {
      console.error('Database query error:', err.message);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (user) {
      // User exists - log in. Let's make sure the name matches or update it (for ease, return the existing user)
      return res.status(200).json({
        success: true,
        message: 'Welcome back!',
        user: {
          id: user.id,
          name: user.name,
          roll_number: user.roll_number
        }
      });
    } else {
      // Create new user
      db.run(
        'INSERT INTO users (name, roll_number) VALUES (?, ?)',
        [cleanName, cleanRollNumber],
        function (err) {
          if (err) {
            console.error('Database insert error:', err.message);
            return res.status(500).json({ error: 'Failed to register student' });
          }

          return res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
              id: this.lastID,
              name: cleanName,
              roll_number: cleanRollNumber
            }
          });
        }
      );
    }
  });
});

/**
 * API Endpoint: POST /api/mark-entry
 * Description: Validates QR code and marks daily student entry once per calendar day.
 * Request Body: { user_id: 1, qr_code: "DEPT_ENTRY_001" }
 */
app.post('/api/mark-entry', (req, res) => {
  const { user_id, qr_code } = req.body;

  if (!user_id || !qr_code) {
    return res.status(400).json({ error: 'User ID and QR code value are required' });
  }

  // 1. Validate fixed QR code token
  const VALID_QR_CODE = 'DEPT_ENTRY_001';
  if (qr_code !== VALID_QR_CODE) {
    return res.status(400).json({ error: 'Invalid QR Code scanned.' });
  }

  // Check if the student ID exists
  db.get('SELECT * FROM users WHERE id = ?', [user_id], (err, user) => {
    if (err) {
      console.error('DB user lookup error:', err.message);
      return res.status(500).json({ error: 'Internal database query error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'Student registration not found' });
    }

    // 2. Prevent duplicate entries for same day (using local timezone of SQLite/server)
    // Checking if there is an entry for this user_id in the current local calendar day
    const checkQuery = `
      SELECT id FROM entries 
      WHERE user_id = ? 
      AND date(timestamp, 'localtime') = date('now', 'localtime')
    `;

    db.get(checkQuery, [user_id], (err, row) => {
      if (err) {
        console.error('DB check-in lookup error:', err.message);
        return res.status(500).json({ error: 'Database checking failed' });
      }

      if (row) {
        // Entry already exists today!
        return res.status(400).json({
          error: 'Entry already marked',
          message: 'You have already marked your entrance entry for today.'
        });
      }

      // 3. Save Entry with Timestamp
      db.run(
        'INSERT INTO entries (user_id) VALUES (?)',
        [user_id],
        function (err) {
          if (err) {
            console.error('DB entry insert error:', err.message);
            return res.status(500).json({ error: 'Failed to record entry' });
          }

          const entryId = this.lastID;

          // Fetch the saved entry to return its full timestamp and data
          db.get(
            `SELECT e.id, e.timestamp, u.name, u.roll_number 
             FROM entries e 
             JOIN users u ON e.user_id = u.id 
             WHERE e.id = ?`,
            [entryId],
            (err, entry) => {
              if (err) {
                console.error('Error fetching registered entry:', err.message);
                return res.status(201).json({
                  success: true,
                  message: 'Entry marked successfully',
                  entry: {
                    id: entryId,
                    user_id: user_id,
                    timestamp: new Date().toISOString()
                  }
                });
              }

              return res.status(201).json({
                success: true,
                message: 'Entry marked successfully',
                entry: {
                  id: entry.id,
                  user_id: user_id,
                  name: entry.name,
                  roll_number: entry.roll_number,
                  timestamp: entry.timestamp
                }
              });
            }
          );
        }
      );
    });
  });
});

/**
 * API Endpoint: POST /api/admin-login
 * Description: Securely authenticates admin using server-side environment variables.
 */
app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  
  // Use environment variables for secure credentials, with safe fallback for testing
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === validUsername && password === validPassword) {
    return res.status(200).json({ success: true, message: 'Authenticated' });
  } else {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
});

/**
 * API Endpoint: GET /api/entries
 * Description: Fetches all entry logs for the department admin dashboard (sorted by newest).
 */
app.get('/api/entries', (req, res) => {
  const query = `
    SELECT entries.id as entry_id, entries.timestamp, users.id as user_id, users.name, users.roll_number 
    FROM entries 
    JOIN users ON entries.user_id = users.id 
    ORDER BY entries.timestamp DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('DB fetch entries error:', err.message);
      return res.status(500).json({ error: 'Failed to query entries logs' });
    }

    res.status(200).json({
      success: true,
      count: rows.length,
      entries: rows
    });
  });
});

/**
 * API Endpoint: DELETE /api/entries
 * Description: Clears all entry logs from the database.
 */
app.delete('/api/entries', (req, res) => {
  db.run('DELETE FROM entries', (err) => {
    if (err) {
      console.error('DB delete entries error:', err.message);
      return res.status(500).json({ error: 'Failed to clear entries' });
    }
    res.status(200).json({ success: true, message: 'All entries cleared successfully' });
  });
});

// Auto-cleanup: Runs once a day to remove logs older than 30 days
setInterval(() => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffStr = thirtyDaysAgo.toISOString().replace('T', ' ').split('.')[0];
  
  db.run("DELETE FROM entries WHERE timestamp < ?", [cutoffStr], function(err) {
    if (!err && this.changes > 0) {
      console.log(`[Auto-Cleanup] Deleted ${this.changes} entries older than 30 days.`);
    }
  });
}, 24 * 60 * 60 * 1000); // 24 hours

// Simple diagnostics route
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    stats.total_students = row ? row.count : 0;
    
    db.get("SELECT COUNT(*) as count FROM entries WHERE date(timestamp, 'localtime') = date('now', 'localtime')", [], (err, row) => {
      stats.entries_today = row ? row.count : 0;
      
      res.json(stats);
    });
  });
});

// Fallback to serving the main entry page for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed SQLite database connection.');
    process.exit(0);
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`QR Student Entry System Backend Running!`);
  console.log(`Local Server: http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to terminate...`);
  console.log(`=========================================`);
});
