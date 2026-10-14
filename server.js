const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT || 3000);
const dbPath = path.join(__dirname, 'data', 'civicpulse.db');
const db = new Database(dbPath);

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@civicpulse.local';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || 'Ali Khan';
const DEFAULT_RULES = {
  baseHigh: 72,
  baseMedium: 48,
  ageBoost: 1.4,
  duplicateBoost: 12,
  urgentBoost: 18
};
const SAMPLE_REPORT_OVERRIDES = {
  'CP-2481': { legacyTitle: 'Streetlight out on Cedar Avenue', title: 'Streetlight out near Jinnah Road', description: 'A streetlight near Jinnah Road has been out for three nights, leaving the roadside dark for people walking home.', location: 'Jinnah Road near Liaquat Bazaar', area: 'Quetta, Balochistan', lat: 30.1798, lng: 66.975 },
  'CP-2479': { legacyTitle: 'Large pothole near school crossing', title: 'Pothole near a school crossing', description: 'A deep pothole near a school crossing is forcing drivers to swerve around it.', location: 'Mall Road near the old city', area: 'Lahore, Punjab', lat: 31.558, lng: 74.35 },
  'CP-2478': { legacyTitle: 'Overflowing bin beside bus stop', title: 'Overflowing bin beside Hyderabad bus stop', description: 'The public bin is full and waste is spilling onto the pavement beside the bus stop.', location: 'Autobahn Road near the bus stop', area: 'Hyderabad, Sindh', lat: 25.396, lng: 68.358 },
  'CP-2476': { legacyTitle: 'Water pooling at the corner', title: 'Water pooling near the main bazaar', description: 'Water is pooling around a storm drain after rain and making the bazaar crossing difficult to use.', location: 'Nawaz Sharif Chowk near the bazaar', area: 'Mingora, Khyber Pakhtunkhwa', lat: 34.779, lng: 72.362 },
  'CP-2474': { legacyTitle: 'Street light flickering at corner', title: 'Streetlight flickering near Jinnah Road', description: 'The streetlight near Jinnah Road flickers and goes dark for long stretches every evening.', location: 'Jinnah Road near Liaquat Bazaar', area: 'Quetta, Balochistan', lat: 30.181, lng: 66.977 }
};

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      area TEXT NOT NULL,
      priority TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Submitted',
      reported_at INTEGER NOT NULL,
      department TEXT,
      reporter TEXT DEFAULT 'Resident',
      image TEXT,
      lat REAL,
      lng REAL,
      duplicate_of TEXT,
      resolution TEXT,
      resolution_image TEXT,
      resolved_at INTEGER,
      history TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS priority_rules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      rules TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  const rulesExists = db.prepare('SELECT 1 FROM priority_rules WHERE id = 1').get();
  if (!rulesExists) {
    db.prepare('INSERT INTO priority_rules (id, rules, updated_at) VALUES (?, ?, ?)')
      .run(1, JSON.stringify(DEFAULT_RULES), Date.now());
  }

  const adminExists = db.prepare('SELECT 1 FROM admin_users WHERE email = ?').get(DEFAULT_ADMIN_EMAIL);
  if (!adminExists) {
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)')
      .run(DEFAULT_ADMIN_EMAIL, sha256(DEFAULT_ADMIN_PASSWORD));
  }

  const seed = getDefaultReports().map((report) => {
    const { legacyTitle, ...override } = SAMPLE_REPORT_OVERRIDES[report.id] || {};
    return { ...report, ...override };
  });
  const migrateLegacySample = db.prepare(`
    UPDATE reports SET
      title = @title, description = @description, location = @location, area = @area,
      lat = @lat, lng = @lng
    WHERE id = @id AND title = @legacyTitle
  `);
  for (const report of seed) {
    const legacyTitle = SAMPLE_REPORT_OVERRIDES[report.id]?.legacyTitle;
    if (legacyTitle) migrateLegacySample.run({ ...report, legacyTitle });
  }
  const insert = db.prepare(`
    INSERT OR IGNORE INTO reports (
      id, title, description, category, location, area, priority, score, status,
      reported_at, department, reporter, image, lat, lng, duplicate_of,
      resolution, resolution_image, resolved_at, history
    ) VALUES (
      @id, @title, @description, @category, @location, @area, @priority, @score, @status,
      @reportedAt, @department, @reporter, @image, @lat, @lng, @duplicateOf,
      @resolution, @resolutionImage, @resolvedAt, @history
    )
  `);
  const insertMissingSamples = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMissingSamples(seed);
}

