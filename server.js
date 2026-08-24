const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();

const PORT = process.env.PORT || 3000;
const SECRET =
  process.env.JWT_SECRET || "CHANGE_THIS_SECRET_BEFORE_DEPLOYING";

const db = new Database("studyhub.db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================
   DATABASE
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(assignment_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);


/* =========================
   DEFAULT ADMIN
========================= */

const adminExists = db
  .prepare("SELECT id FROM users WHERE role = 'admin'")
  .get();

if (!adminExists) {

  const adminPhone =
    process.env.ADMIN_PHONE || "01700000000";

  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    "ChangeThisAdminPassword123!";

  const passwordHash =
    bcrypt.hashSync(adminPassword, 12);

  db.prepare(`
    INSERT INTO users
    (name, phone, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "StudyHub Admin",
    adminPhone,
    passwordHash,
    "admin",
    new Date().toISOString()
  );

  console.log("Default admin created.");
}


/* =========================
   AUTH MIDDLEWARE
========================= */

function authenticate(req, res, next) {

  try {

    const header =
      req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required"
      });
    }

    const token =
      header.substring(7);

    const user =
      jwt.verify(token, SECRET);

    req.user = user;

    next();

  } catch (error) {

    return res.status(401).json({
      error: "Invalid or expired login"
    });

  }

}


function adminOnly(req, res, next) {

  if (!req.user || req.user.role !== "admin") {

    return res.status(403).json({
      error: "Admin access required"
    });

  }

  next();

}


/* =========================
   REGISTER
========================= */

app.post("/api/register", (req, res) => {

  const {
    name,
    phone,
    password
  } = req.body;

  if (!name || !phone || !password) {

    return res.status(400).json({
      error: "সব তথ্য পূরণ করুন"
    });

  }

  if (password.length < 8) {

    return res.status(400).json({
      error: "Password কমপক্ষে ৮ অক্ষরের হতে হবে"
    });

  }

  try {

    const hash =
      bcrypt.hashSync(password, 12);

    db.prepare(`
      INSERT INTO users
      (name, phone, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      phone.trim(),
      hash,
      "student",
      new Date().toISOString()
    );

    res.json({
      success: true,
      message: "Account তৈরি হয়েছে"
    });

  } catch (error) {

    res.status(400).json({
      error: "এই ফোন নম্বর দিয়ে ইতিমধ্যে account আছে"
    });

  }

});


/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

  const {
    phone,
    password
  } = req.body;

  const user =
    db.prepare(
      "SELECT * FROM users WHERE phone = ?"
    ).get(phone);

  if (
    !user ||
    !bcrypt.compareSync(
      password || "",
      user.password_hash
    )
  ) {

    return res.status(401).json({
      error: "Phone number অথবা password ভুল"
    });

  }

  const token =
    jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role
      },
      SECRET,
      {
        expiresIn: "7d"
      }
    );

  res.json({

    token,

    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }

  });

});


/* =========================
   CURRENT USER
========================= */

app.get("/api/me", authenticate, (req, res) => {

  res.json(req.user);

});


/* =========================
   ASSIGNMENTS
========================= */

app.get("/api/assignments", (req, res) => {

  const assignments =
    db.prepare(`
      SELECT *
      FROM assignments
      ORDER BY id DESC
    `).all();

  res.json(assignments);

});


/* =========================
   ADMIN CREATE ASSIGNMENT
========================= */

