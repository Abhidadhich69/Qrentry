export const codePackageJSON = `{
  "name": "qr-student-entry-backend",
  "version": "1.0.0",
  "description": "QR-based student entry system with Express and SQLite3",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "keywords": [
    "qr-code",
    "attendance",
    "express",
    "sqlite3",
    "entry-system"
  ],
  "author": "Department Developer",
  "license": "MIT",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "sqlite3": "^5.1.7"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}`;

export const codeServerJS = `const express = require('express');
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
    // 1. Users Table
    db.run(\`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        roll_number TEXT UNIQUE NOT NULL
      )
    \`, (err) => {
      if (err) console.error('Error creating users table:', err.message);
    });

    // 2. Entries Table
    db.run(\`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    \`, (err) => {
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
  db.get('SELECT * FROM users WHERE roll_number = ?', [cleanRollNumber], (err, user) => {
    if (err) {
      console.error('Database query error:', err.message);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (user) {
      // User exists - log in. Let's return the existing user.
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
    const checkQuery = \`
      SELECT id FROM entries 
      WHERE user_id = ? 
      AND date(timestamp, 'localtime') = date('now', 'localtime')
    \`;

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
            \`SELECT e.id, e.timestamp, u.name, u.roll_number 
             FROM entries e 
             JOIN users u ON e.user_id = u.id 
             WHERE e.id = ?\`,
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
 * API Endpoint: GET /api/entries
 * Description: Fetches all entry logs for the department admin dashboard.
 */
app.get('/api/entries', (req, res) => {
  const query = \`
    SELECT entries.id as entry_id, entries.timestamp, users.id as user_id, users.name, users.roll_number 
    FROM entries 
    JOIN users ON entries.user_id = users.id 
    ORDER BY entries.timestamp DESC
  \`;

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

// Diagnostics route
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

// Start listening
app.listen(PORT, () => {
  console.log(\`=========================================\`);
  console.log(\`QR Student Entry System Backend Running!\`);
  console.log(\`Local Server: http://localhost:\${PORT}\`);
  console.log(\`=========================================\`);
});`;

export const codeIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Student Entry System - Dept of Computer Science</title>
  <link rel="stylesheet" href="style.css">
  <!-- Import Html5Qrcode Library from CDN for camera scanning -->
  <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
