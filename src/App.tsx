import React, { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode, Users, CheckCircle, XCircle, LogOut, Calendar, Download, Trash2,
  ShieldCheck, Camera, User, AlertTriangle
} from 'lucide-react';

// Types
interface User {
  id: number;
  name: string;
  roll_number: string;
  role: 'student' | 'admin';
}

interface Entry {
  entry_id: number;
  id?: number;
  user_id: number;
  timestamp: string;
  name?: string;
  roll_number?: string;
}

interface AdminUser {
  username: string;
  password: string;
}

const ADMIN_CREDENTIALS: AdminUser = { username: 'admin', password: 'admin123' };
const VALID_QR_CODE = 'DEPT_ENTRY_001';
const API_BASE_URL = 'https://qrentry-780w.onrender.com/api';

// Helper to parse SQLite UTC timestamps correctly
const parseDate = (ts: string) => {
  if (!ts) return new Date();
  if (ts.includes('T')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
};

export default function App() {
  // Global State
  const [currentView, setCurrentView] = useState<'student' | 'admin'>('student');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Student Flow State
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [scanScreen, setScanScreen] = useState<'login' | 'scan' | 'success' | 'error'>('login');
  const [scanMessage, setScanMessage] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [html5QrCode, setHtml5QrCode] = useState<Html5Qrcode | null>(null);

  // Admin Flow State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [adminStats, setAdminStats] = useState({ total_students: 0, entries_today: 0 });
  const [filterDate, setFilterDate] = useState('');
  const [showQRPoster, setShowQRPoster] = useState(false);

  const fetchAdminData = async () => {
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/entries`),
        fetch(`${API_BASE_URL}/stats`)
      ]);
      if (entriesRes.ok) {
        const data = await entriesRes.json();
        setEntries(data.entries);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setAdminStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };

  // Load from localStorage on mount and setup polling for Admin
  useEffect(() => {
    const savedToken = localStorage.getItem('qr_token');
    const savedUser = localStorage.getItem('qr_user');

    if (savedToken && savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      setIsLoggedIn(true);
      setCurrentView(parsedUser.role);
    }
  }, []);

  // Poll Admin Data every 5 seconds if viewing admin dashboard
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isLoggedIn && currentView === 'admin') {
      fetchAdminData(); // fetch immediately
      intervalId = setInterval(fetchAdminData, 3000); // then every 3 seconds
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLoggedIn, currentView]);

  // ==================== AUTHENTICATION ====================

  // Student Login / Register
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentRoll.trim()) return;

    const roll = studentRoll.trim().toUpperCase();
    const name = studentName.trim();

    try {
      const res = await fetch(`${API_BASE_URL}/register-or-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roll_number: roll })
      });
      const data = await res.json();
      
      if (res.ok) {
        const user: User = { ...data.user, role: 'student' };
        const newToken = btoa(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 86400000 }));
        
        localStorage.setItem('qr_token', newToken);
        localStorage.setItem('qr_user', JSON.stringify(user));
        
        setCurrentUser(user);
        setIsLoggedIn(true);
        setScanScreen('scan');
      } else {
        alert(data.error || "Failed to login");
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Could not connect to backend.");
    }
  };

  // Admin Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    if (adminUsername === ADMIN_CREDENTIALS.username && adminPassword === ADMIN_CREDENTIALS.password) {
      const adminUser: User = { id: 0, name: 'Administrator', roll_number: 'ADMIN', role: 'admin' };
      const adminToken = btoa(JSON.stringify({ id: 0, role: 'admin', exp: Date.now() + 86400000 }));

      localStorage.setItem('qr_token', adminToken);
      localStorage.setItem('qr_user', JSON.stringify(adminUser));

      setCurrentUser(adminUser);
      setIsLoggedIn(true);
      setCurrentView('admin');
      fetchAdminData();
    } else {
      setAdminError('Invalid username or password');
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('qr_token');
    localStorage.removeItem('qr_user');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setScanScreen('login');
    setStudentName('');
    setStudentRoll('');
    setAdminUsername('');
    setAdminPassword('');
    setAdminError('');
    setFilterDate('');
    stopScanner();
  };

  // ==================== QR SCANNING ====================

  const startScanner = async () => {
    if (!currentUser) return;

    const qrCodeId = 'qr-reader';
    try {
      const scanner = new Html5Qrcode(qrCodeId);
      setHtml5QrCode(scanner);
      setIsScanning(true);

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleQRScan(decodedText);
        },
        () => {}
      );
    } catch (err) {
      alert("Camera access failed. Please grant camera permissions or use the 'Simulate Scan' button.");
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
      } catch (e) {
        console.error(e);
      }
      setIsScanning(false);
      setHtml5QrCode(null);
    }
  };

  // Handle QR Scan Result
  const handleQRScan = async (qrValue: string) => {
    stopScanner();

    if (!currentUser || currentUser.role !== 'student') {
      setScanMessage('Unauthorized access');
      setScanScreen('error');
      return;
    }

    // Validate QR Code format
    if (qrValue !== VALID_QR_CODE) {
      setScanMessage(`Invalid QR Code. Expected: ${VALID_QR_CODE}`);
      setScanScreen('error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/mark-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, qr_code: qrValue })
      });
      const data = await res.json();
      
      if (res.ok || res.status === 201) {
        const time = parseDate(data.entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setScanMessage(`Entry marked successfully at ${time}`);
        setScanScreen('success');
      } else {
        setScanMessage(data.message || data.error || 'Failed to mark entry');
        setScanScreen('error');
      }
    } catch (err) {
      console.error(err);
      setScanMessage('Network error. Failed to communicate with server.');
      setScanScreen('error');
    }
  };

  // Simulate QR Scan (for testing without camera)
  const simulateScan = () => {
    handleQRScan(VALID_QR_CODE);
  };

  // Simulate Invalid QR
  const simulateInvalidScan = () => {
    handleQRScan('INVALID_QR_CODE_999');
  };

  // ==================== ADMIN FEATURES ====================

  // Get filtered entries
  const getFilteredEntries = () => {
    let filtered = [...entries];

    // The backend already joins name and roll_number
    // Filter by date
    if (filterDate) {
      const filterDateStr = new Date(filterDate).toDateString();
      filtered = filtered.filter(entry => parseDate(entry.timestamp).toDateString() === filterDateStr);
    }

    return filtered.sort((a, b) => parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime());
  };

  const filteredEntries = getFilteredEntries();

  // Export to CSV
  const exportToCSV = () => {
    if (filteredEntries.length === 0) {
      alert("No entries to export");
      return;
    }

    let csv = "S.No,Student Name,Roll Number,Date,Time,Timestamp\n";

    filteredEntries.forEach((entry, index) => {
      const date = parseDate(entry.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      
      csv += `${index + 1},"${entry.name}","${entry.roll_number}","${dateStr}","${timeStr}","${entry.timestamp}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_entries_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Cleanup old entries (older than 90 days)
  const cleanupOldEntries = () => {
    alert("Database cleanup must be managed from the backend server.");
  };

  // ==================== UI COMPONENTS ====================

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-xl">Computer Science Department</h1>
            </div>
          </div>

          {isLoggedIn && currentUser && (
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <div className="font-medium">{currentUser.name}</div>
                <div className="text-xs text-slate-400">{currentUser.roll_number}</div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          )}
        </div>

        {/* Role Switcher */}
        {!isLoggedIn && (
          <div className="max-w-7xl mx-auto px-4 pb-3 flex gap-2">
            <button
              onClick={() => setCurrentView('student')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                currentView === 'student' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Student Portal
            </button>
            <button
              onClick={() => setCurrentView('admin')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                currentView === 'admin' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Admin Portal
            </button>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ==================== STUDENT PORTAL ==================== */}
        {currentView === 'student' && !isLoggedIn && (
          <div className="max-w-md mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold">Student Login</h2>
                <p className="text-slate-400 mt-2">Enter your details to continue</p>
              </div>

              <form onSubmit={handleStudentLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="e.g. Arjun Sharma"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Course</label>
                  <input
                    type="text"
                    value={studentRoll}
                    onChange={(e) => setStudentRoll(e.target.value)}
                    placeholder="e.g. MCA sem 2"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                    required
                  />
                  {/* <p className="text-xs text-slate-500 mt-1">Format: DEPT-YEAR-ID</p> */}
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 py-3.5 rounded-xl font-semibold transition-colors"
                >
                  Continue to Scanner
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Student Scan Page */}
        {currentView === 'student' && isLoggedIn && currentUser?.role === 'student' && (
          <div className="max-w-md mx-auto">
            {scanScreen === 'scan' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold">Scan Entrance QR Code</h2>
                  <p className="text-slate-400 text-sm mt-1">Position the QR code within the frame</p>
                </div>

                {/* QR Scanner Container */}
                <div className="relative bg-black rounded-2xl overflow-hidden mb-6 aspect-square flex items-center justify-center">
                  {!isScanning && (
                    <div className="text-center text-slate-400">
                      <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Camera Inactive</p>
                    </div>
                  )}
                  <div id="qr-reader" className="w-full h-full" />
                </div>

                <div className="space-y-3">
                  <button
                    onClick={isScanning ? stopScanner : startScanner}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    {isScanning ? 'Stop Camera' : 'Start Camera Scan'}
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    {/* <button
                      onClick={simulateScan}
                      className="bg-emerald-600/90 hover:bg-emerald-600 py-3 rounded-xl text-sm font-medium transition-colors"
                    >
                      Simulate Valid Scan
                    </button>
                    <button
                      onClick={simulateInvalidScan}
                      className="bg-rose-600/90 hover:bg-rose-600 py-3 rounded-xl text-sm font-medium transition-colors"
                    >
                      Simulate Invalid QR
                    </button> */}
                  </div>
                </div>
              </div>
            )}

            {/* Success Screen */}
            {scanScreen === 'success' && (
              <div className="bg-slate-900 border border-emerald-800/50 rounded-2xl p-8 text-center">
                <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-emerald-400">Entry Successful</h2>
                <p className="text-slate-300 mt-2">{scanMessage}</p>
                
                <div className="mt-8 bg-slate-800 rounded-xl p-4 text-left text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-700">
                    <span className="text-slate-400">Student</span>
                    <span className="font-medium">{currentUser?.name}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-700">
                    <span className="text-slate-400">Course</span>
                    <span className="font-mono">{currentUser?.roll_number}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Token</span>
                    <span className="font-mono text-emerald-400">{VALID_QR_CODE}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setScanScreen('scan');
                    setScanMessage('');
                  }}
                  className="mt-6 w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl transition-colors"
                >
                  Scan Again
                </button>
              </div>
            )}

            {/* Error Screen */}
            {scanScreen === 'error' && (
              <div className="bg-slate-900 border border-rose-800/50 rounded-2xl p-8 text-center">
                <XCircle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-rose-400">Entry Failed</h2>
                <p className="text-slate-300 mt-2">{scanMessage}</p>

                <button
                  onClick={() => {
                    setScanScreen('scan');
                    setScanMessage('');
                  }}
                  className="mt-8 w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== ADMIN PORTAL ==================== */}
        {currentView === 'admin' && !isLoggedIn && (
          <div className="max-w-md mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-amber-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8 text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold">Admin Login</h2>
                <p className="text-slate-400 mt-2">Secure department access</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                </div>

                {adminError && (
                  <div className="bg-rose-950 border border-rose-800 text-rose-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {adminError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-700 py-3.5 rounded-xl font-semibold transition-colors"
                >
                  Sign In as Admin
                </button>
              </form>

              {/* <div className="mt-4 text-center text-xs text-slate-500">
                Demo credentials: <span className="font-mono text-amber-400">admin / admin123</span>
              </div> */}
            </div>
          </div>
        )}

        {/* Admin Dashboard */}
        {currentView === 'admin' && isLoggedIn && currentUser?.role === 'admin' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-indigo-400" />
                  <div>
                    <div className="text-3xl font-bold">{adminStats.total_students}</div>
                    <div className="text-sm text-slate-400">Registered Students</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <div>
                    <div className="text-3xl font-bold">{entries.length}</div>
                    <div className="text-sm text-slate-400">Total Entries</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-amber-400" />
                  <div>
                    <div className="text-3xl font-bold">
                      {adminStats.entries_today}
                    </div>
                    <div className="text-sm text-slate-400">Entries Today</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm"
                  />
                  {filterDate && (
                    <button onClick={() => setFilterDate('')} className="text-sm text-slate-400 hover:text-white">Clear</button>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowQRPoster(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition-colors"
                  >
                    <QrCode className="w-4 h-4" /> View QR Poster
                  </button>
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm transition-colors"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button
                    onClick={cleanupOldEntries}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Cleanup (90+ days)
                  </button>
                </div>
              </div>
            </div>

            {/* Entries Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold">Entry Logs</h3>
                <span className="text-xs text-slate-400">{filteredEntries.length} records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50">
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">S.No</th>
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">Student</th>
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">Course</th>
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">Date</th>
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">Time</th>
                      <th className="text-left px-6 py-3 text-slate-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          No entries found
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((entry, index) => {
                        const date = parseDate(entry.timestamp);
                        return (
                          <tr key={entry.entry_id || entry.id} className="border-b border-slate-800 hover:bg-slate-950/30">
                            <td className="px-6 py-4 text-slate-400">{index + 1}</td>
                            <td className="px-6 py-4 font-medium">{entry.name}</td>
                            <td className="px-6 py-4 font-mono text-indigo-400">{entry.roll_number}</td>
                            <td className="px-6 py-4 text-slate-300">{date.toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-slate-300">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="w-3 h-3" /> Present
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QR Poster Modal */}
      {showQRPoster && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setShowQRPoster(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="font-bold text-xl mb-1">Department Entrance</h3>
              <p className="text-sm text-slate-400 mb-6">Official QR Code for Entry</p>
              
              <div className="bg-white p-6 rounded-2xl inline-block mb-6">
                <QRCodeSVG value={VALID_QR_CODE} size={200} />
              </div>

              <div className="font-mono text-sm bg-slate-800 px-4 py-2 rounded-lg inline-block text-indigo-400">
                {VALID_QR_CODE}
              </div>

              <button
                onClick={() => setShowQRPoster(false)}
                className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-slate-500 border-t border-slate-900 mt-12">
        Computer Science Department • QR Entry System v1.0 • Production Ready
      </footer>
    </div>
  );
}
