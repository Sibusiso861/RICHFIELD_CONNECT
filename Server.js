const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 5001; 

// --- SERVE FRONTEND FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// ── MIDDLEWARE SETUP ──
app.use(cors());
app.use(express.json());

// ── DB INITIALIZATION ──
const db = new sqlite3.Database('./richfield_connect.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite system database successfully.');
});

db.run('PRAGMA foreign_keys = ON');

// Create users table matching your exact frontend signup fields
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT,
    lastName TEXT,
    studentNum TEXT UNIQUE,
    email TEXT,
    course TEXT,
    password TEXT
)`);

// Productivity layer tables
db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    due_date TEXT,
    priority TEXT CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
    status TEXT CHECK(status IN ('pending','in_progress','done')) DEFAULT 'pending',
    course TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    goal TEXT NOT NULL,
    steps TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course TEXT,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_name TEXT,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    course TEXT,
    session_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration_mins INTEGER DEFAULT 60,
    location_type TEXT CHECK(location_type IN ('online','physical')) DEFAULT 'online',
    location TEXT,
    is_group INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('planned','completed','missed')) DEFAULT 'planned',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS session_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES study_sessions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS study_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL REFERENCES users(id),
    user2_id INTEGER NOT NULL REFERENCES users(id),
    topic TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT CHECK(status IN ('pending','accepted','declined')) DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id)
)`);


// ── SIGNUP API ENDPOINT ──
app.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, studentNum, email, course, password } = req.body;

        if (!firstName || !lastName || !studentNum || !email || !course || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const query = `INSERT INTO users (firstName, lastName, studentNum, email, course, password) VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.run(query, [firstName, lastName, studentNum, email, course, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'An account with this Student Number already exists.' });
                }
                console.error('DB Insert Error:', err.message);
                return res.status(500).json({ error: 'Database error during registration.' });
            }
            
            res.status(201).json({ 
                message: 'Registration successful!', 
                user: {
                    id: this.lastID,
                    firstName: firstName,
                    lastName: lastName,
                    studentNum: studentNum,
                    course: course
                }
            });
        }); 
    } catch (error) {
        console.error('Signup crash:', error);
        res.status(500).json({ error: 'Internal server error processing signup.' });
    }
});

// ── LOGIN API ENDPOINT ──
app.post('/login', async (req, res) => {
    try {
        const { studentNum, password } = req.body;

        if (!studentNum || !password) {
            return res.status(400).json({ error: 'Please enter both student number and password.' });
        }

        const query = `SELECT * FROM users WHERE studentNum = ?`;
        db.get(query, [studentNum], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error occurred during authentication.' });
            }
            if (!user) {
                return res.status(400).json({ error: 'Invalid Student Number or Password.' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: 'Invalid Student Number or Password.' });
            }

         res.status(200).json({
                message: 'Login successful!',
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    studentNum: user.studentNum,
                    course: user.course
                }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error processing login.' });
    }
});

// ── PROFILE DATA ENDPOINT ──
app.get('/profile/:studentNum', (req, res) => {
    const studentNum = req.params.studentNum;
    
    const query = `SELECT firstName, lastName, studentNum, email, course FROM users WHERE studentNum = ?`;
    
    db.get(query, [studentNum], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error fetching profile.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'Student profile not found.' });
        }
        res.status(200).json(user);
    });
});

// ── STUDY ROOM: START OR RESUME ──
app.post('/study-rooms', (req, res) => {
    const { user1_id, user2_id, topic } = req.body;
    db.get(
        `SELECT * FROM study_rooms WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,
        [user1_id, user2_id, user2_id, user1_id],
        (err, room) => {
            if (err) return res.status(500).json({ error: err.message });
            if (room) return res.status(200).json(room);
            db.run(
                `INSERT INTO study_rooms (user1_id, user2_id, topic, notes) VALUES (?,?,?,?)`,
                [user1_id, user2_id, topic || '', ''],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.status(201).json({ id: this.lastID, user1_id, user2_id, topic: topic || '', notes: '' });
                }
            );
        }
    );
});

// ── STUDY ROOM: GET NOTES ──
app.get('/study-rooms/:id', (req, res) => {
    db.get(`SELECT * FROM study_rooms WHERE id = ?`, [req.params.id], (err, room) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!room) return res.status(404).json({ error: 'Room not found.' });
        res.status(200).json(room);
    });
});

