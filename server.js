#!/usr/bin/env node
/**
 * BuildOS Intranet — Servidor Completo
 * Auth + SQLite + IA Proxy + WhatsApp
 * Un solo archivo, dependencias minimas
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// ============ CONFIGURACION ============
const CONFIG = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  JWT_EXPIRES: process.env.JWT_EXPIRES_IN || '7d',
  KIMI_API_KEY: process.env.KIMI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@buildos.local',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Administrador',
  DATABASE_PATH: process.env.DATABASE_PATH || './data/buildos.db',
  DATA_DIR: path.join(__dirname, 'data'),
};

// Asegurar directorio de datos
if (!fs.existsSync(CONFIG.DATA_DIR)) fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });

// ============ HELPERS HTTP ============
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (req.headers['content-type']?.includes('application/json')) {
          resolve(JSON.parse(body));
        } else {
          resolve(body);
        }
      } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    send(res, 404, { error: 'File not found' });
  }
}

// Parsear query string
function parseQuery(url) {
  const q = {};
  const idx = url.indexOf('?');
  if (idx === -1) return q;
  const params = new URLSearchParams(url.slice(idx + 1));
  for (const [k, v] of params) q[k] = v;
  return q;
}

// Parsear form-urlencoded (Twilio)
function parseForm(body) {
  const result = {};
  const params = new URLSearchParams(body);
  for (const [k, v] of params) result[k] = v;
  return result;
}

// ============ JWT (sin libreria) ============
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}
function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
}
function signJWT(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 dias
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const signature = crypto.createHmac('sha256', CONFIG.JWT_SECRET)
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
function verifyJWT(token) {
  try {
    const [h, b, s] = token.split('.');
    const sig = crypto.createHmac('sha256', CONFIG.JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (sig !== s) return null;
    const payload = JSON.parse(base64UrlDecode(b));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ============ PASSWORD HASH (sin bcrypt, nativo) ============
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === check;
}

// ============ DATABASE (SQLite nativo via better-sqlite3 o json fallback) ============
let db = null;
let useJsonFallback = false;
let jsonDb = { users: [], projects: [], budgetItems: [], messages: [], activityLog: [] };

try {
  const Database = require('better-sqlite3');
  db = new Database(CONFIG.DATABASE_PATH);
  console.log('[DB] SQLite conectado:', CONFIG.DATABASE_PATH);

  // Crear tablas
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'visualizador',
      avatar TEXT,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      client_name TEXT,
      client_phone TEXT,
      status TEXT DEFAULT 'draft',
      budget_total REAL DEFAULT 0,
      budget_data TEXT,
      created_by INTEGER,
      assigned_to INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_id TEXT,
      name TEXT NOT NULL,
      unit TEXT,
      quantity REAL DEFAULT 0,
      material_price REAL DEFAULT 0,
      labor_price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      trade TEXT,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      name TEXT,
      body TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      status TEXT DEFAULT 'received',
      project_id INTEGER,
      media_url TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Crear admin si no existe
  const adminExists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(CONFIG.ADMIN_EMAIL);
  if (!adminExists) {
    db.prepare(`INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`)
      .run(CONFIG.ADMIN_EMAIL, hashPassword(CONFIG.ADMIN_PASSWORD), CONFIG.ADMIN_NAME, 'admin');
    console.log('[DB] Admin creado:', CONFIG.ADMIN_EMAIL);
  }
} catch (err) {
  console.warn('[DB] better-sqlite3 no disponible, usando JSON fallback:', err.message);
  useJsonFallback = true;
  // Cargar desde archivo si existe
  const jsonPath = path.join(CONFIG.DATA_DIR, 'db.json');
  if (fs.existsSync(jsonPath)) {
    jsonDb = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  // Crear admin
  if (!jsonDb.users.find(u => u.email === CONFIG.ADMIN_EMAIL)) {
    jsonDb.users.push({
      id: 1, email: CONFIG.ADMIN_EMAIL, password_hash: hashPassword(CONFIG.ADMIN_PASSWORD),
      name: CONFIG.ADMIN_NAME, role: 'admin', active: true, created_at: Date.now()
    });
    saveJsonDb();
  }
}

function saveJsonDb() {
  fs.writeFileSync(path.join(CONFIG.DATA_DIR, 'db.json'), JSON.stringify(jsonDb, null, 2));
}

// ============ AUTH MIDDLEWARE ============
function authMiddleware(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  return verifyJWT(token);
}

function requireAuth(req, res, minRole = null) {
  const user = authMiddleware(req);
  if (!user) { send(res, 401, { error: 'No autenticado' }); return null; }
  if (minRole) {
    const roles = { admin: 4, jefe_obra: 3, comercial: 2, instalador: 1, visualizador: 0 };
    if ((roles[user.role] || 0) < (roles[minRole] || 0)) {
      send(res, 403, { error: 'Sin permisos suficientes' }); return null;
    }
  }
  return user;
}

// ============ API: AUTH ============
async function handleAuthRegister(req, res) {
  const { email, password, name, role = 'visualizador' } = await parseBody(req);
  if (!email || !password || !name) return send(res, 400, { error: 'Faltan campos' });

  try {
    if (useJsonFallback) {
      if (jsonDb.users.find(u => u.email === email)) return send(res, 409, { error: 'Email ya registrado' });
      const user = {
        id: jsonDb.users.length + 1, email, password_hash: hashPassword(password),
        name, role, active: true, created_at: Date.now()
      };
      jsonDb.users.push(user);
      saveJsonDb();
      const token = signJWT({ id: user.id, email, name, role });
      send(res, 201, { token, user: { id: user.id, email, name, role } });
    } else {
      try {
        db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
          .run(email, hashPassword(password), name, role);
      } catch (e) {
        if (e.message.includes('UNIQUE')) return send(res, 409, { error: 'Email ya registrado' });
        throw e;
      }
      const user = db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email);
      const token = signJWT({ id: user.id, email, name, role });
      send(res, 201, { token, user });
    }
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleAuthLogin(req, res) {
  const { email, password } = await parseBody(req);
  if (!email || !password) return send(res, 400, { error: 'Faltan campos' });

  try {
    let user;
    if (useJsonFallback) {
      user = jsonDb.users.find(u => u.email === email && u.active);
      if (!user || !verifyPassword(password, user.password_hash)) return send(res, 401, { error: 'Credenciales incorrectas' });
    } else {
      user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
      if (!user || !verifyPassword(password, user.password_hash)) return send(res, 401, { error: 'Credenciales incorrectas' });
    }
    const token = signJWT({ id: user.id, email: user.email, name: user.name, role: user.role });
    send(res, 200, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) { send(res, 500, { error: err.message }); }
}

function handleAuthMe(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  send(res, 200, { user });
}

function handleAuthUsers(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;
  try {
    if (useJsonFallback) {
      send(res, 200, { users: jsonDb.users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, created_at: u.created_at })) });
    } else {
      const users = db.prepare('SELECT id, email, name, role, active, created_at FROM users').all();
      send(res, 200, { users });
    }
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleAuthUpdateRole(req, res, userId) {
  const admin = requireAuth(req, res, 'admin');
  if (!admin) return;
  const { role } = await parseBody(req);
  if (!role) return send(res, 400, { error: 'Falta rol' });

  try {
    if (useJsonFallback) {
      const u = jsonDb.users.find(u => u.id == userId);
      if (!u) return send(res, 404, { error: 'Usuario no encontrado' });
      u.role = role;
      saveJsonDb();
    } else {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }
    send(res, 200, { success: true });
  } catch (err) { send(res, 500, { error: err.message }); }
}

// ============ API: PROJECTS ============
async function handleProjectsList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    let projects;
    if (useJsonFallback) {
      projects = jsonDb.projects.filter(p => user.role === 'admin' || p.created_by === user.id || p.assigned_to === user.id);
    } else {
      if (user.role === 'admin') {
        projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
      } else {
        projects = db.prepare('SELECT * FROM projects WHERE created_by = ? OR assigned_to = ? ORDER BY created_at DESC')
          .all(user.id, user.id);
      }
      projects.forEach(p => { try { p.budget_data = JSON.parse(p.budget_data || '[]'); } catch { p.budget_data = []; } });
    }
    send(res, 200, { projects });
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleProjectsCreate(req, res) {
  const user = requireAuth(req, res, 'comercial');
  if (!user) return;
  const { name, address, client_name, client_phone, budget_data } = await parseBody(req);
  if (!name) return send(res, 400, { error: 'Falta nombre del proyecto' });

  try {
    if (useJsonFallback) {
      const project = { id: jsonDb.projects.length + 1, name, address, client_name, client_phone, status: 'draft', budget_total: 0, budget_data: budget_data || [], created_by: user.id, created_at: Date.now() };
      jsonDb.projects.push(project);
      saveJsonDb();
      send(res, 201, { project });
    } else {
      const result = db.prepare(`INSERT INTO projects (name, address, client_name, client_phone, budget_data, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(name, address, client_name, client_phone, JSON.stringify(budget_data || []), user.id);
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
      try { project.budget_data = JSON.parse(project.budget_data || '[]'); } catch { project.budget_data = []; }
      send(res, 201, { project });
    }
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleProjectsGet(req, res, projectId) {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    let project;
    if (useJsonFallback) {
      project = jsonDb.projects.find(p => p.id == projectId);
    } else {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (project) try { project.budget_data = JSON.parse(project.budget_data || '[]'); } catch { project.budget_data = []; }
    }
    if (!project) return send(res, 404, { error: 'Proyecto no encontrado' });
    if (user.role !== 'admin' && project.created_by !== user.id && project.assigned_to !== user.id) {
      return send(res, 403, { error: 'Sin acceso a este proyecto' });
    }
    send(res, 200, { project });
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleProjectsUpdate(req, res, projectId) {
  const user = requireAuth(req, res, 'comercial');
  if (!user) return;
  const updates = await parseBody(req);
  try {
    if (useJsonFallback) {
      const p = jsonDb.projects.find(p => p.id == projectId);
      if (!p) return send(res, 404, { error: 'Proyecto no encontrado' });
      Object.assign(p, updates);
      saveJsonDb();
      send(res, 200, { project: p });
    } else {
      const fields = [];
      const values = [];
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'budget_data') { fields.push('budget_data = ?'); values.push(JSON.stringify(v)); }
        else { fields.push(`${k} = ?`); values.push(v); }
      }
      values.push(projectId);
      db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      send(res, 200, { project });
    }
  } catch (err) { send(res, 500, { error: err.message }); }
}

// ============ CONFIGURACION IA (SOLO ADMIN) ============
function getAIKeyFromDb() {
  if (useJsonFallback) {
    const cfg = jsonDb.config?.find(c => c.key === 'ai_key');
    return cfg?.value || '';
  }
  try {
    const row = db.prepare("SELECT value FROM app_config WHERE key = 'ai_key'").get();
    return row?.value || '';
  } catch { return ''; }
}
function setAIKeyInDb(key) {
  if (useJsonFallback) {
    if (!jsonDb.config) jsonDb.config = [];
    const idx = jsonDb.config.findIndex(c => c.key === 'ai_key');
    if (idx >= 0) jsonDb.config[idx] = { key: 'ai_key', value: key, updated_at: Date.now() };
    else jsonDb.config.push({ key: 'ai_key', value: key, updated_at: Date.now() });
    saveJsonDb();
    return;
  }
  db.prepare("INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('ai_key', ?, unixepoch())").run(key);
}

// Verificar contrasena de admin (simple, para proteger la config de IA)
function checkAdminPassword(body) {
  const pwd = body?.adminPassword || '';
  return pwd === CONFIG.ADMIN_PASSWORD;
}

async function handleGetAIConfig(req, res) {
  // Ver estado de IA - no requiere auth
  const dbKey = getAIKeyFromDb();
  const envKey = CONFIG.KIMI_API_KEY || '';
  const activeKey = dbKey || envKey;
  send(res, 200, {
    configured: activeKey.length > 20,
    source: dbKey ? 'database' : (envKey ? 'environment' : 'none'),
    keyHint: activeKey ? '...' + activeKey.slice(-4) : '',
    model: 'moonshot-v1-32k'
  });
}
async function handleSetAIConfig(req, res) {
  const body = await parseBody(req);
  
  // Verificar contrasena de admin
  if (!checkAdminPassword(body)) {
    return send(res, 401, { error: 'Contrasena incorrecta.' });
  }
  
  const { apiKey } = body;
  if (!apiKey || apiKey.length < 20) {
    return send(res, 400, { error: 'API Key invalida.' });
  }
  setAIKeyInDb(apiKey);
  send(res, 200, { success: true, message: 'API Key guardada' });
}
async function handleDeleteAIConfig(req, res) {
  const body = await parseBody(req).catch(() => ({}));
  if (!checkAdminPassword(body)) {
    return send(res, 401, { error: 'Contrasena incorrecta.' });
  }
  setAIKeyInDb('');
  send(res, 200, { success: true, message: 'API Key eliminada' });
}
function logActivity(userId, projectId, action, details) {
  try {
    if (useJsonFallback) {
      jsonDb.activityLog = jsonDb.activityLog || [];
      jsonDb.activityLog.push({ id: jsonDb.activityLog.length + 1, user_id: userId, project_id: projectId, action, details: JSON.stringify(details), created_at: Date.now() });
      saveJsonDb();
    } else {
      db.prepare("INSERT INTO activity_log (user_id, project_id, action, details) VALUES (?, ?, ?, ?)").run(userId, projectId, action, JSON.stringify(details));
    }
  } catch (e) { console.error('[ActivityLog]', e); }
}

// ============ API: AI PROXY ============
async function handleAIProxy(req, res) {
  // La IA NO requiere autenticacion - funciona para todos
  const body = await parseBody(req);

  // Leer key: base de datos primero, luego variable de entorno
  const dbKey = getAIKeyFromDb();
  const envKey = CONFIG.KIMI_API_KEY || '';
  const activeKey = dbKey || envKey;

  // Usar Kimi si hay API key
  if (activeKey) {
    try {
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      send(res, response.status, data);
      return;
    } catch (err) {
      console.error('[AI] Error Kimi:', err.message);
      // Fallback a Anthropic
    }
  }

  // Fallback Anthropic
  if (CONFIG.ANTHROPIC_API_KEY) {
    try {
      const anthropicBody = {
        model: body.model || 'claude-3-sonnet-20240229',
        max_tokens: body.max_tokens || 1500,
        messages: body.messages || [],
      };
      if (body.messages?.[0]?.role === 'system') {
        anthropicBody.system = body.messages[0].content;
        anthropicBody.messages = body.messages.slice(1);
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CONFIG.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      });
      const data = await response.json();
      send(res, response.status, data);
      return;
    } catch (err) {
      console.error('[AI] Error Anthropic:', err.message);
    }
  }

  send(res, 503, { error: 'Servicio de IA no disponible. Configura KIMI_API_KEY o ANTHROPIC_API_KEY.' });
}

// ============ API: WHATSAPP ============
async function handleWhatsAppWebhook(req, res) {
  const body = await parseBody(req);
  const form = typeof body === 'string' ? parseForm(body) : body;
  const { From, Body, ProfileName, NumMedia, MediaUrl0 } = form;

  console.log('[WA] Mensaje recibido:', { From, Body, ProfileName });

  if (!From || !Body) return send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><Response/>', 'text/xml');

  try {
    if (useJsonFallback) {
      jsonDb.messages.push({
        id: jsonDb.messages.length + 1, phone: From, name: ProfileName || '',
        body: Body, direction: 'inbound', status: 'received',
        media_url: MediaUrl0 || null, created_at: Date.now()
      });
      saveJsonDb();
    } else {
      db.prepare(`INSERT INTO whatsapp_messages (phone, name, body, direction, media_url) VALUES (?, ?, ?, ?, ?)`)
        .run(From, ProfileName || '', Body, 'inbound', MediaUrl0 || null);
    }
  } catch (err) { console.error('[WA] Error guardando:', err); }

  send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><Response/>', 'text/xml');
}

function handleMessagesList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const q = parseQuery(req.url);
  try {
    let messages;
    if (useJsonFallback) {
      messages = jsonDb.messages;
      if (q.phone) messages = messages.filter(m => m.phone === q.phone);
      messages = messages.slice(-(parseInt(q.limit) || 50));
    } else {
      if (q.phone) {
        messages = db.prepare('SELECT * FROM whatsapp_messages WHERE phone = ? ORDER BY created_at DESC LIMIT ?')
          .all(q.phone, parseInt(q.limit) || 50);
      } else {
        messages = db.prepare('SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT ?')
          .all(parseInt(q.limit) || 50);
      }
    }
    const unread = messages.filter(m => m.direction === 'inbound' && m.status === 'received').length;
    send(res, 200, { messages, unread });
  } catch (err) { send(res, 500, { error: err.message }); }
}

function handleContactsList(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    let phones;
    if (useJsonFallback) {
      const grouped = {};
      jsonDb.messages.forEach(m => {
        if (!grouped[m.phone]) grouped[m.phone] = { phone: m.phone, name: m.name, messages: [], lastAt: 0 };
        grouped[m.phone].messages.push(m);
        if (m.created_at > grouped[m.phone].lastAt) grouped[m.phone].lastAt = m.created_at;
      });
      phones = Object.values(grouped).map(g => ({
        phone: g.phone, name: g.name,
        lastMessage: g.messages[g.messages.length - 1]?.body || '',
        unreadCount: g.messages.filter(m => m.direction === 'inbound' && m.status === 'received').length,
        lastAt: g.lastAt
      }));
    } else {
      phones = db.prepare(`
        SELECT phone, name, MAX(body) as lastMessage, 
               COUNT(CASE WHEN direction = 'inbound' AND status = 'received' THEN 1 END) as unreadCount,
               MAX(created_at) as lastAt
        FROM whatsapp_messages GROUP BY phone ORDER BY lastAt DESC
      `).all();
    }
    send(res, 200, { phones });
  } catch (err) { send(res, 500, { error: err.message }); }
}

async function handleSendMessage(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const { phone, body } = await parseBody(req);
  if (!phone || !body) return send(res, 400, { error: 'Faltan campos' });

  // Guardar en BD
  try {
    if (useJsonFallback) {
      jsonDb.messages.push({
        id: jsonDb.messages.length + 1, phone, name: '',
        body, direction: 'outbound', status: 'sent', created_at: Date.now()
      });
      saveJsonDb();
    } else {
      db.prepare(`INSERT INTO whatsapp_messages (phone, body, direction, status) VALUES (?, ?, ?, ?)`)
        .run(phone, body, 'outbound', 'sent');
    }
  } catch (err) { console.error('[WA] Error guardando envio:', err); }

  // Enviar via Twilio si esta configurado
  if (CONFIG.TWILIO_ACCOUNT_SID && CONFIG.TWILIO_AUTH_TOKEN && CONFIG.TWILIO_WHATSAPP_NUMBER) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.TWILIO_ACCOUNT_SID}/Messages.json`;
      const auth = Buffer.from(`${CONFIG.TWILIO_ACCOUNT_SID}:${CONFIG.TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams({
        To: phone,
        From: CONFIG.TWILIO_WHATSAPP_NUMBER,
        Body: body,
      });
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!response.ok) {
        const err = await response.json();
        console.error('[WA] Error Twilio:', err);
      }
    } catch (err) { console.error('[WA] Error enviando:', err); }
  }

  send(res, 200, { success: true });
}

// ============ FRONTEND SERVING ============
function findPublicDir() {
  // Buscar index.html en varias ubicaciones posibles
  // 1. Carpeta public/ (estructura normal)
  // 2. Raiz del proyecto (para subidas simples a GitHub)
  const candidates = [
    path.join(__dirname, 'public'),
    path.join(process.cwd(), 'public'),
    path.join(__dirname, '..', 'public'),
    '/app/public',
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
      console.log('[Static] Serving from:', dir);
      return dir;
    }
  }
  // Si no hay carpeta public/, buscar index.html en la raiz
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    console.log('[Static] Serving from root:', __dirname);
    return __dirname;
  }
  if (fs.existsSync(path.join(process.cwd(), 'index.html'))) {
    console.log('[Static] Serving from cwd:', process.cwd());
    return process.cwd();
  }
  console.warn('[Static] No index.html found');
  return null;
}

function serveFrontend(res, pathname) {
  const publicDir = findPublicDir();

  if (!publicDir) {
    // Fallback: devolver HTML inline basico
    const fallbackHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>BuildOS</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f1ec}
.box{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);max-width:500px}
h1{color:#c92a2a;margin-bottom:10px}p{color:#666;line-height:1.5}</style></head>
<body><div class="box"><h1>⚠️ Frontend no encontrado</h1>
<p>El servidor funciona correctamente, pero no encuentra los archivos del frontend.</p>
<p><strong>Para arreglarlo:</strong> Asegurate de que la carpeta <code>public/</code> con <code>index.html</code> existe junto a <code>server.js</code>.</p>
<p>Si usas Railway, comprueba que <code>public/index.html</code> esta en tu repositorio de GitHub.</p>
</div></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    return res.end(fallbackHtml);
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(publicDir, 'index.html');
    return sendFile(res, filePath, 'text/html');
  }

  filePath = path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) return send(res, 403, { error: 'Forbidden' });

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  };

  if (fs.existsSync(filePath)) {
    sendFile(res, filePath, mimeTypes[ext] || 'application/octet-stream');
  } else {
    sendFile(res, path.join(publicDir, 'index.html'), 'text/html');
  }
}

// ============ ROUTER ============
const routes = [
  { method: 'POST', path: '/api/auth/register', handler: handleAuthRegister },
  { method: 'POST', path: '/api/auth/login', handler: handleAuthLogin },
  { method: 'GET', path: '/api/auth/me', handler: handleAuthMe },
  { method: 'GET', path: '/api/auth/users', handler: handleAuthUsers },
  { method: 'PUT', pattern: /^\/api\/auth\/users\/(\d+)\/role$/, handler: handleAuthUpdateRole },
  { method: 'GET', path: '/api/projects', handler: handleProjectsList },
  { method: 'POST', path: '/api/projects', handler: handleProjectsCreate },
  { method: 'GET', pattern: /^\/api\/projects\/(\d+)$/, handler: handleProjectsGet },
  { method: 'PUT', pattern: /^\/api\/projects\/(\d+)$/, handler: handleProjectsUpdate },
  { method: 'POST', path: '/api/ai', handler: handleAIProxy },
  { method: 'GET', path: '/api/admin/ai-config', handler: handleGetAIConfig },
  { method: 'POST', path: '/api/admin/ai-config', handler: handleSetAIConfig },
  { method: 'DELETE', path: '/api/admin/ai-config', handler: handleDeleteAIConfig },
  { method: 'POST', path: '/api/whatsapp/webhook', handler: handleWhatsAppWebhook },
  { method: 'GET', path: '/api/messages', handler: handleMessagesList },
  { method: 'GET', path: '/api/messages/phones', handler: handleContactsList },
  { method: 'POST', path: '/api/messages/send', handler: handleSendMessage },
];

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // Health check
  if (method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { status: 'ok', version: '4.0.0', db: useJsonFallback ? 'json' : 'sqlite' });
  }

  // Match routes
  for (const route of routes) {
    if (route.method !== method) continue;

    if (route.path && route.path === pathname) {
      return route.handler(req, res);
    }
    if (route.pattern) {
      const match = pathname.match(route.pattern);
      if (match) {
        const id = match[1];
        return route.handler(req, res, id);
      }
    }
  }

  // Serve frontend (SPA)
  if (method === 'GET') {
    return serveFrontend(res, pathname);
  }

  send(res, 404, { error: 'Not found' });
}

// ============ SERVER ============
const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error('[Server] Error:', err);
    send(res, 500, { error: 'Internal server error' });
  });
});

server.listen(CONFIG.PORT, () => {
  console.log('='.repeat(50));
  console.log('  BUILDOS INTRANET v4.0');
  console.log('  URL: http://localhost:' + CONFIG.PORT);
  console.log('  Admin: ' + CONFIG.ADMIN_EMAIL);
  console.log('  DB: ' + (useJsonFallback ? 'JSON (fallback)' : 'SQLite'));
  console.log('  AI: ' + (CONFIG.KIMI_API_KEY ? 'Kimi ✓' : CONFIG.ANTHROPIC_API_KEY ? 'Anthropic ✓' : 'No configurado ✗'));
  console.log('  WhatsApp: ' + (CONFIG.TWILIO_ACCOUNT_SID ? 'Twilio ✓' : 'No configurado ✗'));
  console.log('='.repeat(50));
});