function getDefaultReports() {
  const now = Date.now();
  return [
    { id: 'CP-2481', title: 'Streetlight out on Cedar Avenue', description: 'The streetlight on Cedar Avenue has been out for three nights. The corner is very dark for people walking home.', category: 'Streetlight', location: 'Cedar Ave & 8th St', area: 'Northside', priority: 'High', score: 88, status: 'Submitted', reportedAt: now - 1000 * 60 * 32, department: 'Public Works', reporter: 'Maya R.', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', lat: 40.7134, lng: -73.9921, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 32, note: 'Report received' }]) },
    { id: 'CP-2479', title: 'Large pothole near school crossing', description: 'Deep pothole in the road near the elementary school crossing. Drivers are swerving around it.', category: 'Road damage', location: 'Juniper St, near #42', area: 'Old Market', priority: 'High', score: 81, status: 'In progress', reportedAt: now - 1000 * 60 * 60 * 3, department: 'Roads & Transport', reporter: 'Daniel K.', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=240&q=75', lat: 40.7172, lng: -73.9867, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 3, note: 'Report received' }, { status: 'In progress', time: now - 1000 * 60 * 38, note: 'Assigned to Roads & Transport' }]) },
    { id: 'CP-2478', title: 'Overflowing bin beside bus stop', description: 'Public bin is full and waste is spilling onto the sidewalk. This has been building up since yesterday.', category: 'Waste', location: 'Riverside bus stop', area: 'River Ward', priority: 'Medium', score: 63, status: 'Submitted', reportedAt: now - 1000 * 60 * 60 * 5, department: 'Sanitation', reporter: 'A resident', image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=240&q=75', lat: 40.7098, lng: -73.9802, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 5, note: 'Report received' }]) },
    { id: 'CP-2476', title: 'Water pooling at the corner', description: 'Water is pooling around a storm drain after the rain, making the crossing difficult to use.', category: 'Water & drainage', location: 'Willow Lane & 3rd', area: 'Park East', priority: 'Medium', score: 58, status: 'Submitted', reportedAt: now - 1000 * 60 * 60 * 8, department: 'Water Services', reporter: 'Jordan P.', image: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?auto=format&fit=crop&w=240&q=75', lat: 40.7214, lng: -73.9746, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 8, note: 'Report received' }]) },
    { id: 'CP-2474', title: 'Street light flickering at corner', description: 'The lamp at Cedar and 8th keeps flickering and goes dark for long stretches every evening.', category: 'Streetlight', location: 'Cedar Ave & 8th St', area: 'Northside', priority: 'High', score: 78, status: 'Submitted', reportedAt: now - 1000 * 60 * 60 * 11, department: 'Public Works', reporter: 'Luis M.', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', lat: 40.7138, lng: -73.9918, duplicateOf: 'CP-2481', resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 11, note: 'Possible duplicate of CP-2481' }]) },
    { id: 'CP-2473', title: 'Blocked drain beside the municipal market', description: 'The drain is blocked after rain and water is collecting along the bazaar road.', category: 'Water & drainage', location: 'Military Road near the municipal market', area: 'Sukkur, Sindh', priority: 'Medium', score: 61, status: 'In progress', reportedAt: now - 1000 * 60 * 60 * 19, department: 'Water Services', reporter: 'Priya S.', image: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?auto=format&fit=crop&w=240&q=75', lat: 27.705, lng: 68.857, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 19, note: 'Report received' }, { status: 'In progress', time: now - 1000 * 60 * 60 * 13, note: 'Crew dispatched' }]) },
    { id: 'CP-2471', title: 'Missed waste collection near the public park', description: 'Waste collection has been missed and bags are blocking the street near the park entrance.', category: 'Waste', location: 'Circular Road near the public park', area: 'Bahawalpur, Punjab', priority: 'Low', score: 42, status: 'Submitted', reportedAt: now - 1000 * 60 * 60 * 26, department: 'Sanitation', reporter: 'A resident', image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=240&q=75', lat: 29.395, lng: 71.683, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 26, note: 'Report received' }]) },
    { id: 'CP-2468', title: 'Broken pavement beside the public library', description: 'A raised pavement slab outside the library entrance is a trip hazard for residents.', category: 'Road damage', location: 'Main Mansehra Road near the library', area: 'Abbottabad, Khyber Pakhtunkhwa', priority: 'Medium', score: 57, status: 'In progress', reportedAt: now - 1000 * 60 * 60 * 31, department: 'Roads & Transport', reporter: 'Sam T.', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=240&q=75', lat: 34.146, lng: 73.211, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 31, note: 'Report received' }, { status: 'In progress', time: now - 1000 * 60 * 60 * 9, note: 'Repair scheduled' }]) },
    { id: 'CP-2465', title: 'Water leak near the old jetty', description: 'A steady leak is making the public walkway slippery near the jetty.', category: 'Water & drainage', location: 'Marine Drive near the old jetty', area: 'Gwadar, Balochistan', priority: 'High', score: 84, status: 'In progress', reportedAt: now - 1000 * 60 * 60 * 36, department: 'Water Services', reporter: 'Nora B.', image: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?auto=format&fit=crop&w=240&q=75', lat: 25.126, lng: 62.322, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 36, note: 'Report received' }, { status: 'In progress', time: now - 1000 * 60 * 60 * 20, note: 'Water Services notified' }]) },
    { id: 'CP-2461', title: 'Streetlight not working near the central bazaar', description: 'The streetlight on the main road is not turning on after sunset.', category: 'Streetlight', location: 'College Road near the central bazaar', area: 'Skardu, Gilgit-Baltistan', priority: 'Low', score: 39, status: 'Resolved', reportedAt: now - 1000 * 60 * 60 * 50, department: 'Public Works', reporter: 'Mina H.', image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', lat: 35.297, lng: 75.633, duplicateOf: null, resolution: 'Replaced the faulty lamp and tested the fixture after dark.', resolutionImage: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=240&q=75', resolvedAt: now - 1000 * 60 * 60 * 18, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 50, note: 'Report received' }, { status: 'In progress', time: now - 1000 * 60 * 60 * 34, note: 'Repair crew assigned' }, { status: 'Resolved', time: now - 1000 * 60 * 60 * 18, note: 'Lamp replaced; fixture tested' }]) },
    { id: 'CP-2458', title: 'Missed bin pickup near the neighbourhood park', description: 'The public bin at the park entrance has not been emptied this week.', category: 'Waste', location: 'Chowk Shaheedan near the park', area: 'Muzaffarabad, Azad Jammu and Kashmir', priority: 'Low', score: 35, status: 'Resolved', reportedAt: now - 1000 * 60 * 60 * 74, department: 'Sanitation', reporter: 'A resident', image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=240&q=75', lat: 34.37, lng: 73.471, duplicateOf: null, resolution: 'Bin emptied and the area cleared by the sanitation team.', resolutionImage: null, resolvedAt: now - 1000 * 60 * 60 * 30, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 74, note: 'Report received' }, { status: 'Resolved', time: now - 1000 * 60 * 60 * 30, note: 'Bin emptied and area cleared' }]) },
    { id: 'CP-2454', title: 'Road surface cracked near the pedestrian crossing', description: 'The road surface is cracked near the crossing and the edge is beginning to break away.', category: 'Road damage', location: 'G-10 Markaz near the pedestrian crossing', area: 'Islamabad, Islamabad Capital Territory', priority: 'Medium', score: 54, status: 'Submitted', reportedAt: now - 1000 * 60 * 60 * 93, department: 'Roads & Transport', reporter: 'A resident', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=240&q=75', lat: 33.684, lng: 73.047, duplicateOf: null, resolution: null, resolutionImage: null, resolvedAt: null, history: JSON.stringify([{ status: 'Submitted', time: now - 1000 * 60 * 60 * 93, note: 'Report received' }]) }
  ];
}

function normalizeReport(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    area: row.area,
    priority: row.priority,
    score: row.score,
    status: row.status,
    reportedAt: Number(row.reported_at),
    department: row.department,
    reporter: row.reporter || 'Resident',
    image: row.image || null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    duplicateOf: row.duplicate_of || null,
    resolution: row.resolution || null,
    resolutionImage: row.resolution_image || null,
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
    history: Array.isArray(JSON.parse(row.history || '[]')) ? JSON.parse(row.history || '[]') : []
  };
}

function serializeReport(report) {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    category: report.category,
    location: report.location,
    area: report.area,
    priority: report.priority,
    score: Number(report.score || 0),
    status: report.status || 'Submitted',
    reported_at: Number(report.reportedAt || Date.now()),
    department: report.department || 'Public Works',
    reporter: report.reporter || 'Resident',
    image: report.image || null,
    lat: report.lat ?? null,
    lng: report.lng ?? null,
    duplicate_of: report.duplicateOf || null,
    resolution: report.resolution || null,
    resolution_image: report.resolutionImage || null,
    resolved_at: report.resolvedAt ? Number(report.resolvedAt) : null,
    history: JSON.stringify(report.history || [])
  };
}

function requireAdmin(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Admin session required.' });
  }

  const session = db.prepare('SELECT email FROM admin_sessions WHERE token = ?').get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  req.admin = { email: session.email };
  next();
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '.')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'civicpulse-api', time: new Date().toISOString() });
});

app.get('/api/reports', (req, res) => {
  const rows = db.prepare('SELECT * FROM reports ORDER BY reported_at DESC').all();
  res.json(rows.map(normalizeReport));
});

app.post('/api/reports', (req, res) => {
  const report = req.body || {};
  if (!report.title?.trim() || !report.description?.trim() || !report.category?.trim() || !report.location?.trim() || !report.area?.trim()) {
    return res.status(400).json({ error: 'Title, description, category, location, and area are required.' });
  }
  const row = serializeReport({
    ...report,
    id: report.id || `CP-${Date.now()}`,
    reportedAt: report.reportedAt || Date.now(),
    status: 'Submitted',
    history: report.history || [{ status: 'Submitted', time: Date.now(), note: 'Report received' }]
  });

  const exists = db.prepare('SELECT 1 FROM reports WHERE id = ?').get(row.id);
  if (exists) {
    return res.status(409).json({ error: 'A report with this reference already exists.' });
  }

  db.prepare(`INSERT INTO reports (id, title, description, category, location, area, priority, score, status, reported_at, department, reporter, image, lat, lng, duplicate_of, resolution, resolution_image, resolved_at, history) VALUES (@id, @title, @description, @category, @location, @area, @priority, @score, @status, @reported_at, @department, @reporter, @image, @lat, @lng, @duplicate_of, @resolution, @resolution_image, @resolved_at, @history)`).run(row);
  res.status(201).json(normalizeReport(row));
});

app.put('/api/reports/:id', requireAdmin, (req, res) => {
  const report = req.body || {};
  const row = serializeReport({ ...report, id: req.params.id, reportedAt: report.reportedAt || Date.now() });
  const existing = db.prepare('SELECT 1 FROM reports WHERE id = ?').get(req.params.id);

  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  db.prepare(`UPDATE reports SET title = @title, description = @description, category = @category, location = @location, area = @area, priority = @priority, score = @score, status = @status, reported_at = @reported_at, department = @department, reporter = @reporter, image = @image, lat = @lat, lng = @lng, duplicate_of = @duplicate_of, resolution = @resolution, resolution_image = @resolution_image, resolved_at = @resolved_at, history = @history WHERE id = @id`).run(row);
  res.json(normalizeReport(row));
});

app.get('/api/rules', (req, res) => {
  const row = db.prepare('SELECT rules FROM priority_rules WHERE id = 1').get();
  res.json(row ? JSON.parse(row.rules) : DEFAULT_RULES);
});

app.put('/api/rules', requireAdmin, (req, res) => {
  const rules = req.body || DEFAULT_RULES;
  db.prepare('UPDATE priority_rules SET rules = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(rules), Date.now());
  res.json(rules);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT email, password_hash FROM admin_users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || user.password_hash !== sha256(password)) {
    return res.status(401).json({ error: 'Invalid administrator credentials.' });
  }

  const token = crypto.randomUUID();
  db.prepare('INSERT INTO admin_sessions (token, email, created_at) VALUES (?, ?, ?)')
    .run(token, user.email, Date.now());

  res.json({
    user: { email: user.email, displayName: DEFAULT_ADMIN_NAME, role: 'admin', token }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Admin session required.' });
  }

  const session = db.prepare('SELECT email FROM admin_sessions WHERE token = ?').get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid admin session.' });
  }

  res.json({ email: session.email, displayName: DEFAULT_ADMIN_NAME, role: 'admin' });
});

app.get(/^(?!\/api).*$/i, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initializeDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

app.listen(port, () => {
  console.log(`CivicPulse API running on http://localhost:${port}`);
  console.log(`Default admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
});