</head>
<body>

  <div class="app-container">
    <header class="main-header">
      <div class="dept-brand">
        <div class="dept-logo">🏛️</div>
        <div>
          <h1>Computer Science Department</h1>
          <p class="subtitle">QR-Based Student Entry Portal</p>
        </div>
      </div>
      
      <nav class="view-tabs">
        <button id="tab-student" class="tab-btn active" onclick="switchView('student')">📱 Student Portal</button>
        <button id="tab-admin" class="tab-btn" onclick="switchView('admin')">🔑 Admin Dashboard</button>
      </nav>
    </header>

    <main class="content-area">
      <!-- STUDENT VIEW -->
      <section id="student-view" class="view-pane active">
        <div class="mobile-frame">
          
          <!-- SCREEN 1: LOGIN -->
          <div id="screen-login" class="screen active">
            <div class="form-header">
              <h2>Student Identification</h2>
              <p>Please enter your credentials to proceed to the entry scanner.</p>
            </div>
            
            <form id="login-form" onsubmit="handleLogin(event)">
              <div class="form-group">
                <label for="student-name">Full Name</label>
                <input type="text" id="student-name" placeholder="e.g. John Doe" required>
              </div>
              
              <div class="form-group">
                <label for="student-roll">Roll Number (Unique ID)</label>
                <input type="text" id="student-roll" placeholder="e.g. CS-2023-042" required>
                <small class="help-text">Use format: DEPT-YEAR-ID (e.g. CS-2023-005)</small>
              </div>

              <button type="submit" class="btn btn-primary">Continue to Scanner ➡️</button>
            </form>
          </div>

          <!-- SCREEN 2: SCAN -->
          <div id="screen-scan" class="screen">
            <div class="scan-header">
              <button class="btn-back" onclick="goToScreen('login')">⬅️ Back</button>
              <div class="user-chip">
                <span>Student: <strong id="user-display-name">...</strong> (<span id="user-display-roll">...</span>)</span>
              </div>
            </div>

            <div class="scan-body">
              <h3>Scan Entrance QR Code</h3>
              <p class="scan-instruction">Align the official department entrance QR poster inside the box below.</p>
              
              <div class="scanner-wrapper">
                <div id="qr-reader"></div>
                <div class="scanner-overlay" id="scanner-line">
                  <div class="laser-line"></div>
                </div>
              </div>

              <div class="scanner-controls">
                <button id="btn-toggle-scan" class="btn btn-secondary" onclick="toggleCameraScanner()">
                  Start Camera Scanner 📷
                </button>
              </div>

              <div class="simulator-box">
                <p>No webcam? Or testing on a desktop?</p>
                <button class="btn btn-accent" onclick="simulateSuccessfulScan()">
                  ⚡ Quick Simulate Scan (DEPT_ENTRY_001)
                </button>
              </div>
            </div>
          </div>

          <!-- SCREEN 3: SUCCESS -->
          <div id="screen-success" class="screen">
            <div class="result-card success">
              <div class="result-icon">✅</div>
              <h2>Entry Marked Successfully!</h2>
              <div class="result-details">
                <p>Your entry is registered in the department logs.</p>
                <div class="receipt">
                  <div class="receipt-row"><span>Name:</span><strong id="success-name">John Doe</strong></div>
                  <div class="receipt-row"><span>Course:</span><strong id="success-roll">CS-2023-042</strong></div>
                  <div class="receipt-row"><span>Timestamp:</span><span id="success-time">10:45 AM</span></div>
                  <div class="receipt-row"><span>Token:</span><code>DEPT_ENTRY_001</code></div>
                </div>
              </div>
              <button class="btn btn-primary" onclick="resetStudentPortal()">Done / Sign Out</button>
            </div>
          </div>

          <!-- SCREEN 4: ERROR -->
          <div id="screen-error" class="screen">
            <div class="result-card error">
              <div class="result-icon">❌</div>
              <h2 id="error-title">Entry Refused</h2>
              <p id="error-message">Entry already marked for today.</p>
              <div class="result-details" id="error-details"></div>
              <div class="button-group">
                <button class="btn btn-secondary" onclick="goToScreen('scan')">🔄 Scan Again</button>
                <button class="btn btn-border" onclick="resetStudentPortal()">🚪 Exit</button>
              </div>
            </div>
          </div>

        </div>
      </section>

      <!-- ADMIN VIEW -->
      <section id="admin-view" class="view-pane">
        <div class="admin-panel">
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-icon">👥</div>
              <div class="metric-info">
                <h3>Total Registrations</h3>
                <p class="metric-val" id="metric-users">-</p>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon">📅</div>
              <div class="metric-info">
                <h3>Entries Today</h3>
                <p class="metric-val highlight" id="metric-entries-today">-</p>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon">⏰</div>
              <div class="metric-info">
                <h3>Status</h3>
                <p class="metric-val text-green">Online</p>
              </div>
            </div>
          </div>

          <div class="panel-header">
            <div class="panel-title-group">
              <h2>Department Entry Logs</h2>
              <p>Real-time list of all students currently checked in.</p>
            </div>
            <div class="panel-actions">
              <input type="text" id="admin-search" placeholder="🔍 Search Roll No or Name..." oninput="filterAdminLogs()">
              <button class="btn btn-secondary btn-sm" onclick="fetchEntries()">🔄 Refresh Logs</button>
              <button class="btn btn-accent btn-sm" onclick="exportToCSV()">📤 Export CSV</button>
            </div>
          </div>

          <div class="table-container">
            <table id="logs-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Student Name</th>
                  <th>Roll Number</th>
                  <th>Check-In Time</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="logs-tbody">
                <tr>
                  <td colspan="6" class="td-loading">No entries. Log in as student to begin.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <p>&copy; 2026 Department of Computer Science. Built for Academic Administration.</p>
    </footer>
  </div>

  <script src="script.js"></script>
