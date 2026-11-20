// Admin-only API. Every route in this router is either the login endpoint or
// protected by requireAdmin, which validates a server-side session AND the
// current credential version stored in the database.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const ADMIN_ID = 1;
const BCRYPT_ROUNDS = 12;
const SESSION_TTL = 30 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = [0, 15, 30, 60, 120];

// Salted bcrypt hashes of the initial password and PIN. These are bootstrap
// values only: they are inserted once into the database and never returned by
// any API. No plaintext credential exists in source code or in the database.
const INITIAL_PASSWORD_HASH = '$2b$12$k/2HYoy/PrBNkUeJtu8dS.ycRwYoxRqTsNrgfmDPsxWwqktGVsaDC';
const INITIAL_PIN_HASH = '$2b$12$cqVE0WG4x.t4W69mToI6POT6tJJgt/4oBm65FOigI58SJXg7Dy34.';
// Used only to keep failed logins against a missing row timing-similar.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.6n3z9I5f1uXa3bYFhLQqF7Bn9Xq8GZu';

const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
};

let tablesReady = null;
async function ensureTables() {
    if (tablesReady) return tablesReady;
    tablesReady = (async () => {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS admin_credentials (
                id TINYINT NOT NULL PRIMARY KEY,
                password_hash VARCHAR(255) NOT NULL,
                pin_hash VARCHAR(255) NOT NULL,
                token_version INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
        `);
        await db.execute(
            `INSERT IGNORE INTO admin_credentials (id, password_hash, pin_hash, token_version)
             VALUES (?, ?, ?, 0)`,
            [ADMIN_ID, INITIAL_PASSWORD_HASH, INITIAL_PIN_HASH]
        );
        await db.execute(`
            CREATE TABLE IF NOT EXISTS admin_login_attempts (
                attempt_key VARCHAR(100) NOT NULL PRIMARY KEY,
                failed_count INT NOT NULL DEFAULT 0,
                lock_level INT NOT NULL DEFAULT 0,
                locked_until BIGINT NULL,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS admin_message_flags (
                message_id INT NOT NULL PRIMARY KEY,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                starred TINYINT(1) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
        `);
    })().catch((err) => {
        tablesReady = null;
        throw err;
    });
    return tablesReady;
}

router.use(async (req, res, next) => {
    try {
        await ensureTables();
        next();
    } catch (err) {
        console.error('Admin table initialization failed:', err);
        res.status(500).json({ success: false, message: 'Admin service unavailable' });
    }
});

function clientKey(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return (forwarded || req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => err ? reject(err) : resolve());
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requireAdmin(req, res, next) {
    const admin = req.session && req.session.admin;
    if (!admin || !admin.expiresAt || Number(admin.expiresAt) < Date.now()) {
        if (req.session) delete req.session.admin;
        return res.status(401).json({ success: false, message: 'Admin session required' });
    }
    try {
        const [rows] = await db.execute(
            'SELECT token_version FROM admin_credentials WHERE id = ?',
            [ADMIN_ID]
        );
        if (!rows.length || Number(rows[0].token_version) !== Number(admin.version)) {
            delete req.session.admin;
            return res.status(401).json({ success: false, message: 'Admin session expired' });
        }
        req.admin = { id: ADMIN_ID, version: Number(rows[0].token_version) };
        next();
    } catch (err) {
        console.error('Admin authorization error:', err);
        res.status(500).json({ success: false, message: 'Authorization check failed' });
    }
}

// ---------- helpers for filters ----------
function text(value, max = 100) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function like(value) {
    return `%${value}%`;
}

function intInRange(value, fallback, min, max) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
}

function isoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null;
}

function sortColumn(value, allowed, fallback) {
    return Object.prototype.hasOwnProperty.call(allowed, value) ? allowed[value] : fallback;
}

function direction(value) {
    return String(value).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

function parseQuestions(raw) {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch (_) { return []; }
    }
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    return [];
}

// ---------- authentication ----------
router.post('/login', async (req, res) => {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const pin = typeof req.body.pin === 'string' ? req.body.pin : '';
    if (!password || !pin) {
        return res.status(400).json({ success: false, message: 'Password and PIN are required' });
    }

    const key = clientKey(req);
    try {
        const [attemptRows] = await db.execute(
            'SELECT failed_count, lock_level, locked_until FROM admin_login_attempts WHERE attempt_key = ?',
            [key]
        );
        const attempt = attemptRows[0];
        if (attempt && attempt.locked_until && Number(attempt.locked_until) > Date.now()) {
            return res.status(423).json({
                success: false,
                message: 'Too many failed attempts. Please try again later.',
                retryAfterSeconds: Math.ceil((Number(attempt.locked_until) - Date.now()) / 1000)
            });
        }

        const [credRows] = await db.execute(
            'SELECT password_hash, pin_hash, token_version FROM admin_credentials WHERE id = ?',
            [ADMIN_ID]
        );
        const cred = credRows[0];
        const passwordOk = await bcrypt.compare(password, cred ? cred.password_hash : DUMMY_HASH);
        const pinOk = await bcrypt.compare(pin, cred ? cred.pin_hash : DUMMY_HASH);

        if (!cred || !passwordOk || !pinOk) {
            const expiredLock = attempt && attempt.locked_until && Number(attempt.locked_until) <= Date.now();
            const previousCount = expiredLock ? 0 : Number(attempt ? attempt.failed_count : 0);
            const previousLevel = expiredLock ? 0 : Number(attempt ? attempt.lock_level : 0);
            const failedCount = previousCount + 1;
            const lockLevel = failedCount >= MAX_FAILED_ATTEMPTS
                ? Math.min(previousLevel + 1, LOCK_MINUTES.length - 1)
                : previousLevel;
            const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS
                ? Date.now() + LOCK_MINUTES[lockLevel] * 60 * 1000
                : null;
            await db.execute(
                `INSERT INTO admin_login_attempts (attempt_key, failed_count, lock_level, locked_until, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE
                    failed_count = VALUES(failed_count),
                    lock_level = VALUES(lock_level),
                    locked_until = VALUES(locked_until),
                    updated_at = CURRENT_TIMESTAMP`,
                [key, failedCount, lockLevel, lockedUntil]
            );
            await delay(350);
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }

        await db.execute('DELETE FROM admin_login_attempts WHERE attempt_key = ?', [key]);
        await regenerateSession(req);
        req.session.admin = {
            id: ADMIN_ID,
            version: Number(cred.token_version),
            expiresAt: Date.now() + SESSION_TTL
        };
        req.session.cookie.maxAge = SESSION_TTL;
        return res.json({ success: true, message: 'Admin authenticated' });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

router.get('/session', requireAdmin, (req, res) => {
    res.json({
        success: true,
        admin: { id: req.admin.id, role: 'admin', expiresAt: Number(req.session.admin.expiresAt) }
    });
});

router.post('/logout', requireAdmin, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Admin logout error:', err);
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.clearCookie('pinnacle.sid', cookieOptions);
        res.json({ success: true, message: 'Logged out' });
    });
});

router.put('/credentials', requireAdmin, async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const currentPin = typeof req.body.currentPin === 'string' ? req.body.currentPin : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    const newPin = typeof req.body.newPin === 'string' ? req.body.newPin : '';

    if (!currentPassword || !currentPin || !newPassword || !newPin) {
        return res.status(400).json({ success: false, message: 'All credential fields are required' });
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
        return res.status(400).json({ success: false, message: 'New password must be 12-128 characters' });
    }
    if (!/^\d{6}$/.test(newPin)) {
        return res.status(400).json({ success: false, message: 'New PIN must be exactly 6 digits' });
    }

    try {
        const [rows] = await db.execute(
            'SELECT password_hash, pin_hash FROM admin_credentials WHERE id = ?',
            [ADMIN_ID]
        );
        if (!rows.length) return res.status(500).json({ success: false, message: 'Admin account unavailable' });

        const [currentOk, pinOk, samePassword, samePin] = await Promise.all([
            bcrypt.compare(currentPassword, rows[0].password_hash),
            bcrypt.compare(currentPin, rows[0].pin_hash),
            bcrypt.compare(newPassword, rows[0].password_hash),
            bcrypt.compare(newPin, rows[0].pin_hash)
        ]);
        if (!currentOk || !pinOk) {
            await delay(350);
            return res.status(403).json({ success: false, message: 'Current password or PIN is incorrect' });
        }
        if (samePassword || samePin) {
            return res.status(400).json({ success: false, message: 'New credentials must differ from the current ones' });
        }

        const [newPasswordHash, newPinHash] = await Promise.all([
            bcrypt.hash(newPassword, BCRYPT_ROUNDS),
            bcrypt.hash(newPin, BCRYPT_ROUNDS)
        ]);
        await db.execute(
            `UPDATE admin_credentials
             SET password_hash = ?, pin_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newPasswordHash, newPinHash, ADMIN_ID]
        );

        // Rotate the session and bump the version so other sessions are invalidated.
        await regenerateSession(req);
        const [versionRows] = await db.execute(
            'SELECT token_version FROM admin_credentials WHERE id = ?',
            [ADMIN_ID]
        );
        req.session.admin = {
            id: ADMIN_ID,
            version: Number(versionRows[0].token_version),
            expiresAt: Date.now() + SESSION_TTL
        };
        req.session.cookie.maxAge = SESSION_TTL;
        res.json({ success: true, message: 'Password and PIN updated successfully' });
    } catch (err) {
        console.error('Admin credential update error:', err);
        res.status(500).json({ success: false, message: 'Could not update credentials' });
    }
});

// ---------- dashboard data (all database-driven) ----------
router.get('/overview', requireAdmin, async (req, res) => {
    try {
        const [
            [studentRows], [facultyRows], [testRows], [resultRows],
            [paymentRows], [messageRows], [visitorRows], [feeRows],
            [domainRows], [typeRows], [recentStudents], [recentTests], [recentMessages]
        ] = await Promise.all([
            db.execute('SELECT COUNT(*) AS total FROM students'),
            db.execute('SELECT COUNT(*) AS total FROM faculty'),
            db.execute('SELECT COUNT(*) AS total FROM tests'),
            db.execute('SELECT COUNT(*) AS total, COUNT(DISTINCT student_id) AS students FROM test_results'),
            db.execute(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN payment_status = 'SUCCESS' THEN amount_paid ELSE 0 END), 0) AS collected FROM payment_history`),
            db.execute('SELECT COUNT(*) AS total FROM contact_messages'),
            db.execute('SELECT COUNT(*) AS total FROM visitors'),
            db.execute('SELECT COALESCE(SUM(total_fees),0) AS totalFees, COALESCE(SUM(fees_paid),0) AS feesPaid, COALESCE(SUM(remaining_fees),0) AS remaining FROM students'),
            db.execute('SELECT domain, COUNT(*) AS total FROM students GROUP BY domain ORDER BY total DESC'),
            db.execute('SELECT test_type, COUNT(*) AS total FROM tests GROUP BY test_type ORDER BY total DESC'),
            db.execute(`SELECT student_id, name, domain, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date,
                            created_at FROM students ORDER BY COALESCE(created_at, enrollment_date) DESC LIMIT 5`),
            db.execute('SELECT test_id, title, test_type, published_at FROM tests ORDER BY published_at DESC LIMIT 5'),
            db.execute('SELECT id, name, email, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 5')
        ]);
        res.json({
            success: true,
            counts: {
                students: Number(studentRows[0].total),
                faculty: Number(facultyRows[0].total),
                exams: Number(testRows[0].total),
                attempts: Number(resultRows[0].total),
                studentsWithAttempts: Number(resultRows[0].students),
                payments: Number(paymentRows[0].total),
                messages: Number(messageRows[0].total),
                visitors: Number(visitorRows[0].total)
            },
            fees: {
                totalFees: Number(feeRows[0].totalFees),
                feesPaid: Number(feeRows[0].feesPaid),
                remaining: Number(feeRows[0].remaining),
                collected: Number(paymentRows[0].collected)
            },
            byDomain: domainRows,
            byTestType: typeRows,
            recentStudents,
            recentExams: recentTests,
            recentMessages
        });
    } catch (err) {
        console.error('Admin overview error:', err);
        res.status(500).json({ success: false, message: 'Could not load overview' });
    }
});

router.get('/students', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const domain = text(req.query.domain, 50);
    const status = text(req.query.status, 20);
    const limit = intInRange(req.query.limit, 25, 1, 200);
    const page = intInRange(req.query.page, 1, 1, 100000);
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    if (q) {
        where.push('(s.student_id LIKE ? OR s.name LIKE ? OR s.domain LIKE ?)');
        params.push(like(q), like(q), like(q));
    }
    if (domain) { where.push('s.domain = ?'); params.push(domain); }
    if (status === 'paid') where.push('s.remaining_fees <= 0');
    else if (status === 'unpaid') where.push('s.fees_paid <= 0');
    else if (status === 'partial') where.push('s.fees_paid > 0 AND s.remaining_fees > 0');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = sortColumn(req.query.sort, {
        student_id: 's.student_id', name: 's.name', enrollment_date: 's.enrollment_date',
        created_at: 's.created_at', fees_paid: 's.fees_paid', remaining_fees: 's.remaining_fees'
    }, 's.student_id');
    try {
        const [[countRows]] = await Promise.all([
            db.execute(`SELECT COUNT(*) AS total FROM students s ${whereSql}`, params)
        ]);
        const [rows] = await db.execute(
            `SELECT s.student_id, s.name, s.domain, s.total_fees, s.fees_paid, s.remaining_fees,
                DATE_FORMAT(s.enrollment_date, '%Y-%m-%d') AS enrollment_date, s.created_at,
                (SELECT COUNT(*) FROM payment_history p WHERE p.student_id = s.student_id) AS payment_count,
                (SELECT COUNT(*) FROM test_results r WHERE r.student_id = s.student_id) AS attempt_count
             FROM students s ${whereSql}
             ORDER BY ${sort} ${direction(req.query.order)}, s.id ASC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.json({ success: true, records: rows, total: Number(countRows[0].total), page, limit });
    } catch (err) {
        console.error('Admin students error:', err);
        res.status(500).json({ success: false, message: 'Could not load students' });
    }
});

router.get('/students/:studentId', requireAdmin, async (req, res) => {
    try {
        const id = text(req.params.studentId, 30);
        const [[studentRows], [paymentRows], [resultRows]] = await Promise.all([
            db.execute(`SELECT student_id, name, domain, DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
                            total_fees, fees_paid, remaining_fees,
                            DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, created_at
                        FROM students WHERE student_id = ?`, [id]),
            db.execute('SELECT * FROM payment_history WHERE student_id = ? ORDER BY paid_at DESC', [id]),
            db.execute(`SELECT r.*, t.title, t.test_type FROM test_results r
                        LEFT JOIN tests t ON t.test_id = r.test_id
                        WHERE r.student_id = ? ORDER BY r.submitted_at DESC`, [id])
        ]);
        if (!studentRows.length) return res.status(404).json({ success: false, message: 'Student not found' });
        res.json({ success: true, student: studentRows[0], payments: paymentRows, results: resultRows });
    } catch (err) {
        console.error('Admin student detail error:', err);
        res.status(500).json({ success: false, message: 'Could not load student profile' });
    }
});

router.get('/faculty', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const domain = text(req.query.domain, 50);
    const where = [];
    const params = [];
    if (q) {
        where.push('(f.faculty_id LIKE ? OR f.name LIKE ? OR f.mail LIKE ? OR f.mobile LIKE ?)');
        params.push(like(q), like(q), like(q), like(q));
    }
    if (domain) { where.push('f.domain = ?'); params.push(domain); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = sortColumn(req.query.sort, {
        faculty_id: 'f.faculty_id', name: 'f.name', domain: 'f.domain',
        enrollment_date: 'f.enrollment_date', created_at: 'f.created_at'
    }, 'f.faculty_id');
    try {
        const [[countRows], [rows]] = await Promise.all([
            db.execute(`SELECT COUNT(*) AS total FROM faculty f ${whereSql}`, params),
            db.execute(
                `SELECT f.*, (SELECT COUNT(*) FROM tests t WHERE t.faculty_id = f.faculty_id) AS published_tests
                 FROM faculty f ${whereSql}
                 ORDER BY ${sort} ${direction(req.query.order)}, f.id ASC`,
                params
            )
        ]);
        res.json({ success: true, records: rows, total: Number(countRows[0].total) });
    } catch (err) {
        console.error('Admin faculty error:', err);
        res.status(500).json({ success: false, message: 'Could not load faculty' });
    }
});

router.get('/faculty/:facultyId', requireAdmin, async (req, res) => {
    try {
        const id = text(req.params.facultyId, 30);
        const [[rows], [tests]] = await Promise.all([
            db.execute(`SELECT id, faculty_id, name, address, domain, mobile, mail,
                            DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
                            qualifications, achievements, awards,
                            DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date, created_at
                        FROM faculty WHERE faculty_id = ?`, [id]),
            db.execute('SELECT test_id, title, test_type, published_at FROM tests WHERE faculty_id = ? ORDER BY published_at DESC', [id])
        ]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Faculty member not found' });
        res.json({ success: true, faculty: rows[0], exams: tests });
    } catch (err) {
        console.error('Admin faculty detail error:', err);
        res.status(500).json({ success: false, message: 'Could not load faculty profile' });
    }
});

router.get('/exams', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const type = text(req.query.type, 20);
    const facultyId = text(req.query.facultyId, 30);
    const status = text(req.query.status, 20);
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    const where = [];
    const params = [];
    if (q) {
        where.push('(t.test_id LIKE ? OR t.title LIKE ? OR t.faculty_name LIKE ?)');
        params.push(like(q), like(q), like(q));
    }
    if (type) { where.push('t.test_type = ?'); params.push(type); }
    if (facultyId) { where.push('t.faculty_id = ?'); params.push(facultyId); }
    if (from) { where.push('t.published_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('t.published_at <= ?'); params.push(`${to} 23:59:59`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const having = status === 'completed' ? 'HAVING attempt_count > 0'
        : status === 'pending' ? 'HAVING attempt_count = 0' : '';
    const sort = sortColumn(req.query.sort, {
        published_at: 't.published_at', title: 't.title', test_type: 't.test_type'
    }, 't.published_at');
    try {
        const [rows] = await db.execute(
            `SELECT t.test_id, t.title, t.test_type, t.faculty_id, t.faculty_name, t.published_at, t.questions,
                (SELECT COUNT(*) FROM test_results r WHERE r.test_id = t.test_id) AS attempt_count,
                (SELECT MAX(r.submitted_at) FROM test_results r WHERE r.test_id = t.test_id) AS last_submission_at
             FROM tests t ${whereSql}
             ${having}
             ORDER BY ${sort} ${direction(req.query.order)}, t.id DESC`,
            params
        );
        const records = rows.map((row) => {
            const questions = parseQuestions(row.questions);
            const subjects = [...new Set(questions.map((item) => item && item.subject).filter(Boolean))];
            delete row.questions;
            return {
                ...row,
                attempt_count: Number(row.attempt_count),
                question_count: questions.length,
                subjects,
                state: Number(row.attempt_count) > 0 ? 'completed' : 'pending'
            };
        });
        res.json({
            success: true,
            records,
            note: 'Schedule, timing and instructions are not stored in the database. State is derived from recorded submissions.'
        });
    } catch (err) {
        console.error('Admin exams error:', err);
        res.status(500).json({ success: false, message: 'Could not load exams' });
    }
});

router.get('/exams/:testId', requireAdmin, async (req, res) => {
    try {
        const id = text(req.params.testId, 50);
        const [[rows], [results], [stats]] = await Promise.all([
            db.execute('SELECT * FROM tests WHERE test_id = ?', [id]),
            db.execute(`SELECT r.*, s.domain AS student_domain FROM test_results r
                        LEFT JOIN students s ON s.student_id = r.student_id
                        WHERE r.test_id = ? ORDER BY r.score DESC, r.submitted_at DESC`, [id]),
            db.execute(`SELECT COUNT(*) AS attempts, AVG(score) AS average, MAX(score) AS highest, MIN(score) AS lowest
                        FROM test_results WHERE test_id = ?`, [id])
        ]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Exam not found' });
        res.json({
            success: true,
            exam: { ...rows[0], questions: parseQuestions(rows[0].questions) },
            results,
            stats: stats[0]
        });
    } catch (err) {
        console.error('Admin exam detail error:', err);
        res.status(500).json({ success: false, message: 'Could not load exam details' });
    }
});

router.get('/performance', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const testId = text(req.query.testId, 50);
    const studentId = text(req.query.studentId, 30);
    const domain = text(req.query.domain, 50);
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    const limit = intInRange(req.query.limit, 50, 1, 500);
    const where = [];
    const params = [];
    if (q) {
        where.push('(r.student_id LIKE ? OR r.student_name LIKE ? OR t.title LIKE ?)');
        params.push(like(q), like(q), like(q));
    }
    if (testId) { where.push('r.test_id = ?'); params.push(testId); }
    if (studentId) { where.push('r.student_id = ?'); params.push(studentId); }
    if (domain) { where.push('s.domain = ?'); params.push(domain); }
    if (from) { where.push('r.submitted_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('r.submitted_at <= ?'); params.push(`${to} 23:59:59`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = sortColumn(req.query.sort, {
        score: 'r.score', submitted_at: 'r.submitted_at', student_id: 'r.student_id'
    }, 'r.submitted_at');
    try {
        const [rows] = await db.execute(
            `SELECT r.*, s.domain AS student_domain, t.title AS exam_title, t.test_type
             FROM test_results r
             LEFT JOIN students s ON s.student_id = r.student_id
             LEFT JOIN tests t ON t.test_id = r.test_id
             ${whereSql}
             ORDER BY ${sort} ${direction(req.query.order)}, r.id DESC
             LIMIT ${limit}`,
            params
        );
        // Dense ranks are computed per exam from the actual stored scores.
        const groups = new Map();
        rows.forEach((row) => {
            const key = row.test_id || '';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });
        groups.forEach((group) => {
            group.sort((a, b) => Number(b.score) - Number(a.score));
            let previousScore = null;
            let rank = 0;
            group.forEach((row, index) => {
                const score = Number(row.score);
                if (score !== previousScore) { rank = index + 1; previousScore = score; }
                row.rank = rank;
                row.exam_size = group.length;
            });
        });
        const [metricsRows] = await db.execute(
            `SELECT COUNT(*) AS attempts, COUNT(DISTINCT student_id) AS students,
                    COALESCE(AVG(score),0) AS average_score, COALESCE(MAX(score),0) AS highest_score,
                    COALESCE(MIN(score),0) AS lowest_score
             FROM test_results`
        );
        res.json({
            success: true,
            records: rows,
            metrics: metricsRows[0],
            note: 'Ranks are dense ranks computed from submitted scores for each exam.'
        });
    } catch (err) {
        console.error('Admin performance error:', err);
        res.status(500).json({ success: false, message: 'Could not load performance data' });
    }
});

router.get('/syllabus', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT test_id, title, test_type, questions, published_at FROM tests ORDER BY published_at DESC');
        const subjectMap = new Map();
        rows.forEach((row) => {
            parseQuestions(row.questions).forEach((question) => {
                if (!question || !question.subject) return;
                const subject = String(question.subject);
                const key = `${row.test_id}|${subject}`;
                if (!subjectMap.has(key)) {
                    subjectMap.set(key, {
                        subject,
                        test_id: row.test_id,
                        exam_title: row.title,
                        test_type: row.test_type,
                        published_at: row.published_at,
                        question_count: 0
                    });
                }
                subjectMap.get(key).question_count += 1;
            });
        });
        const subjects = [...subjectMap.values()];
        res.json({
            success: true,
            records: subjects,
            note: 'No syllabus table exists. These subjects are read from questions stored in published exams. Detailed syllabi remain in the static syllabus pages.'
        });
    } catch (err) {
        console.error('Admin syllabus error:', err);
        res.status(500).json({ success: false, message: 'Could not load syllabus information' });
    }
});

router.get('/fees', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const domain = text(req.query.domain, 50);
    const status = text(req.query.status, 20);
    const where = [];
    const params = [];
    if (q) {
        where.push('(student_id LIKE ? OR name LIKE ?)');
        params.push(like(q), like(q));
    }
    if (domain) { where.push('domain = ?'); params.push(domain); }
    if (status === 'paid') where.push('remaining_fees <= 0');
    else if (status === 'unpaid') where.push('fees_paid <= 0');
    else if (status === 'partial') where.push('fees_paid > 0 AND remaining_fees > 0');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = sortColumn(req.query.sort, {
        student_id: 'student_id', name: 'name', total_fees: 'total_fees',
        fees_paid: 'fees_paid', remaining_fees: 'remaining_fees'
    }, 'student_id');
    try {
        const [[countRows], [rows], [summaryRows]] = await Promise.all([
            db.execute(`SELECT COUNT(*) AS total FROM students ${whereSql}`, params),
            db.execute(
                `SELECT student_id, name, domain, total_fees, fees_paid, remaining_fees,
                    DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date,
                    (SELECT COUNT(*) FROM payment_history p WHERE p.student_id = students.student_id) AS payment_count
                 FROM students ${whereSql}
                 ORDER BY ${sort} ${direction(req.query.order)}, id ASC`,
                params
            ),
            db.execute('SELECT COALESCE(SUM(total_fees),0) AS totalFees, COALESCE(SUM(fees_paid),0) AS feesPaid, COALESCE(SUM(remaining_fees),0) AS remaining FROM students')
        ]);
        res.json({ success: true, records: rows, total: Number(countRows[0].total), summary: summaryRows[0] });
    } catch (err) {
        console.error('Admin fees error:', err);
        res.status(500).json({ success: false, message: 'Could not load fee records' });
    }
});

router.get('/fees/payments', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const status = text(req.query.status, 20);
    const paymentType = text(req.query.type, 30);
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    const where = [];
    const params = [];
    if (q) {
        where.push('(p.student_id LIKE ? OR s.name LIKE ? OR p.razorpay_payment_id LIKE ?)');
        params.push(like(q), like(q), like(q));
    }
    if (status) { where.push('p.payment_status = ?'); params.push(status); }
    if (paymentType) { where.push('p.payment_type = ?'); params.push(paymentType); }
    if (from) { where.push('p.paid_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('p.paid_at <= ?'); params.push(`${to} 23:59:59`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    try {
        const [rows] = await db.execute(
            `SELECT p.*, s.name AS student_name, s.domain
             FROM payment_history p LEFT JOIN students s ON s.student_id = p.student_id
             ${whereSql} ORDER BY p.paid_at DESC, p.id DESC`,
            params
        );
        res.json({ success: true, records: rows, total: rows.length });
    } catch (err) {
        console.error('Admin payments error:', err);
        res.status(500).json({ success: false, message: 'Could not load payment records' });
    }
});

router.get('/academic-content', requireAdmin, (req, res) => {
    res.json({
        success: true,
        timetables: [],
        guidelines: [],
        announcements: [],
        note: 'Timetables, guidelines and announcements are not stored in the database. No records are shown rather than displaying sample data.'
    });
});

router.get('/programs', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT domain AS program, COUNT(*) AS student_count,
                    COALESCE(SUM(total_fees),0) AS total_fees,
                    COALESCE(SUM(fees_paid),0) AS fees_paid,
                    COALESCE(SUM(remaining_fees),0) AS remaining_fees
             FROM students GROUP BY domain ORDER BY student_count DESC, domain ASC`
        );
        res.json({
            success: true,
            records: rows,
            note: 'Program statistics are derived from student domains. Detailed program descriptions live in the static programmes page.'
        });
    } catch (err) {
        console.error('Admin programs error:', err);
        res.status(500).json({ success: false, message: 'Could not load program statistics' });
    }
});

router.get('/messages', requireAdmin, async (req, res) => {
    const q = text(req.query.q);
    const readFilter = text(req.query.read, 10);
    const starred = text(req.query.starred, 10);
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    const where = [];
    const params = [];
    if (q) {
        where.push('(m.name LIKE ? OR m.email LIKE ? OR m.message LIKE ?)');
        params.push(like(q), like(q), like(q));
    }
    if (readFilter === 'read') where.push('COALESCE(f.is_read,0) = 1');
    else if (readFilter === 'unread') where.push('COALESCE(f.is_read,0) = 0');
    if (starred === 'yes') where.push('COALESCE(f.starred,0) = 1');
    if (from) { where.push('m.created_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('m.created_at <= ?'); params.push(`${to} 23:59:59`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = sortColumn(req.query.sort, {
        created_at: 'm.created_at', name: 'm.name', email: 'm.email'
    }, 'm.created_at');
    try {
        const [[countRows], [rows]] = await Promise.all([
            db.execute(`SELECT COUNT(*) AS total FROM contact_messages m LEFT JOIN admin_message_flags f ON f.message_id = m.id ${whereSql}`, params),
            db.execute(
                `SELECT m.id, m.name, m.mobile, m.email, m.location,
                    DATE_FORMAT(m.dob, '%Y-%m-%d') AS dob, m.message, m.created_at,
                    COALESCE(f.is_read,0) AS is_read, COALESCE(f.starred,0) AS starred
                 FROM contact_messages m LEFT JOIN admin_message_flags f ON f.message_id = m.id
                 ${whereSql} ORDER BY ${sort} ${direction(req.query.order)}, m.id DESC`,
                params
            )
        ]);
        res.json({ success: true, records: rows, total: Number(countRows[0].total) });
    } catch (err) {
        console.error('Admin messages error:', err);
        res.status(500).json({ success: false, message: 'Could not load messages' });
    }
});

router.patch('/messages/:id', requireAdmin, async (req, res) => {
    const id = intInRange(req.params.id, 0, 1, 2147483647);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid message id' });
    const isRead = req.body.isRead === true ? 1 : 0;
    const starred = req.body.starred === true ? 1 : 0;
    try {
        await db.execute(
            `INSERT INTO admin_message_flags (message_id, is_read, starred, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE is_read = VALUES(is_read), starred = VALUES(starred), updated_at = CURRENT_TIMESTAMP`,
            [id, isRead, starred]
        );
        res.json({ success: true, message: 'Message updated' });
    } catch (err) {
        console.error('Admin message update error:', err);
        res.status(500).json({ success: false, message: 'Could not update message' });
    }
});

router.delete('/messages/:id', requireAdmin, async (req, res) => {
    const id = intInRange(req.params.id, 0, 1, 2147483647);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid message id' });
    try {
        await db.execute('DELETE FROM admin_message_flags WHERE message_id = ?', [id]);
        const [result] = await db.execute('DELETE FROM contact_messages WHERE id = ?', [id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Message not found' });
        res.json({ success: true, message: 'Message deleted' });
    } catch (err) {
        console.error('Admin message delete error:', err);
        res.status(500).json({ success: false, message: 'Could not delete message' });
    }
});

router.get('/gate-jee', requireAdmin, async (req, res) => {
    try {
        const [[categoryRows], [attemptRows], [detailRows]] = await Promise.all([
            db.execute(
                `SELECT CASE WHEN domain LIKE 'MTECH%' THEN 'GATE'
                             WHEN domain LIKE '%JEE%' THEN 'JEE' ELSE 'OTHER' END AS category,
                        COUNT(*) AS student_count,
                        COALESCE(SUM(total_fees),0) AS total_fees,
                        COALESCE(SUM(fees_paid),0) AS fees_paid,
                        COALESCE(SUM(remaining_fees),0) AS remaining_fees
                 FROM students GROUP BY category ORDER BY student_count DESC`
            ),
            db.execute(
                `SELECT CASE WHEN s.domain LIKE 'MTECH%' THEN 'GATE'
                             WHEN s.domain LIKE '%JEE%' THEN 'JEE' ELSE 'OTHER' END AS category,
                        COUNT(*) AS attempts, COALESCE(AVG(r.score),0) AS average_score,
                        COALESCE(MAX(r.score),0) AS highest_score
                 FROM test_results r JOIN students s ON s.student_id = r.student_id
                 GROUP BY category`
            ),
            db.execute(
                `SELECT student_id, name, domain, DATE_FORMAT(enrollment_date, '%Y-%m-%d') AS enrollment_date,
                        total_fees, fees_paid, remaining_fees
                 FROM students WHERE domain LIKE 'MTECH%' OR domain LIKE '%JEE%'
                 ORDER BY domain, name`
            )
        ]);
        const attemptsByCategory = new Map(attemptRows.map((row) => [row.category, row]));
        const categories = categoryRows.map((row) => ({
            ...row,
            attempts: attemptsByCategory.has(row.category) ? Number(attemptsByCategory.get(row.category).attempts) : 0,
            average_score: attemptsByCategory.has(row.category) ? Number(attemptsByCategory.get(row.category).average_score) : 0,
            highest_score: attemptsByCategory.has(row.category) ? Number(attemptsByCategory.get(row.category).highest_score) : 0
        }));
        res.json({
            success: true,
            categories,
            records: detailRows,
            note: 'GATE and JEE counts are derived from student domains. The database does not distinguish JEE Main from JEE Advanced.'
        });
    } catch (err) {
        console.error('Admin GATE/JEE error:', err);
        res.status(500).json({ success: false, message: 'Could not load GATE/JEE statistics' });
    }
});

module.exports = router;
