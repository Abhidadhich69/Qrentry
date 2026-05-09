// Core State Variables
let currentUser = null; // Stores logged-in student user { id, name, roll_number }
let qrScanner = null; // Holds Html5Qrcode instance
let isScanning = false; // Scanner status flag
let isProcessingScan = false; // Prevents double submission
let apiLogsCache = []; // Cache of admin entries for quick local filtering

// API Base URL (Configurable to relative paths since we serve front/back together)
const API_BASE = '/api';

// DOMContentLoaded Initializations
document.addEventListener('DOMContentLoaded', () => {
  // Try to load any persistent student session from localStorage for ease of use
  const savedUser = localStorage.getItem('qr_student_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      setupScanScreen();
    } catch (e) {
      localStorage.removeItem('qr_student_user');
    }
  }

  // Pre-load admin logs if they open the tab
  fetchEntries();
  // Fetch stats periodically for the admin view
  fetchStats();
});

/**
 * Navigation View Switching (Student View vs Admin View)
 */
function switchView(view) {
  // Reset active classes on tabs
  document.getElementById('tab-student').classList.remove('active');
  document.getElementById('tab-admin').classList.remove('active');
  
  // Hide all panes
  document.getElementById('student-view').classList.remove('active');
  document.getElementById('admin-view').classList.remove('active');

  if (view === 'student') {
    document.getElementById('tab-student').classList.add('active');
    document.getElementById('student-view').classList.add('active');
  } else if (view === 'admin') {
    document.getElementById('tab-admin').classList.add('active');
    document.getElementById('admin-view').classList.add('active');
    // Fetch fresh data when entering Admin Console
    fetchEntries();
    fetchStats();
  }
}

/**
 * Screen switching within the Student Portal Mobile Frame
 */
function goToScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.mobile-frame .screen').forEach(screen => {
    screen.classList.remove('active');
  });

  // Stop scanning if switching away from scan screen
  if (screenId !== 'scan' && isScanning) {
    stopCameraScanner();
  }

  // Show selected screen
  const targetScreen = document.getElementById(`screen-${screenId}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }
}

/**
 * Student Registration/Login
 * Triggers on form submit
 */
async function handleLogin(event) {
  event.preventDefault();

  const nameInput = document.getElementById('student-name');
  const rollInput = document.getElementById('student-roll');

  const name = nameInput.value.trim();
  const roll_number = rollInput.value.trim();

  if (!name || !roll_number) return;

  const submitButton = event.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerText = 'Connecting...';

  try {
    const response = await fetch(`${API_BASE}/register-or-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, roll_number })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to register or login');
    }

    // Save user session
    currentUser = data.user;
    localStorage.setItem('qr_student_user', JSON.stringify(currentUser));

    // Move to scanner screen
    setupScanScreen();
    goToScreen('scan');

  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.innerText = 'Continue to Scanner ➡️';
  }
}

/**
 * Sets up scanning interface with student names
 */
function setupScanScreen() {
  if (!currentUser) return;
  document.getElementById('user-display-name').innerText = currentUser.name;
  document.getElementById('user-display-roll').innerText = currentUser.roll_number;
}

/**
 * Camera Scanning Utilities using html5-qrcode
 */
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
    isProcessingScan = false;
    // Instantiate camera scanner
    qrScanner = new Html5Qrcode("qr-reader");
    toggleBtn.innerText = 'Initializing Camera...';
    toggleBtn.disabled = true;

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      // Received QR Code string
      console.log(`Scan success: ${decodedText}`, decodedResult);
      handleMarkEntry(decodedText);
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
      // Start camera back camera facing environment, or fall back to any available webcam
      await qrScanner.start(
        { facingMode: "environment" },
        config,
        qrCodeSuccessCallback
      );
      
      isScanning = true;
      toggleBtn.disabled = false;
      toggleBtn.innerText = 'Stop Camera Scanner 🛑';
      toggleBtn.classList.remove('btn-secondary');
      toggleBtn.classList.add('btn-danger');
      laserLine.style.display = 'flex';

    } catch (err) {
      console.error("Camera start error:", err);
      alert("Unable to open camera. Please grant camera permissions, use a secure (HTTPS) environment, or use the 'Quick Simulate Scan' button below!");
      
      toggleBtn.disabled = false;
      toggleBtn.innerText = 'Start Camera Scanner 📷';
      isScanning = false;
      laserLine.style.display = 'none';
    }
  }
}

async function stopCameraScanner() {
  if (qrScanner && isScanning) {
    try {
      await qrScanner.stop();
    } catch (err) {
      console.error("Error stopping camera:", err);
    }
    isScanning = false;
  }
}

/**
 * Action to process check-in submission with backend API
 */
