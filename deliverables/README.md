# 🏛️ QR-Based Student Entry System (MVP)

A secure, high-efficiency QR-based entry check-in system designed for university departments to replace manual paper registers. Students scan a static QR code poster placed at the entrance to log their arrival. Duplicate entries for the same calendar date are automatically rejected.

---

## 🎯 Core Features

- **Daily Limit Enforcement:** Students can only log an entry **once per day**.
- **Static QR Token Validation:** Server validates the token (`DEPT_ENTRY_001`) to prevent spoofing or random check-ins.
- **Auto-Registration:** First-time students are automatically registered when they submit their Name and Roll Number. Returning students are identified instantly.
- **Admin Dashboard Panel:** View daily attendee statistics, search and filter logs in real-time, and export table entries to CSV.
- **Secure Camera Scanner:** Uses the `html5-qrcode` library for direct in-browser physical camera scanning (webcam or mobile back-camera).
- **Fast Testing Mode:** Simple desktop simulator mode checks in instantly without needing a camera.

---

## 🧱 Technical Architecture

- **Backend:** Node.js with Express.js REST API.
- **Database:** SQLite (Relational, file-based, stores tables locally).
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+), with CDN camera decoding.

### SQLite Schema

#### `users` Table
Stores unique student identities:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `roll_number` (TEXT UNIQUE NOT NULL)

#### `entries` Table
Stores chronological department entries:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, foreign key)
- `timestamp` (DATETIME DEFAULT CURRENT_TIMESTAMP)

---

## 📦 API Documentation

### 1. Register or Login Student
- **Endpoint:** `POST /api/register-or-login`
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "roll_number": "CS-2023-011"
  }
  ```
- **Response (200 OK / 201 Created):**
  ```json
  {
    "success": true,
    "message": "Welcome back!",
    "user": {
      "id": 4,
      "name": "Jane Doe",
      "roll_number": "CS-2023-011"
    }
  }
  ```

### 2. Record Daily Entry
- **Endpoint:** `POST /api/mark-entry`
- **Request Body:**
  ```json
  {
    "user_id": 4,
    "qr_code": "DEPT_ENTRY_001"
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Entry marked successfully",
    "entry": {
      "id": 14,
      "user_id": 4,
      "name": "Jane Doe",
      "roll_number": "CS-2023-011",
      "timestamp": "2026-03-30T10:45:00.000Z"
    }
  }
  ```
- **Error Response (400 Bad Request) - Already Scanned Today:**
  ```json
  {
    "error": "Entry already marked",
    "message": "You have already marked your entrance entry for today."
  }
  ```
- **Error Response (400 Bad Request) - Corrupted/Invalid QR:**
  ```json
  {
    "error": "Invalid QR Code scanned."
  }
  ```

### 3. Fetch Entry Logs
- **Endpoint:** `GET /api/entries`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 1,
    "entries": [
      {
        "entry_id": 14,
        "timestamp": "2026-03-30 10:45:00",
        "user_id": 4,
        "name": "Jane Doe",
        "roll_number": "CS-2023-011"
      }
    ]
  }
  ```

---

## 🚀 How to Run Locally

### Prerequisites
Make sure you have **Node.js** (v14 or higher) installed on your computer.

### Step 1: Install Dependencies
Open your command terminal, navigate to this project folder, and install the required npm packages:
```bash
npm install
```

### Step 2: Run the Server
Launch the Node.js Express server:
```bash
npm start
```
*For automatic hot-reloads during developer testing, you can use `npm run dev` if you have nodemon installed.*

### Step 3: Open in Browser
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📱 testing Guide

1. **Student Login:** Open the Student Portal, type in a Name and Roll Number, and click **Continue to Scanner**.
2. **Scan verification:** 
   - Point your camera at a QR code containing `DEPT_ENTRY_001`.
   - **Alternative:** Click the **Quick Simulate Scan** button to immediately trigger the entrance API.
3. **Double Check-In Protection:** Click scan or simulate scan a *second* time for the same student on the same day. You will receive an **"Entry already marked"** block.
4. **View Logs:** Switch to the **Admin Dashboard** tab to view the live check-in logs table, search entries by roll-number/name, and click **Export CSV** to save logs to Excel!