// ── STUDY ROOM: SAVE NOTES ──
app.patch('/study-rooms/:id', (req, res) => {
    const { notes, topic } = req.body;
    db.run(
        `UPDATE study_rooms SET notes = ?, topic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [notes, topic, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(200).json({ message: 'Room updated!' });
        }
    );
});

// ── USER STATS ──
app.get('/stats/:userId', (req, res) => {
    const userId = req.params.userId;

    const stats = {};

    db.get(
        `SELECT COUNT(*) as count FROM connections
         WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`,
        [userId, userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.buddies = row.count;

            db.get(
                `SELECT COUNT(*) as count FROM connections
                 WHERE receiver_id = ? AND status = 'pending'`,
                [userId],
                (err, row) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.pendingRequests = row.count;

                    db.get(
                        `SELECT COUNT(*) as count FROM users
                         WHERE id != ?
                         AND id NOT IN (
                             SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END
                             FROM connections
                             WHERE requester_id = ? OR receiver_id = ?
                         )`,
                        [userId, userId, userId, userId],
                        (err, row) => {
                            if (err) return res.status(500).json({ error: err.message });
                            stats.matches = row.count;

                            db.get(
                                `SELECT COALESCE(SUM(duration_mins), 0) as total
                                 FROM study_sessions
                                 WHERE creator_id = ? AND status = 'completed'`,
                                [userId],
                                (err, row) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    const totalMins = row.total;
                                    stats.studyHours = totalMins >= 60
                                        ? `${Math.floor(totalMins / 60)}h ${totalMins % 60 > 0 ? totalMins % 60 + 'm' : ''}`.trim()
                                        : totalMins > 0 ? `${totalMins}m` : '0h';

                                    res.status(200).json(stats);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// ── USER: UPDATE PROFILE ──
app.patch('/users/:id', (req, res) => {
    const { firstName, lastName, course } = req.body;
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'First name and last name are required.' });
    }
    db.run(
        `UPDATE users SET firstName = ?, lastName = ?, course = ? WHERE id = ?`,
        [firstName, lastName, course || null, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
            res.status(200).json({ message: 'Profile updated successfully!' });
        }
    );
});

// ── USER: CHANGE PASSWORD ──
app.patch('/users/:id/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required.' });
    }
    db.get(`SELECT * FROM users WHERE id = ?`, [req.params.id], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(newPassword, salt);
        db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(200).json({ message: 'Password changed successfully!' });
        });
    });
});

// ── USER: DELETE ACCOUNT ──
app.delete('/users/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM tasks WHERE user_id = ?`, [id]);
    db.run(`DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?`, [id, id]);
    db.run(`DELETE FROM connections WHERE requester_id = ? OR receiver_id = ?`, [id, id]);
    db.run(`DELETE FROM session_members WHERE user_id = ?`, [id]);
    db.run(`DELETE FROM study_sessions WHERE creator_id = ?`, [id]);
    db.run(`DELETE FROM forum_posts WHERE user_id = ?`, [id]);
    db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: 'Account deleted.' });
    });
});