</body>
</html>`;

export const codeScriptJS = `// Core State Variables
let currentUser = null;
let qrScanner = null;
let isScanning = false;
let apiLogsCache = [];

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('qr_student_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      setupScanScreen();
    } catch (e) {
      localStorage.removeItem('qr_student_user');
    }
  }
  fetchEntries();
  fetchStats();
});

function switchView(view) {
  document.getElementById('tab-student').classList.remove('active');
  document.getElementById('tab-admin').classList.remove('active');
  document.getElementById('student-view').classList.remove('active');
  document.getElementById('admin-view').classList.remove('active');

  if (view === 'student') {
    document.getElementById('tab-student').classList.add('active');
    document.getElementById('student-view').classList.add('active');
  } else if (view === 'admin') {
    document.getElementById('tab-admin').classList.add('active');
    document.getElementById('admin-view').classList.add('active');
    fetchEntries();
    fetchStats();
  }
}

function goToScreen(screenId) {
  document.querySelectorAll('.mobile-frame .screen').forEach(screen => {
    screen.classList.remove('active');
  });

  if (screenId !== 'scan' && isScanning) {
    stopCameraScanner();
  }

  const targetScreen = document.getElementById(\`screen-\${screenId}\`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const name = document.getElementById('student-name').value.trim();
  const roll_number = document.getElementById('student-roll').value.trim();

  try {
    const response = await fetch(\`\${API_BASE}/register-or-login\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, roll_number })
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Failed to login');

    currentUser = data.user;
    localStorage.setItem('qr_student_user', JSON.stringify(currentUser));
    setupScanScreen();
    goToScreen('scan');
  } catch (error) {
    alert(\`Error: \${error.message}\`);
  }
}

function setupScanScreen() {
  if (!currentUser) return;
  document.getElementById('user-display-name').innerText = currentUser.name;
  document.getElementById('user-display-roll').innerText = currentUser.roll_number;
}

async function toggleCameraScanner() {
  const toggleBtn = document.getElementById('btn-toggle-scan');
  const laserLine = document.getElementById('scanner-line');

  if (isScanning) {
    await stopCameraScanner();
    toggleBtn.innerText = 'Start Camera Scanner 📷';
    toggleBtn.classList.remove('btn-danger');
    toggleBtn.classList.add('btn-secondary');
    laserLine.style.display = 'none';
  } else {
    qrScanner = new Html5Qrcode("qr-reader");
    toggleBtn.innerText = 'Initializing Camera...';
    toggleBtn.disabled = true;

    try {
      await qrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => handleMarkEntry(decodedText)
      );
      isScanning = true;
      toggleBtn.disabled = false;
      toggleBtn.innerText = 'Stop Camera Scanner 🛑';
      toggleBtn.classList.remove('btn-secondary');
      toggleBtn.classList.add('btn-danger');
      laserLine.style.display = 'flex';
    } catch (err) {
      console.error(err);
      alert("Unable to open camera. Please grant camera permissions or use physical 'Quick Simulate' button.");
      toggleBtn.disabled = false;
      toggleBtn.innerText = 'Start Camera Scanner 📷';
      isScanning = false;
      laserLine.style.display = 'none';
    }
  }
}

async function stopCameraScanner() {
  if (qrScanner && isScanning) {
    try { await qrScanner.stop(); } catch (err) { console.error(err); }
    isScanning = false;
  }
}

async function handleMarkEntry(qrCodeValue) {
  if (!currentUser) return;
  await stopCameraScanner();

  try {
    const response = await fetch(\`\${API_BASE}/mark-entry\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, qr_code: qrCodeValue })
    });
    const data = await response.json();

    if (response.ok) {
      document.getElementById('success-name').innerText = currentUser.name;
      document.getElementById('success-roll').innerText = currentUser.roll_number;
      const checkinTime = data.entry.timestamp 
        ? new Date(data.entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : new Date().toLocaleTimeString();
      document.getElementById('success-time').innerText = checkinTime;
      goToScreen('success');
    } else {
      document.getElementById('error-title').innerText = data.error === 'Entry already marked' ? 'Already Marked Today' : 'Scan Error';
      document.getElementById('error-message').innerText = data.message || data.error;
      goToScreen('error');
    }
  } catch (error) {
    alert("Connection Error to API server.");
  }
}

function simulateSuccessfulScan() {
  handleMarkEntry('DEPT_ENTRY_001');
}

function resetStudentPortal() {
  currentUser = null;
  localStorage.removeItem('qr_student_user');
  goToScreen('login');
}

async function fetchEntries() {
  try {
    const res = await fetch(\`\${API_BASE}/entries\`);
    const data = await res.json();
    if (res.ok) {
      apiLogsCache = data.entries || [];
      renderAdminLogs(apiLogsCache);
    }
  } catch (e) { console.error(e); }
}

async function fetchStats() {
  try {
    const res = await fetch(\`\${API_BASE}/stats\`);
    const data = await res.json();
    if (res.ok) {
      document.getElementById('metric-users').innerText = data.total_students;
      document.getElementById('metric-entries-today').innerText = data.entries_today;
    }
  } catch (e) { console.error(e); }
}

function renderAdminLogs(logs) {
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="td-loading">No entries yet.</td></tr>';
    return;
  }
  logs.forEach((log, index) => {
    const serial = logs.length - index;
    const date = new Date(log.timestamp);
    tbody.innerHTML += \`
      <tr>
        <td><strong>\${serial}</strong></td>
        <td>\${log.name}</td>
        <td><code>\${log.roll_number}</code></td>
        <td>\${date.toLocaleTimeString()}</td>
        <td>\${date.toLocaleDateString()}</td>
        <td><span class="badge badge-success">Present</span></td>
      </tr>\`;
  });
}

function filterAdminLogs() {
  const query = document.getElementById('admin-search').value.toLowerCase().trim();
  const filtered = apiLogsCache.filter(log => log.name.toLowerCase().includes(query) || log.roll_number.toLowerCase().includes(query));
  renderAdminLogs(filtered);
}

function exportToCSV() {
  let csv = "SNo,Student Name,Roll Number,Date,CheckIn Time\\n";
  apiLogsCache.forEach((log, index) => {
    const serial = apiLogsCache.length - index;
    const date = new Date(log.timestamp);
    csv += \`\${serial},\${log.name},\${log.roll_number},\${date.toLocaleDateString()},\${date.toLocaleTimeString()}\\n\`;
  });
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv));
  link.setAttribute("download", "Entry_Logs.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}`;

export const codeStyleCSS = `/* Global Styles */
:root {
  --primary-color: #4f46e5;
  --primary-hover: #4338ca;
  --secondary-color: #0f172a;
  --success-color: #10b981;
  --danger-color: #ef4444;
  --background-color: #f8fafc;
  --card-bg: #ffffff;
  --border-color: #e2e8f0;
  --text-main: #334155;
  --text-muted: #64748b;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--background-color);
  color: var(--text-main);
  margin: 0;
  padding: 1rem;
}

.app-container {
  max-width: 1100px;
  margin: 0 auto;
}

.main-header {
  background: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 1rem;
  align-items: center;
}

.tab-btn {
  background: #f1f5f9;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}

.tab-btn.active {
  background: var(--primary-color);
  color: white;
}

.mobile-frame {
  max-width: 400px;
  margin: auto;
  border: 10px solid #000;
  border-radius: 20px;
  background: white;
  min-height: 550px;
}

.screen { display: none; padding: 1.5rem; }
.screen.active { display: flex; flex-direction: column; }

.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
.form-group input { width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; }

.btn { width: 100%; padding: 0.75rem; border-radius: 6px; border: none; font-weight: bold; cursor: pointer; }
.btn-primary { background: var(--primary-color); color: white; }
.btn-secondary { background: var(--secondary-color); color: white; }
.btn-accent { background: #f59e0b; color: white; }

#qr-reader { width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; }

.result-card { text-align: center; }
.result-icon { font-size: 3rem; }
.receipt { background: #f8fafc; padding: 1rem; border-radius: 8px; text-align: left; }

.admin-panel { background: white; padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); }
.metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
.metric-card { background: #f8fafc; padding: 1rem; border-radius: 6px; text-align: center; }

table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 1rem; }
th, td { padding: 0.75rem; border-bottom: 1px solid var(--border-color); }
th { background: #f8fafc; }
.badge { padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem; background: #ecfdf5; color: #10b981; }`;