app.post(
  "/api/assignments",
  authenticate,
  adminOnly,
  (req, res) => {

    const {
      week,
      subject,
      title,
      description
    } = req.body;

    if (
      !week ||
      !subject ||
      !title ||
      !description
    ) {

      return res.status(400).json({
        error: "সব তথ্য পূরণ করুন"
      });

    }

    const result =
      db.prepare(`
        INSERT INTO assignments
        (week, subject, title, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        week,
        subject,
        title,
        description,
        new Date().toISOString()
      );

    res.json({
      success: true,
      id: result.lastInsertRowid
    });

  }
);


/* =========================
   DELETE ASSIGNMENT
========================= */

app.delete(
  "/api/assignments/:id",
  authenticate,
  adminOnly,
  (req, res) => {

    db.prepare(
      "DELETE FROM assignments WHERE id = ?"
    ).run(req.params.id);

    res.json({
      success: true
    });

  }
);


/* =========================
   SUBMIT ASSIGNMENT
========================= */

app.post(
  "/api/assignments/:id/submissions",
  authenticate,
  (req, res) => {

    const answer =
      (req.body.answer || "").trim();

    if (!answer) {

      return res.status(400).json({
        error: "Solution লিখুন"
      });

    }

    const assignment =
      db.prepare(
        "SELECT id FROM assignments WHERE id = ?"
      ).get(req.params.id);

    if (!assignment) {

      return res.status(404).json({
        error: "Assignment পাওয়া যায়নি"
      });

    }

    try {

      const result =
        db.prepare(`
          INSERT INTO submissions
          (assignment_id, user_id, answer, created_at)
          VALUES (?, ?, ?, ?)
        `).run(
          req.params.id,
          req.user.id,
          answer,
          new Date().toISOString()
        );

      res.json({
        success: true,
        id: result.lastInsertRowid
      });

    } catch (error) {

      res.status(400).json({
        error:
          "এই assignment-এ তুমি ইতিমধ্যে submit করেছো"
      });

    }

  }
);


/* =========================
   VIEW SOLUTIONS
========================= */

app.get(
  "/api/assignments/:id/submissions",
  authenticate,
  (req, res) => {

    const submissions =
      db.prepare(`
        SELECT
          s.id,
          s.answer,
          s.created_at,
          u.name
        FROM submissions s
        JOIN users u
          ON u.id = s.user_id
        WHERE s.assignment_id = ?
        ORDER BY s.id DESC
      `).all(req.params.id);

    const result =
      submissions.map(submission => {

        const comments =
          db.prepare(`
            SELECT
              c.id,
              c.text,
              c.created_at,
              u.name
            FROM comments c
            JOIN users u
              ON u.id = c.user_id
            WHERE c.submission_id = ?
            ORDER BY c.id ASC
          `).all(submission.id);

        return {
          ...submission,
          comments
        };

      });

    res.json(result);

  }
);


/* =========================
   COMMENTS
========================= */

app.post(
  "/api/submissions/:id/comments",
  authenticate,
  (req, res) => {

    const text =
      (req.body.text || "").trim();

    if (!text) {

      return res.status(400).json({
        error: "Comment লিখুন"
      });

    }

    const submission =
      db.prepare(
        "SELECT id FROM submissions WHERE id = ?"
      ).get(req.params.id);

    if (!submission) {

      return res.status(404).json({
        error: "Submission পাওয়া যায়নি"
      });

    }

    const result =
      db.prepare(`
        INSERT INTO comments
        (submission_id, user_id, text, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        req.params.id,
        req.user.id,
        text,
        new Date().toISOString()
      );

    res.json({
      success: true,
      id: result.lastInsertRowid
    });

  }
);


/* =========================
   ADMIN: USERS
========================= */

app.get(
  "/api/admin/users",
  authenticate,
  adminOnly,
  (req, res) => {

    const users =
      db.prepare(`
        SELECT
          id,
          name,
          phone,
          role,
          created_at
        FROM users
        ORDER BY id DESC
      `).all();

    res.json(users);

  }
);


/* =========================
   ADMIN: ALL SUBMISSIONS
========================= */

app.get(
  "/api/admin/submissions",
  authenticate,
  adminOnly,
  (req, res) => {

    const submissions =
      db.prepare(`
        SELECT
          s.id,
          s.answer,
          s.created_at,
          u.name,
          u.phone,
          a.subject,
          a.title
        FROM submissions s
        JOIN users u
          ON u.id = s.user_id
        JOIN assignments a
          ON a.id = s.assignment_id
        ORDER BY s.id DESC
      `).all();

    res.json(submissions);

  }
);


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    `StudyHub BD running on port ${PORT}`
  );

});