// ── BUDDIES: GET SUGGESTIONS ──
app.get('/buddies/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `
        SELECT u.id, u.firstName, u.lastName, u.course, u.studentNum,
               c.status AS connection_status, c.id AS connection_id,
               c.requester_id
        FROM users u
        LEFT JOIN connections c
          ON (c.requester_id = ? AND c.receiver_id = u.id)
          OR (c.receiver_id = ? AND c.requester_id = u.id)
        WHERE u.id != ?
        ORDER BY u.firstName ASC
    `;
    db.all(query, [userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(rows);
    });
});

// ── BUDDIES: SEND CONNECTION REQUEST ──
app.post('/connections', (req, res) => {
    const { requester_id, receiver_id } = req.body;
    if (!requester_id || !receiver_id) {
        return res.status(400).json({ error: 'requester_id and receiver_id are required.' });
    }
    db.run(
        `INSERT OR IGNORE INTO connections (requester_id, receiver_id) VALUES (?, ?)`,
        [requester_id, receiver_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Connection request sent!', connectionId: this.lastID });
        }
    );
});

// ── BUDDIES: GET INCOMING REQUESTS ──
app.get('/connections/requests/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `
        SELECT c.id, c.requester_id, c.created_at,
               u.firstName, u.lastName, u.course
        FROM connections c
        JOIN users u ON c.requester_id = u.id
        WHERE c.receiver_id = ? AND c.status = 'pending'
        ORDER BY c.created_at DESC
    `;
    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(rows);
    });
});

// ── BUDDIES: ACCEPT OR DECLINE ──
app.patch('/connections/:id', (req, res) => {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
        return res.status(400).json({ error: 'status must be accepted or declined.' });
    }
    db.run(
        `UPDATE connections SET status = ? WHERE id = ?`,
        [status, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Connection not found.' });
            res.status(200).json({ message: `Connection ${status}!` });
        }
    );
});

// ── STUDY SESSIONS: CREATE ──
app.post('/study-sessions', (req, res) => {
    const { creator_id, title, course, session_date, start_time, duration_mins, location_type, location, is_group } = req.body;
    if (!creator_id || !title || !session_date || !start_time) {
        return res.status(400).json({ error: 'creator_id, title, session_date and start_time are required.' });
    }
    const query = `INSERT INTO study_sessions (creator_id, title, course, session_date, start_time, duration_mins, location_type, location, is_group)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [creator_id, title, course || null, session_date, start_time, duration_mins || 60, location_type || 'online', location || null, is_group ? 1 : 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO session_members (session_id, user_id) VALUES (?, ?)`, [this.lastID, creator_id]);
        res.status(201).json({ message: 'Study session created!', sessionId: this.lastID });
    });
});

// ── STUDY SESSIONS: GET MINE ──
app.get('/study-sessions/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `
        SELECT ss.*, u.firstName || ' ' || u.lastName AS creator_name,
               (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = ss.id) AS member_count,
               (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = ss.id AND sm.user_id = ?) AS i_joined
        FROM study_sessions ss
        JOIN users u ON ss.creator_id = u.id
        WHERE ss.creator_id = ?
           OR ss.id IN (SELECT session_id FROM session_members WHERE user_id = ?)
        ORDER BY ss.session_date ASC, ss.start_time ASC
    `;
    db.all(query, [userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(rows);
    });
});

// ── STUDY SESSIONS: GET JOINABLE GROUP SESSIONS ──
app.get('/study-sessions/group/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `
        SELECT ss.*, u.firstName || ' ' || u.lastName AS creator_name,
               (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = ss.id) AS member_count
        FROM study_sessions ss
        JOIN users u ON ss.creator_id = u.id
        WHERE ss.is_group = 1
          AND ss.creator_id != ?
          AND ss.status = 'planned'
          AND ss.id NOT IN (SELECT session_id FROM session_members WHERE user_id = ?)
        ORDER BY ss.session_date ASC, ss.start_time ASC
    `;
    db.all(query, [userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(rows);
    });
});

// ── STUDY SESSIONS: JOIN ──
app.post('/study-sessions/:id/join', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
    db.run(`INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)`, [req.params.id, user_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: 'Joined session!' });
    });
});

// ── STUDY SESSIONS: UPDATE STATUS ──
app.patch('/study-sessions/:id', (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required.' });
    db.run(`UPDATE study_sessions SET status = ? WHERE id = ?`, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Session not found.' });
        res.status(200).json({ message: 'Session updated!' });
    });
});

// ── MESSAGES: GET ALL USERS TO CHAT WITH ──
app.get('/users/:userId/contacts', (req, res) => {
    const userId = req.params.userId;
    const query = `SELECT id, firstName, lastName, course FROM users WHERE id != ?`;
    db.all(query, [userId], (err, users) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(users);
    });
});

// ── MESSAGES: GET THREAD BETWEEN TWO USERS ──
app.get('/messages/:userId/:otherId', (req, res) => {
    const { userId, otherId } = req.params;
    const query = `
        SELECT * FROM messages
        WHERE (sender_id = ? AND receiver_id = ?)
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY sent_at ASC
    `;
    db.all(query, [userId, otherId, otherId, userId], (err, msgs) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?`, [userId, otherId]);
        res.status(200).json(msgs);
    });
});

// ── MESSAGES: SEND ──
app.post('/messages', (req, res) => {
    const { sender_id, receiver_id, body } = req.body;
    if (!sender_id || !receiver_id || !body) {
        return res.status(400).json({ error: 'sender_id, receiver_id and body are required.' });
    }
    db.run(
        `INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?)`,
        [sender_id, receiver_id, body],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Message sent!', messageId: this.lastID });
        }
    );
});

// ── MESSAGES: UNREAD COUNT ──
app.get('/messages/:userId/unread', (req, res) => {
    const userId = req.params.userId;
    db.get(
        `SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0`,
        [userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(200).json({ count: row.count });
        }
    );
});

// ── TASKS: CREATE ──
app.post('/tasks', (req, res) => {
    const { user_id, title, due_date, priority, course } = req.body;
    if (!user_id || !title) {
        return res.status(400).json({ error: 'A user_id and title are required.' });
    }
    const insertQuery = `INSERT INTO tasks (user_id, title, due_date, priority, course) VALUES (?, ?, ?, ?, ?)`;
    db.run(insertQuery, [user_id, title, due_date || null, priority || 'medium', course || null], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Task created successfully!', taskId: this.lastID });
    });
});

// ── TASKS: LIST BY USER ──
app.get('/tasks/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date ASC`;
    db.all(query, [userId], (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Database error fetching tasks.' });
        res.status(200).json(tasks);
    });
});

// ── TASKS: UPDATE STATUS ──
app.patch('/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'A status value is required.' });
    const updateQuery = `UPDATE tasks SET status = ? WHERE id = ?`;
    db.run(updateQuery, [status, taskId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found.' });
        res.status(200).json({ message: 'Task updated successfully!' });
    });
});

// ── START SERVER RUNTIME ──
app.listen(PORT, () => {
    console.log(`Backend API Server running actively at http://localhost:${PORT}`);
});