import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Add API_BASE_URL
content = content.replace(
    "const VALID_QR_CODE = 'DEPT_ENTRY_001';",
    "const VALID_QR_CODE = 'DEPT_ENTRY_001';\nconst API_BASE_URL = 'https://qrentry-780w.onrender.com/api';"
)

# 2. Update Entry interface
content = re.sub(
    r"interface Entry \{[\s\S]*?\}",
    "interface Entry {\n  entry_id: number;\n  id?: number;\n  user_id: number;\n  timestamp: string;\n  name?: string;\n  roll_number?: string;\n}",
    content
)

# 3. Update states and useEffect
state_and_effect_target = """  // Admin Flow State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterDate, setFilterDate] = useState('');
  const [showQRPoster, setShowQRPoster] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedUsers = localStorage.getItem('qr_users');
    const savedEntries = localStorage.getItem('qr_entries');
    const savedToken = localStorage.getItem('qr_token');
    const savedUser = localStorage.getItem('qr_user');

    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedEntries) setEntries(JSON.parse(savedEntries));

    if (savedToken && savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      setIsLoggedIn(true);
      setCurrentView(parsedUser.role);
    }
  }, []);

  // Persist to localStorage
  const saveToStorage = (newUsers: User[], newEntries: Entry[]) => {
    localStorage.setItem('qr_users', JSON.stringify(newUsers));
    localStorage.setItem('qr_entries', JSON.stringify(newEntries));
    setUsers(newUsers);
    setEntries(newEntries);
  };"""

state_and_effect_new = """  // Admin Flow State
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

  // Load from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('qr_token');
    const savedUser = localStorage.getItem('qr_user');

    if (savedToken && savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      setIsLoggedIn(true);
      setCurrentView(parsedUser.role);
      if (parsedUser.role === 'admin') {
        fetchAdminData();
      }
    }
  }, []);"""

content = content.replace(state_and_effect_target, state_and_effect_new)

# 4. handleStudentLogin
login_target = """  // Student Login / Register
  const handleStudentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentRoll.trim()) return;

    const roll = studentRoll.trim().toUpperCase();
    const name = studentName.trim();

    let existingUser = users.find(u => u.roll_number === roll && u.role === 'student');

    let user: User;

    if (existingUser) {
      user = existingUser;
    } else {
      // Create new student
      const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
      user = { id: newId, name, roll_number: roll, role: 'student' };
      const newUsers = [...users, user];
      saveToStorage(newUsers, entries);
    }

    // Generate simple JWT-like token
    const newToken = btoa(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 86400000 }));

    localStorage.setItem('qr_token', newToken);
    localStorage.setItem('qr_user', JSON.stringify(user));

    setCurrentUser(user);
    setIsLoggedIn(true);
    setScanScreen('scan');
  };"""

login_new = """  // Student Login / Register
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
  };"""
content = content.replace(login_target, login_new)

# 5. handleAdminLogin (add fetchAdminData)
admin_login_target = """      setCurrentUser(adminUser);
      setIsLoggedIn(true);
      setCurrentView('admin');
    } else {"""
admin_login_new = """      setCurrentUser(adminUser);
      setIsLoggedIn(true);
      setCurrentView('admin');
      fetchAdminData();
    } else {"""
content = content.replace(admin_login_target, admin_login_new)

# 6. handleQRScan
scan_target = """  // Handle QR Scan Result
  const handleQRScan = (qrValue: string) => {
    stopScanner();

    if (!currentUser || currentUser.role !== 'student') {
      setScanMessage('Unauthorized access');
      setScanScreen('error');
      return;
    }

    // Validate QR Code
    if (qrValue !== VALID_QR_CODE) {
      setScanMessage(`Invalid QR Code. Expected: ${VALID_QR_CODE}`);
      setScanScreen('error');
      return;
    }

    // Check for duplicate entry today
    const today = new Date().toDateString();
    const hasEntryToday = entries.some(entry => 
      entry.user_id === currentUser.id && 
      new Date(entry.timestamp).toDateString() === today
    );

    if (hasEntryToday) {
      setScanMessage('Entry already marked for today');
      setScanScreen('error');
      return;
    }

    // Save new entry
    const newEntry: Entry = {
      id: entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1,
      user_id: currentUser.id,
      timestamp: new Date().toISOString()
    };

    const newEntries = [...entries, newEntry];
    saveToStorage(users, newEntries);

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setScanMessage(`Entry marked successfully at ${time}`);
    setScanScreen('success');
  };"""

scan_new = """  // Handle QR Scan Result
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
        const time = new Date(data.entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  };"""
content = content.replace(scan_target, scan_new)

# 7. getFilteredEntries
get_filtered_target = """  // Get filtered entries
  const getFilteredEntries = () => {
    let filtered = [...entries];

    // Join with user data
    const joined = filtered.map(entry => {
      const user = users.find(u => u.id === entry.user_id);
      return {
        ...entry,
        name: user?.name || 'Unknown',
        roll_number: user?.roll_number || 'N/A'
      };
    });

    // Filter by date
    if (filterDate) {
      const filterDateStr = new Date(filterDate).toDateString();
      joined.filter(entry => new Date(entry.timestamp).toDateString() === filterDateStr);
    }

    return joined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };"""
get_filtered_new = """  // Get filtered entries
  const getFilteredEntries = () => {
    let filtered = [...entries];

    // The backend already joins name and roll_number
    // Filter by date
    if (filterDate) {
      const filterDateStr = new Date(filterDate).toDateString();
      filtered = filtered.filter(entry => new Date(entry.timestamp).toDateString() === filterDateStr);
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };"""
content = content.replace(get_filtered_target, get_filtered_new)

# 8. cleanupOldEntries
cleanup_target = """  // Cleanup old entries (older than 90 days)
  const cleanupOldEntries = () => {
    if (!confirm("Delete all entries older than 90 days?")) return;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const newEntries = entries.filter(entry => 
      new Date(entry.timestamp) > ninetyDaysAgo
    );

    saveToStorage(users, newEntries);
    alert(`Cleaned up ${entries.length - newEntries.length} old entries`);
  };"""
cleanup_new = """  // Cleanup old entries (older than 90 days)
  const cleanupOldEntries = () => {
    alert("Database cleanup must be managed from the backend server.");
  };"""
content = content.replace(cleanup_target, cleanup_new)

# 9. Stats Cards (Admin UI)
content = content.replace(
    "<div className=\"text-3xl font-bold\">{users.length}</div>",
    "<div className=\"text-3xl font-bold\">{adminStats.total_students}</div>"
)
content = content.replace(
    "<div className=\"text-3xl font-bold\">{entries.length}</div>",
    "<div className=\"text-3xl font-bold\">{entries.length}</div>"
)
content = content.replace(
    "<div className=\"text-3xl font-bold\">\n                      {entries.filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString()).length}\n                    </div>",
    "<div className=\"text-3xl font-bold\">\n                      {adminStats.entries_today}\n                    </div>"
)

# 10. Table key and rendering
content = content.replace("key={entry.id}", "key={entry.entry_id || entry.id}")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Modification complete.")