async function handleMarkEntry(qrCodeValue) {
  if (isProcessingScan) return;
  isProcessingScan = true;

  if (!currentUser) {
    alert("Session expired. Please log in again.");
    goToScreen('login');
    return;
  }

  // Stop camera to prevent double-scans
  await stopCameraScanner();
  const toggleBtn = document.getElementById('btn-toggle-scan');
  toggleBtn.innerText = 'Start Camera Scanner 📷';
  toggleBtn.classList.remove('btn-danger');
  toggleBtn.classList.add('btn-secondary');
  document.getElementById('scanner-line').style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/mark-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        qr_code: qrCodeValue
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Success display
      document.getElementById('success-name').innerText = currentUser.name;
      document.getElementById('success-roll').innerText = currentUser.roll_number;
      
      // Parse database timestamp
      const checkinTime = data.entry.timestamp 
        ? new Date(data.entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : new Date().toLocaleTimeString();
        
      document.getElementById('success-time').innerText = checkinTime;
      goToScreen('success');
    } else {
      // Error display
      const errorMsg = data.error || 'Server rejected registration';
      document.getElementById('error-title').innerText = errorMsg === 'Entry already marked' ? 'Already Marked Today' : 'Scan Error';
      document.getElementById('error-message').innerText = data.message || errorMsg;
      
      const errorDetails = document.getElementById('error-details');
      if (qrCodeValue !== 'DEPT_ENTRY_001') {
        errorDetails.innerHTML = `<p style="color:var(--danger-color)"><strong>Invalid QR Token:</strong> <code>${qrCodeValue}</code><br>Please scan the official poster containing <code>DEPT_ENTRY_001</code>.</p>`;
      } else {
        errorDetails.innerHTML = `<p>Student: <strong>${currentUser.name}</strong><br>Roll: <strong>${currentUser.roll_number}</strong><br>Status: Entry already submitted for today.</p>`;
      }
      
      goToScreen('error');
    }

  } catch (error) {
    console.error("API mark entry error:", error);
    document.getElementById('error-title').innerText = 'Connection Failed';
    document.getElementById('error-message').innerText = 'Unable to reach the server. Make sure server.js is running.';
    document.getElementById('error-details').innerText = error.message;
    goToScreen('error');
  }
}

/**
 * Desktop / Test helper: Simulates scan of correct code instantly
 */
function simulateSuccessfulScan() {
  handleMarkEntry('DEPT_ENTRY_001');
}

/**
 * Student logs out / resets flow to login another student
 */
function resetStudentPortal() {
  currentUser = null;
  localStorage.removeItem('qr_student_user');
  
  // Clear form
  document.getElementById('student-name').value = '';
  document.getElementById('student-roll').value = '';
  
  goToScreen('login');
}


/**
 * ADMIN FUNCTIONS
 */

// Fetch entries log table
async function fetchEntries() {
  try {
    const response = await fetch(`${API_BASE}/entries`);
    const data = await response.json();

    if (response.ok) {
      apiLogsCache = data.entries || [];
      renderAdminLogs(apiLogsCache);
    } else {
      console.error("Failed to load entries logs");
    }
  } catch (error) {
    console.error("Admin fetch entries API error:", error);
  }
}

// Clear all entry logs
async function clearAllLogs() {
  if (!confirm('Are you sure you want to permanently delete all entry logs? This cannot be undone.')) return;
  
  try {
    const response = await fetch(`${API_BASE}/entries`, { method: 'DELETE' });
    if (response.ok) {
      apiLogsCache = [];
      renderAdminLogs([]);
      fetchStats();
      alert('All logs cleared successfully.');
    } else {
      alert('Failed to clear logs.');
    }
  } catch (error) {
    alert('Network error while clearing logs.');
  }
}

// Fetch general stats (users, entries today)
async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();

    if (response.ok) {
      document.getElementById('metric-users').innerText = data.total_students || 0;
      document.getElementById('metric-entries-today').innerText = data.entries_today || 0;
    }
  } catch (error) {
    console.error("Stats API error:", error);
  }
}

// Render dynamic table rows
function renderAdminLogs(logs) {
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="td-loading">No check-in entries logged yet. Scan from the student view to record entries!</td></tr>`;
    return;
  }

  logs.forEach((log, index) => {
    // S.No starts from the highest (newest entries first)
    const serialNo = logs.length - index;
    const dateObj = new Date(log.timestamp);
    
    const formattedDate = dateObj.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${serialNo}</strong></td>
      <td>${escapeHtml(log.name)}</td>
      <td><code>${escapeHtml(log.roll_number)}</code></td>
      <td>${formattedTime}</td>
      <td>${formattedDate}</td>
      <td><span class="badge badge-success">Present</span></td>
    `;
    tbody.appendChild(row);
  });
}

// Client-side search filters
function filterAdminLogs() {
  const searchQuery = document.getElementById('admin-search').value.toLowerCase().trim();
  
  if (!searchQuery) {
    renderAdminLogs(apiLogsCache);
    return;
  }

  const filtered = apiLogsCache.filter(log => {
    return (
      log.name.toLowerCase().includes(searchQuery) ||
      log.roll_number.toLowerCase().includes(searchQuery)
    );
  });

  renderAdminLogs(filtered);
}

// Export database records to CSV
function exportToCSV() {
  if (apiLogsCache.length === 0) {
    alert("No records available to export!");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "SNo,Student Name,Roll Number,Date,CheckIn Time\n";

  apiLogsCache.forEach((log, index) => {
    const serialNo = apiLogsCache.length - index;
    const dateObj = new Date(log.timestamp);
    const formattedDate = dateObj.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
    const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Escape commas in names
    const escapedName = `"${log.name.replace(/"/g, '""')}"`;
    const escapedRoll = `"${log.roll_number.replace(/"/g, '""')}"`;

    csvContent += `${serialNo},${escapedName},${escapedRoll},${formattedDate},${formattedTime}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const downloadLink = document.createElement("a");
  downloadLink.setAttribute("href", encodedUri);
  downloadLink.setAttribute("download", `Department_Entry_Logs_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(downloadLink);
  
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// Basic HTML Injection sanitizer helper
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
