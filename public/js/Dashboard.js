// ==========================================
// RICHFIELD CONNECT - COMPLETE DASHBOARD SCRIPT
// ==========================================

const API_BASE = 'http://127.0.0.1:5001';

// --- GLOBAL STATE & VARIABLES ---
let currentUserld = null;
let currentUserId = null;
let currentUserCourse = '';
let messagesPollInterval = null;
let activeChatUserId = null;
let activeChatUserName = '';
let lastChatSignature = '';

let currentRoomId = null;
let currentRoomBuddyId = null;
let currentRoomBuddyName = '';
let roomStartTime = null;
let roomSessionInterval = null;
let notesAutoSaveInterval = null;

let currentMode = 'study';
let shyMode = false;
let availOn = true;
let allTasks = [];
let taskFilter = 'all';
let selectedContactId = null;
let selectedContactName = '';
let sessionFilter = 'mine';
let allBuddies = [];
let buddyFilter = 'all';
let myHobbies = [];

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calTasks = [];
let calSessions = [];
let clockInterval = null;

let srBuddyId = null;
let srBuddyName = '';
let srConnectionId = null;
let srRoomId = null;
let srStartTime = null;
let srSessionTimer = null;
let srNotesTimer = null;
let srLocalStream = null;
let sr_pomoInterval = null;
let sr_pomoRunning = false;
let sr_pomoSeconds = 25 * 60;
let sr_pomoTotal = 25 * 60;
let sr_pomoIsBreak = false;
let sr_pomoCycles = 0;

// --- XSS-SAFE ESCAPING HELPER ---
function escapeHTML(str) {
  return String(str || '').replace(/[&<>'"]/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[match]);
}

// --- INTEREST TAGS ("PASSION PILLS") ---
function parseHobbies(raw) {
  if (raw === null || raw === undefined) return [];
  let items = raw;
  if (typeof items === 'string') {
    const t = items.trim();
    if (t.startsWith('[')) {
      try { items = JSON.parse(t); } catch (e) { items = t.split(/[,;\n ]/); }
    } else {
      items = t.split(/[,;\n|]/);
    }
  }
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  items.forEach(h => {
    const tag = String(h ?? '').replace(/\s+/g, '').trim().slice(0, 24);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); out.push(tag); }
  });
  return out.slice(0, 12);
}

function sameHobbies(a, b) {
  const norm = list => (list || []).map(h => h.toLowerCase()).sort().join('|');
  return norm(a) === norm(b);
}

function readLocalHobbies(studentNum, session) {
  try {
    const stored = localStorage.getItem('rc_hobbies_' + studentNum);
    if (stored !== null) return parseHobbies(stored);
  } catch (e) { /* storage blocked */ }
  if (session && Array.isArray(session.hobbies)) return parseHobbies(session.hobbies);
  return null;
}

function getBuddyHobbies(b) {
  let list = parseHobbies(b.hobbies);
  if (!list.length) {
    const local = readLocalHobbies(b.studentNum, null);
    if (local && local.length) list = local;
  }
  return list;
}

function hobbyColorIndex(tag) {
  let n = 0;
  for (const ch of String(tag).toLowerCase()) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n % 6;
}

function injectHobbyStyles() {
  if (document.getElementById('hobbyPillStyles')) return;
  const el = document.createElement('style');
  el.id = 'hobbyPillStyles';
  el.textContent = `
    .hobby-row{display: flex; flex-wrap:wrap; gap:5px; margin-top:8px;}
    .hobby-pill{font-size:0.68rem; font-weight:600; padding:2px 9px; border-radius:20px; white-space:nowrap; line-height:1.5;}
    .hobby-pill.c0{background:#e8eefb; color:#3461d1;}
    .hobby-pill.c1{background:#f3e8ff; color:#7e22ce;}
    .hobby-pill.c2{background:#dcfce7; color:#15803d;}
    .hobby-pill.c3{background:#cffafe; color:#0e7490;}
    .hobby-pill.c4{background:#ffedd5; color:#c2410c;}
    .hobby-pill.c5{background:#fce7f3; color:#be185d;}
    .hobby-pill.shared{box-shadow:inset 0 0 0 1.5px currentColor;}
    .hobby-pill.more{background:var(--bg); color:var(--muted); border:1px solid var(--border);}
    .hobby-shared-note{margin-top:5px; font-size:0.72rem; font-weight:700; color:var(--green);}
    .hobby-empty{font-size:0.7rem; color:var(--muted); font-style:italic;}
  `;
  document.head.appendChild(el);
}

function hobbyPillsHtml(list, mine, max = 4) {
  if (!list || !list.length) {
    return '<div class="hobby-row"><span class="hobby-empty">No interests added yet</span></div>';
  }
  const mineSet = new Set((mine || []).map(h => h.toLowerCase()));
  const isShared = h => mineSet.has(h.toLowerCase());
  const ordered = [...list].sort((a, b) => Number(isShared(b)) - Number(isShared(a)));
  const shown = ordered.slice(0, max);
  const hidden = ordered.slice(max);
  const pills = shown.map(h =>
    `<span class="hobby-pill c${hobbyColorIndex(h)}${isShared(h) ? ' shared' : ''}"${isShared(h) ? ' title="You both like this"' : ''}>${isShared(h) ? '✓ ' : ''}${escapeHTML(h)}</span>`
  ).join('');
  const more = hidden.length ? `<span class="hobby-pill more" title="${escapeHTML(hidden.join(', '))}">+${hidden.length}</span>` : '';
  const common = ordered.filter(isShared);
  const note = common.length ? `<div class="hobby-shared-note">You both like ${escapeHTML(common.slice(0, 3).join(', '))}</div>` : '';
  return `<div class="hobby-row">${pills}${more}</div>${note}`;
}

async function loadMyHobbies() {
  let session = {};
  try { session = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || '{}'); } catch (e) {}
  if (!session.studentNum) return;
  const local = readLocalHobbies(session.studentNum, session);
  let profile = null;
  try {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(session.studentNum)}`);
    if (res.ok) profile = await res.json();
  } catch (e) { /* server offline */ }
  const server = profile ? parseHobbies(profile.hobbies) : [];
  myHobbies = (local && local.length) ? local : server;
  if (profile && local && local.length && !sameHobbies(local, server)) {
    try {
      await fetch(`${API_BASE}/api/users/${profile.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hobbies: local.join(', '), expertise: profile.expertise, course: profile.course })
      });
    } catch (e) { /* silent */ }
  }
  if (allBuddies && allBuddies.length) renderBuddies();
}

// --- MODE SELECTOR ---
function selectMode(mode) {
  currentMode = mode;
  const studyCard = document.getElementById('studyCard');
  const socialCard = document.getElementById('socialCard');
  if (studyCard) studyCard.classList.toggle('active', mode === 'study');
  if (socialCard) socialCard.classList.toggle('active', mode === 'social');

  const studyPanel = document.getElementById('studyPanel');
  const socialPanel = document.getElementById('socialPanel');
  if (studyPanel) studyPanel.style.display = mode === 'study' ? 'block' : 'none';
  if (socialPanel) socialPanel.style.display = mode === 'social' ? 'block' : 'none';

  if (mode === 'social') loadSocialBuddies();
  else renderBuddies();
}

function toggleShy() {
  shyMode = !shyMode;
  const btn = document.getElementById('shyBtn');
  const banner = document.getElementById('shyBanner');
  if (btn) btn.classList.toggle('active', shyMode);
  if (banner) banner.classList.toggle('show', shyMode);
}

function toggleAvail() {
  availOn = !availOn;
  document.querySelectorAll('.toggle-switch').forEach(t => t.classList.toggle('off', !availOn));
}

// --- VIEW ROUTER ---
function showView(view) {
  ['homeView', 'tasksView', 'buddyView', 'messagesView', 'sessionsView', 'studyRoomView', 'mapView']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  
  const viewIdMap = { home: 'homeView', tasks: 'tasksView', buddy: 'buddyView', messages: 'messagesView', sessions: 'sessionsView', studyRoom: 'studyRoomView', map: 'mapView' };
  const target = document.getElementById(viewIdMap[view] || 'homeView');
  if (target) target.style.display = 'block';

  const navIdMap = { home: 'navDashboard', tasks: 'navTasks', buddy: 'navBuddies', messages: 'navMessages', sessions: 'navSessions', map: 'navMap' };
  Object.keys(navIdMap).forEach(v => { const el = document.getElementById(navIdMap[v]); if (el) el.classList.toggle('active', view === v); });

  sessionStorage.setItem('activeView', view);
  try {
    if (view === 'home' && typeof loadHome === 'function') loadHome();
    if (view === 'tasks' && typeof loadTasks === 'function') loadTasks();
    if (view === 'messages' && typeof loadContacts === 'function') loadContacts();
    if (view === 'sessions' && typeof loadSessions === 'function') loadSessions();
    if (view === 'buddy' && currentUserld && typeof loadBuddies === 'function') loadBuddies();

    if (view === 'messages') { if (typeof startMessagePolling === 'function') startMessagePolling(); }
    else { if (typeof stopMessagePolling === 'function') stopMessagePolling(); }

    if (view === 'studyRoom') { if (typeof startPartnerVideoPolling === 'function') startPartnerVideoPolling(); }
    else { if (typeof stopPartnerVideoPolling === 'function') stopPartnerVideoPolling(); }
  } catch (err) { console.error('showView error [' + view + ']:', err); }
}

// --- LANGUAGE & LOCALIZATION ---
function applyPageLanguage() {
  const prefs = JSON.parse(localStorage.getItem('rc_prefs') || '{}');
  const lang = prefs.language || 'en';
  const t = {
    en: { findBuddy: 'Find a Buddy', tasks: 'Task & assignment tracker', messages: 'Messages', sessions: 'Study Sessions' },
    zu: { findBuddy: 'Thola Umngane', tasks: 'Ulandelelo Lwemisebenzi', messages: 'Imiyalezo', sessions: 'Izikhathi Zokufunda' }
  };
  const l = t[lang] || t.en;
  document.querySelectorAll('.page-header h1').forEach(h => {
    const txt = h.textContent;
    if (txt.includes('Find a Buddy')) h.textContent = l.findBuddy;
  });
}

// --- CLOCK & GREETING ---
function startClock() {
  if (clockInterval) return;
  const tick = () => {
    const now = new Date();
    const clock = document.getElementById('homeClock');
    const dateEl = document.getElementById('homeDate');
    if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  tick();
  clockInterval = setInterval(tick, 1000);
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

async function loadHome() {
  if (!currentUserld) return;
  const greetEl = document.getElementById('homeGreeting');
  if (greetEl) {
    try {
      const stored = localStorage.getItem('currentUser');
      const firstName = stored ? JSON.parse(stored).firstName : 'Student';
      greetEl.textContent = `${getGreeting()}, ${escapeHTML(firstName)}!`;
    } catch (e) { greetEl.textContent = `${getGreeting()}!`; }
  }
  startClock();
  try {
    const res = await fetch(`${API_BASE}/stats/${currentUserld}`);
    const s = await res.json();
    ['homeStatMatches', 'homeStatBuddies', 'homeStatPending', 'homeStatHours'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = [s.matches, s.buddies, s.pendingRequests, s.studyHours][i];
    });
  } catch (e) { /* silent */ }

  try {
    const [tasksRes, sessRes] = await Promise.all([
      fetch(`${API_BASE}/api/tasks/${currentUserld}`),
      fetch(`${API_BASE}/study-sessions/user/${currentUserld}`)
    ]);
    calTasks = tasksRes.ok ? await tasksRes.json() : [];
    calSessions = sessRes.ok ? await sessRes.json() : [];
    allTasks = calTasks;
    updateTaskBadge();
  } catch (e) { calTasks = []; calSessions = []; }
  
  renderCalendar();
  renderUpcoming();
  loadDashboardSocialData();
}

// --- SOCIAL DATA & REQUESTS ---
async function loadDashboardSocialData() {
  if (!currentUserld) return;
  try {
    const [buddiesRes, requestsRes] = await Promise.all([
      fetch(`${API_BASE}/buddies/${currentUserId}`),
      fetch(`${API_BASE}/connections/requests/${currentUserId}`)
    ]);
    if (buddiesRes.ok) {
      const users = await buddiesRes.json();
      renderSocialMatches(users);
    }
    if (requestsRes.ok) {
      const requests = await requestsRes.json();
      renderFriendRequests(requests);
    }
  } catch (err) {
    console.error('Error loading social data:', err);
  }
}

function renderFriendRequests(requests) {
  const container = document.getElementById('friendRequestsList');
  if (!container) return;
  if (!requests || !requests.length) {
    container.innerHTML = '<div class="stat-sub" style="padding: 15px; text-align:center;">No pending requests.</div>';
    return;
  }
  container.innerHTML = requests.map(req => {
    const initials = (req.firstName || 'U').charAt(0) + (req.lastName || '').charAt(0);
    const color = avatarColors[(req.requester_id || 0) % avatarColors.length];
    return `
      <div class="request-item" id="req-${req.id}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px; height:32px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${escapeHTML(initials)}</div>
          <div>
            <div style="font-weight:600; font-size:0.85rem;">${escapeHTML(req.firstName)} ${escapeHTML(req.lastName)}</div>
            <div style="font-size:0.7rem; color:var(--muted);">${escapeHTML(req.course || 'Student')}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm" style="padding:4px 8px; font-size:0.75rem; background:#10b981; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="respondConnection(${req.id}, 'accepted')">Accept</button>
          <button class="btn btn-sm" style="padding:4px 8px; font-size:0.75rem; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="respondConnection(${req.id}, 'declined')">Decline</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSocialMatches(users) {
  const container = document.getElementById('socialMatchesList');
  if (!container) return;
  const matches = (users || []).filter(u => u.id != currentUserId);
  if (!matches.length) {
    container.innerHTML = '<div class="stat-sub" style="padding:20px;text-align:center;">No student matches right now.</div>';
    return;
  }
  container.innerHTML = matches.map(u => {
    const initials = (u.firstName || 'U').charAt(0) + (u.lastName || '').charAt(0);
    const color = avatarColors[u.id % avatarColors.length];
    const status = u.connection_status || 'none';
    const hobbyHtml = hobbyPillsHtml(getBuddyHobbies(u), myHobbies);
    let actionBtn = `<button class="btn-connect primary green-btn" onclick="sendConnectionRequest(${u.id})">Connect</button>`;
    if (status === 'accepted') {
      actionBtn = `<button class="btn-connect primary green-btn" onclick="openMessageWith(${u.id}, '${escapeHTML(u.firstName)} ${escapeHTML(u.lastName)}')">Chat</button>`;
    }
    return `<div class="buddy-card"><div class="buddy-avatar" style="background:${color};">${initials}</div><div class="buddy-info"><div class="buddy-name">${escapeHTML(u.firstName)} ${escapeHTML(u.lastName)}</div><div class="buddy-meta">${escapeHTML(u.course || 'Student')}</div>${hobbyHtml}</div><div class="buddy-actions">${actionBtn}</div></div>`;
  }).join('');
}

async function loadIncomingRequests() {
  if (!currentUserld) return;
  try {
    const res = await fetch(`${API_BASE}/connections/requests/${currentUserId}`);
    const requests = await res.json();
    const badge = document.querySelector('#navBuddies .badge');
    if (badge) badge.textContent = requests.length;
    renderFriendRequests(requests);
  } catch (e) { /* silent */ }
}

async function loadSocialBuddies() {
  if (!currentUserld) return;
  const container = document.getElementById('socialMatchesList');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/buddies/${currentUserId}`);
    const users = await res.json();
    renderSocialMatches(users);
  } catch (e) { if (container) container.innerHTML = '<div class="stat-sub">Could not load social matches.</div>'; }
}

// --- CALENDAR & TASKS ---
function changeMonth(dir) {
  if (dir === 0) { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); }
  else {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0) { calMonth = 11; calYear--; }
  }
  renderCalendar();
}

function renderCalendar() {
  const title = document.getElementById('calMonthTitle');
  const grid = document.getElementById('calGrid');
  if (!title || !grid) return;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  title.textContent = `${monthNames[calMonth]} ${calYear}`;
  
  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const padMonth = String(calMonth + 1).padStart(2, '0');

  const taskDates = new Set((calTasks || []).filter(t => t.due_date && t.status !== 'done').map(t => t.due_date.substring(0, 10)).filter(d => d.startsWith(`${calYear}-${padMonth}`)).map(d => parseInt(d.split('-')[2])));
  const sessionDates = new Set((calSessions || []).filter(s => s.status === 'planned' && s.session_date).filter(s => s.session_date.startsWith(`${calYear}-${padMonth}`)).map(s => parseInt(s.session_date.split('-')[2])));

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dayLabels.map(d => `<div class="cal-day-label">${d}</div>`).join('');
  
  for (let i = firstDay - 1; i >= 0; i--) html += `<div class="cal-cell other-month">${daysInPrev - i}</div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const dateStr = `${calYear}-${padMonth}-${String(d).padStart(2, '0')}`;
    const cls = ['cal-cell', isToday ? 'today' : '', taskDates.has(d) ? 'has-task' : '', sessionDates.has(d) ? 'has-session' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}" onclick="showCalDay('${dateStr}', event)">${d}</div>`;
  }
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) html += `<div class="cal-cell other-month">${d}</div>`;
  grid.innerHTML = html;
}

function showCalDay(dateStr, event) {
  document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
  if (event && event.currentTarget) event.currentTarget.classList.add('selected');
  const detail = document.getElementById('calDayDetail') || document.getElementById('calDayEventsBox');
  if (!detail) return;
  
  const dayTasks = (calTasks || []).filter(t => t.due_date && t.due_date.startsWith(dateStr) && t.status !== 'done');
  const daySess = (calSessions || []).filter(s => s.session_date === dateStr && s.status === 'planned');
  
  if (!dayTasks.length && !daySess.length) {
    detail.innerHTML = `<div style="margin-top: 20px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;"><h4>Events on ${dateStr}</h4><p style="color:var(--muted); margin:0;">No tasks or sessions scheduled for this date.</p></div>`;
    return;
  }
  
  let html = `<div style="margin-top: 20px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;"><h4 style="margin:0 0 10px 0;">Schedule for ${dateStr}</h4>`;
  if (dayTasks.length) {
    html += `<h5 style="color:#2563eb; margin:8px 0 4px 0;">Tasks:</h5><ul style="margin:0 0 8px 18px; padding:0;">`;
    dayTasks.forEach(t => { html += `<li><strong>${escapeHTML(t.title)}</strong> (${escapeHTML(t.course || 'General')})</li>`; });
    html += `</ul>`;
  }
  if (daySess.length) {
    html += `<h5 style="color:#10b981; margin:8px 0 4px 0;">Study Sessions:</h5><ul style="margin:0 0 0 18px; padding:0;">`;
    daySess.forEach(s => { html += `<li><strong>${escapeHTML(s.title)}</strong> at ${escapeHTML(s.start_time || '')}</li>`; });
    html += `</ul>`;
  }
  html += `</div>`;
  detail.innerHTML = html;
}

function renderUpcoming() {
  const taskEl = document.getElementById('homeUpcomingTasks');
  if (taskEl) {
    const upcoming = (calTasks || []).filter(t => t.status !== 'done' && t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
    if (!upcoming.length) { taskEl.innerHTML = '<div class="stat-sub">No upcoming tasks.</div>'; }
    else {
      taskEl.innerHTML = upcoming.map(t => `<div class="upcoming-item"><div class="upcoming-info"><div class="upcoming-title">${escapeHTML(t.title)}</div></div><span class="upcoming-date">${escapeHTML(t.due_date)}</span></div>`).join('');
    }
  }
}

async function loadStats() {
  if (!currentUserld) return;
  try {
    const res = await fetch(`${API_BASE}/stats/${currentUserld}`);
    const s = await res.json();
    ['statMatches', 'statBuddies', 'statPending', 'statHours'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = [s.matches, s.buddies, s.pendingRequests, s.studyHours][i];
    });
  } catch (e) { console.error('Could not load stats:', e); }
}

async function loadTasks() {
  if (!currentUserld) return;
  try {
    const res = await fetch(`${API_BASE}/api/tasks/${currentUserld}`);
    allTasks = await res.json();
    renderTasks();
    updateTaskBadge();
  } catch (e) {
    const list = document.getElementById('taskList');
    if (list) list.innerHTML = '<div class="stat-sub">Could not reach the server.</div>';
  }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  const visible = allTasks.filter(t => {
    if (taskFilter === 'pending') return t.status !== 'done';
    if (taskFilter === 'done') return t.status === 'done';
    return true;
  });
  if (!visible.length) {
    list.innerHTML = '<div style="text-align:center; padding: 40px 20px;">No tasks here yet.</div>';
    return;
  }
  list.innerHTML = visible.map(t => {
    const done = t.status === 'done';
    return `<div class="task-card ${done ? 'done' : ''}"><div class="task-info"><div class="task-title">${escapeHTML(t.title)}</div></div></div>`;
  }).join('');
}

function setTaskFilter(btn, filter) {
  taskFilter = filter;
  btn.closest('.filter-bar')?.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

function updateTaskBadge() {
  const badge = document.getElementById('taskBadge');
  if (!badge) return;
  const urgent = allTasks.filter(t => t.status !== 'done' && t.due_date && Math.ceil((new Date(t.due_date) - new Date()) / 86400000) <= 2).length;
  badge.style.display = urgent > 0 ? 'inline-block' : 'none';
  badge.textContent = urgent;
}

// --- BUDDIES & CONNECTIONS ---
const avatarColors = ['#3461d1', '#7c3aed', '#16a34a', '#0891b2', '#ea580c', '#db2777', '#b45309', '#0f766e'];

function setBuddyFilter(btn, filter) {
  buddyFilter = filter;
  btn.closest('.filter-bar')?.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBuddies();
}

async function loadBuddies() {
  if (!currentUserld) return;
  try {
    const res = await fetch(`${API_BASE}/buddies/${currentUserld}`);
    allBuddies = await res.json();
    renderBuddies();
    loadStats();
  } catch (e) {
    const list = document.getElementById('buddyList');
    if (list) list.innerHTML = '<div class="stat-sub">Could not load students.</div>';
  }
}

function compatScore(buddy) {
  if (buddy.connection_status === 'accepted') return 100;
  if (buddy.course && currentUserCourse && buddy.course === currentUserCourse)
    return 88 + ((buddy.id * 3 + (currentUserld || 0)) % 11);
  return 55 + ((buddy.id * 7 + (currentUserld || 0) * 3) % 30);
}

function renderBuddies() {
  const list = document.getElementById('buddyList');
  if (!list) return;
  if (!allBuddies || allBuddies.length === 0) {
    list.innerHTML = '<div class="stat-sub" style="padding:15px;text-align:center;">No students found.</div>';
    return;
  }
  let visible = allBuddies.filter(b => {
    if (buddyFilter === 'same') return b.course === currentUserCourse;
    if (buddyFilter === 'pending') return b.connection_status === 'pending';
    if (buddyFilter === 'accepted') return b.connection_status === 'accepted';
    return true;
  });
  if (!visible.length) {
    list.innerHTML = '<div class="stat-sub" style="padding: 10px 0;">No students found for this filter.</div>';
    return;
  }
  list.innerHTML = visible.map(b => {
    const initials = (b.firstName || '?').charAt(0) + (b.lastName || '?').charAt(0);
    const color = avatarColors[b.id % avatarColors.length];
    const score = compatScore(b);
    const isSameCourse = b.course === currentUserCourse;
    const status = b.connection_status;
    const iSent = status === 'pending' && b.requester_id == currentUserld;
    const theySent = status === 'pending' && b.requester_id != currentUserld;
    const hobbyHtml = hobbyPillsHtml(getBuddyHobbies(b), myHobbies);
    let actionBtn = '';
    if (status === 'accepted') {
      actionBtn = `<button class="btn-connect primary" style="background:var(--green);" onclick="openStudyRoom(${b.id}, '${escapeHTML(b.firstName)} ${escapeHTML(b.lastName)}', ${b.connection_id || 0})">Study Together</button>
      <button class="btn-connect ghost" onclick="openMessageWith(${b.id}, '${escapeHTML(b.firstName)} ${escapeHTML(b.lastName)}')">Chat</button>`;
    } else if (iSent) {
      actionBtn = `<button class="btn-connect ghost" disabled>Sent ✓</button>`;
    } else if (theySent) {
      actionBtn = `<button class="btn-connect primary" onclick="respondConnection(${b.connection_id}, 'accepted')">Accept</button>
      <button class="btn-connect ghost" onclick="respondConnection(${b.connection_id}, 'declined')">Decline</button>`;
    } else {
      actionBtn = `<button class="btn-connect primary" onclick="sendRequest(${b.id})">Connect</button>
      <button class="btn-connect ghost">Skip</button>`;
    }
    return `<div class="buddy-card" id="buddy-${b.id}">
      <div class="buddy-avatar" style="background:${color};">${initials}</div>
      <div class="buddy-info">
        <div class="buddy-name">${escapeHTML(b.firstName)} ${escapeHTML(b.lastName)}</div>
        <div class="buddy-meta">${escapeHTML(b.course || 'Student')}. ${escapeHTML(b.studentNum || '')}</div>
        <div class="buddy-tags">
          ${isSameCourse ? '<span class="tag blue">Same course</span>' : '<span class="tag amber">Different course</span>'}
          ${status === 'accepted' ? '<span class="tag green">Connected</span>' : ''}
        </div>
        ${hobbyHtml}
      </div>
      <div class="compat-bar">
        <div class="compat-pct">${score}%</div>
        <div class="compat-label">match</div>
        <div class="compat-track"><div class="compat-fill" style="width:${score}%;"></div></div>
      </div>
      <div class="buddy-actions">${actionBtn}</div>
    </div>`;
  }).join('');
}

async function sendRequest(receiverId) {
  try {
    const res = await fetch(`${API_BASE}/connections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester_id: currentUserld, receiver_id: receiverId })
    });
    if (res.ok) {
      loadBuddies();
      loadDashboardSocialData();
    } else {
      const err = await res.json();
      alert(err.error || 'Could not send request.');
    }
  } catch (e) { alert('Could not send request.'); }
}

async function sendConnectionRequest(receiverId) {
  await sendRequest(receiverId);
}

async function respondConnection(connectionId, status) {
  try {
    const res = await fetch(`${API_BASE}/connections/${connectionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      loadBuddies();
      loadDashboardSocialData();
      loadStats();
    }
  } catch (err) { console.error('Response error:', err); }
}

// --- MESSAGES / CHAT ---
async function loadContacts() {
  if (!currentUserld) return;
  const listEl = document.getElementById('msgContactsList');
  if (!listEl) return;
  try {
    const res = await fetch(`${API_BASE}/buddies/${currentUserId}`);
    const buddies = await res.json();
    const accepted = buddies.filter(b => b.connection_status === 'accepted');
    if (!accepted.length) {
      listEl.innerHTML = '<div class="stat-sub" style="padding: 15px; text-align:center;">No connected buddies yet.</div>';
      return;
    }
    listEl.innerHTML = accepted.map(b => {
      const initials = (b.firstName || 'U').charAt(0) + (b.lastName || '').charAt(0);
      const color = avatarColors[b.id % avatarColors.length];
      return `
        <div id="chat-contact-${b.id}" onclick="openChat(${b.id}, '${escapeHTML(b.firstName)} ${escapeHTML(b.lastName)}', '${escapeHTML(b.course || 'Student')}')" style="display:flex; align-items:center; gap:12px; padding:12px; border-radius:8px; cursor:pointer;">
          <div style="width:40px; height:40px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">${escapeHTML(initials)}</div>
          <div>
            <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(b.firstName)} ${escapeHTML(b.lastName)}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${escapeHTML(b.course || 'Student')}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (listEl) listEl.innerHTML = '<div class="stat-sub" style="padding: 15px; text-align:center;">Could not load contacts.</div>';
  }
}

async function openChat(buddyId, buddyName, buddyCourse) {
  activeChatUserId = buddyId;
  activeChatUserName = buddyName;
  const headerTitle = document.getElementById('chatHeaderTitle');
  const chatForm = document.getElementById('chatForm');
  const headerActions = document.getElementById('chatHeaderActions');
  if (headerActions) headerActions.style.display = 'flex';

  if (headerTitle) headerTitle.textContent = `Chat with ${escapeHTML(buddyName)}`;
  if (chatForm) {
    chatForm.style.display = 'flex';
  }
  await loadMessages();
}

async function loadMessages() {
  if (!activeChatUserId || !currentUserld) return;
  const chatBox = document.getElementById('chatMessages');
  if (!chatBox) return;
  try {
    const res = await fetch(`${API_BASE}/api/messages/${currentUserId}/${activeChatUserId}`);
    if (!res.ok) return;
    const messages = await res.json();
    if (!messages.length) {
      chatBox.innerHTML = '<div style="margin:auto; color:var(--muted); text-align:center; padding:40px 0;">No messages yet. Say hello!</div>';
      return;
    }
    chatBox.innerHTML = messages.map(m => {
      const isMe = String(m.sender_id) === String(currentUserId);
      return `<div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:8px;"><div style="padding:10px 14px; border-radius:12px; background:${isMe ? 'var(--blue)' : 'var(--bg)'}; color:${isMe ? '#fff' : 'var(--text)'}; font-size:0.88rem;">${escapeHTML(m.body || m.message)}</div></div>`;
    }).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) { console.error('loadMessages error:', err); }
}

async function sendChatMessage(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text || !activeChatUserId || !currentUserld) return;
  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: currentUserld, receiver_id: activeChatUserId, body: text })
    });
    if (res.ok) {
      input.value = '';
      await loadMessages();
    }
  } catch (err) { alert('Server error.'); }
}

function startMessagePolling() {
  stopMessagePolling();
  messagesPollInterval = setInterval(() => { if (activeChatUserId) loadMessages(); }, 3000);
}

function stopMessagePolling() {
  if (messagesPollInterval) { clearInterval(messagesPollInterval); messagesPollInterval = null; }
}

function openMessageWith(buddyId, buddyName) {
  showView('messages');
  setTimeout(() => openChat(buddyId, buddyName, ''), 400);
}

// --- LOAD SESSIONS WRAPPER ---
function loadSessions() {
  loadStudyGroups();
}

// --- STUDY GROUPS & SESSIONS ---
async function loadStudyGroups() {
  const container = document.getElementById('studyGroupsList');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/api/study-groups`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const groups = await res.json();
    if (!groups || !groups.length) {
      container.innerHTML = `<div class="stat-sub" style="padding: 10px 0;">No study groups scheduled yet. Create one above!</div>`;
      return;
    }
    container.innerHTML = '';
    groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'card p-3 mb-3';
      card.style.cssText = 'border-left: 4px solid #4f46e5; background: #fff; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 10px; padding: 12px;';
      card.setAttribute('data-group-id', g.id);

      const formatBadge = g.format === 'online'
        ? `<span style="color: #2563eb; font-weight: 500;">💻 Online (MS Teams)</span> - <a href="${escapeHTML(g.location)}" target="_blank" style="color: #4f46e5;">Join Meeting</a>`
        : `<span style="color: #059669; font-weight: 500;">📍 Physical Venue</span>: ${escapeHTML(g.location)}`;

      card.innerHTML = `
        <h4 style="margin: 0 0 5px 0; color: #1e293b;">${escapeHTML(g.title)}</h4>
        <p style="margin: 0 0 5px 0;"><strong>Subject:</strong> ${escapeHTML(g.subject)}</p>
        <p style="margin: 0 0 5px 0; font-size: 0.9em;">${formatBadge}</p>
        <p style="margin: 0 0 10px 0; font-size: 0.85em; color: #64748b;">Host: ${escapeHTML(g.host)} | 📅 ${escapeHTML(g.date)} at ⏰ ${escapeHTML(g.time)}</p>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm join-study-btn" style="padding: 6px 12px; background: #4f46e5; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Join Room</button>
          <button class="btn btn-sm delete-study-btn" style="padding: 6px 12px; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
        <div id="group-members-${g.id}" style="margin-top: 10px;"></div>
      `;

      card.querySelector('.join-study-btn').addEventListener('click', () => joinStudyGroup(g.id));
      card.querySelector('.delete-study-btn').addEventListener('click', () => deleteStudyGroup(g.id));
      container.appendChild(card);
      loadStudyGroupMembers(g.id);
    });
  } catch (err) {
    container.innerHTML = `<div class="stat-sub" style="color: red; padding:10px 0;">Error loading study groups.</div>`;
  }
}

async function loadStudyGroupMembers(groupId) {
  try {
    const response = await fetch(`${API_BASE}/api/study-groups/${groupId}/members`);
    const members = await response.json();
    let container = document.getElementById(`group-members-${groupId}`);
    if (!container) return;
    let html = `<strong style="color: #1e293b;">Active Participants (${members.length}):</strong><ul style="margin: 6px 0 0 18px; padding: 0; color: #475569;">`;
    if (!members.length) {
      html += '<li>No participants joined yet.</li>';
    } else {
      members.forEach(m => { html += `<li><strong>${escapeHTML(m.user_name)}</strong> (Online)</li>`; });
    }
    html += '</ul>';
    container.innerHTML = html;
  } catch (err) { /* silent */ }
}

async function joinStudyGroup(groupId) {
  const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
  const currentUser = storedUser ? JSON.parse(storedUser) : {};
  const userId = currentUser.id || currentUserld || 1;
  const userName = (currentUser.firstName && currentUser.lastName) ? `${currentUser.firstName} ${currentUser.lastName}` : (currentUser.firstName || 'Student');
  try {
    const res = await fetch(`${API_BASE}/api/study-groups/${groupId}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, user_name: userName })
    });
    if (res.ok) loadStudyGroupMembers(groupId);
    else { const data = await res.json(); alert(data.error || 'Could not join room.'); }
  } catch (err) { alert('Network error.'); }
}

async function deleteStudyGroup(groupId) {
  if (!confirm('Cancel this study group?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/study-groups/${groupId}`, { method: 'DELETE' });
    if (res.ok) loadStudyGroups();
    else alert('Could not delete study group.');
  } catch (err) { alert('Server connection error.'); }
}

function toggleFormatInputs() {
  const format = document.getElementById('groupFormat')?.value;
  const physicalDiv = document.getElementById('physicalVenueGroup');
  const onlineDiv = document.getElementById('onlineLinkGroup');
  if (format === 'online') {
    if (physicalDiv) physicalDiv.style.display = 'none';
    if (onlineDiv) onlineDiv.style.display = 'block';
  } else {
    if (physicalDiv) physicalDiv.style.display = 'block';
    if (onlineDiv) onlineDiv.style.display = 'none';
  }
}

// --- INVITE TO STUDY ROOM FROM CHAT ---
function inviteToStudyRoom() {
  if (!activeChatUserId) return;
  fetch(`${API_BASE}/api/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      sender_id: currentUserld, 
      receiver_id: activeChatUserId, 
      body: `🎯 I've opened a Study Room! Join me: click "Find Buddies" → Connected → Study Together` 
    })
  }).then(() => { loadMessages(); openStudyRoom(activeChatUserId, activeChatUserName, 0); });
}

// --- STUDY ROOM & NAVIGATION HELPERS ---
async function openStudyRoom(buddyId, buddyName, connectionId) {
  srBuddyId = buddyId;
  srBuddyName = buddyName;
  srConnectionId = connectionId;
  
  // Ensure studyRoomView is explicitly displayed and hide other views
  ['homeView', 'tasksView', 'buddyView', 'messagesView', 'sessionsView', 'mapView']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const roomView = document.getElementById('studyRoomView');
  if (roomView) roomView.style.display = 'block';

  const stored = localStorage.getItem('currentUser');
  const me = stored ? JSON.parse(stored) : {};
  const myName = `${me.firstName || 'You'} ${me.lastName || ''}`.trim();
  const myInitials = ((me.firstName || 'Y')[0] + (me.lastName || 'U')[0]).toUpperCase();
  const buddyInitials = buddyName.split(' ').map(n => n[0]).join('').toUpperCase();
  const color = avatarColors[buddyId % avatarColors.length];
  
  const av = document.getElementById('roomBuddyAvatar');
  if (av) { av.textContent = myInitials; av.style.background = color; }
  
  const rt = document.querySelector('#studyRoomView .room-title');
  if (rt) rt.textContent = 'Collaborative Study Room';
  
  const youLabel = document.getElementById('srYouLabel');
  const partnerLabel = document.getElementById('srPartnerLabel');
  const roomAvatarBig = document.getElementById('srPartnerAvatar');
  if (youLabel) youLabel.textContent = myName;
  if (partnerLabel) partnerLabel.textContent = buddyName;
  if (roomAvatarBig) { roomAvatarBig.textContent = buddyInitials; roomAvatarBig.style.background = color; }

  try {
    const res = await fetch(`${API_BASE}/study-rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user1_id: currentUserld, user2_id: buddyId })
    });
    const room = await res.json();
    srRoomId = room.id;
    const topicEl = document.getElementById('roomTopic');
    const notesEl = document.getElementById('roomNotesArea');
    if (topicEl && room.topic) topicEl.value = room.topic;
    if (notesEl && room.notes) notesEl.value = room.notes;
    updateNoteWordCount();
  } catch (e) { console.warn('Study room server not available:', e.message); }

  srStartTime = Date.now();
  clearInterval(srSessionTimer);
  clearInterval(srNotesTimer);
  srSessionTimer = setInterval(updateSessionClock, 1000);
  srNotesTimer = setInterval(pollSharedNotes, 8000);

  const topicInput = document.getElementById('roomTopic');
  if (topicInput) {
    topicInput.removeEventListener('input', onTopicInput);
    topicInput.addEventListener('input', onTopicInput);
  }
  const notesInput = document.getElementById('roomNotesArea');
  if (notesInput) {
    notesInput.removeEventListener('input', updateNoteWordCount);
    notesInput.addEventListener('input', updateNoteWordCount);
  }

  srResetPomodoro();
  startCamera();
  srRequestNotifPermission();
  sessionStorage.setItem('activeView', 'studyRoom');
  startPartnerVideoPolling();
}
function updateSessionClock() {
  if (!srStartTime) return;
  const s = Math.floor((Date.now() - srStartTime) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const el = document.getElementById('srSessionTime');
  if (el) el.textContent = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : `${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

let srTopicDebounce = null;
function onTopicInput() { clearTimeout(srTopicDebounce); srTopicDebounce = setTimeout(saveStudyRoomData, 1500); }

async function saveStudyRoomData() {
  if (!srRoomId) return;
  const notes = document.getElementById('roomNotesArea')?.value || '';
  const topic = document.getElementById('roomTopic')?.value || '';
  try {
    await fetch(`${API_BASE}/study-rooms/${srRoomId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, topic })
    });
  } catch (e) { /* silent */ }
}

async function pollSharedNotes() {
  if (!srRoomId) return;
  try {
    const res = await fetch(`${API_BASE}/study-rooms/${srRoomId}`);
    if (!res.ok) return;
    const room = await res.json();
    const notesEl = document.getElementById('roomNotesArea');
    if (notesEl && document.activeElement !== notesEl && room.notes !== notesEl.value) {
      notesEl.value = room.notes || '';
      updateNoteWordCount();
    }
  } catch (e) { /* silent */ }
}

function updateNoteWordCount() {
  const notes = document.getElementById('roomNotesArea');
  const el = document.getElementById('srWordCount');
  if (!notes || !el) return;
  const words = notes.value.trim() ? notes.value.trim().split(/\s+/).length : 0;
  el.textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

async function startCamera() {
  const video = document.getElementById('srMyVideo');
  const noVideoMsg = document.getElementById('srNoVideoMsg');
  const camBtn = document.getElementById('srCamBtn');
  const micBtn = document.getElementById('srMicBtn');
  if (!video) return;
  if (srLocalStream) { srLocalStream.getTracks().forEach(t => t.stop()); srLocalStream = null; }
  try {
    srLocalStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: true });
    video.style.display = 'block';
    if (noVideoMsg) noVideoMsg.style.display = 'none';
    video.srcObject = srLocalStream;
    try { await video.play(); } catch (e) {}
    if (camBtn) { camBtn.textContent = 'Stop Cam'; camBtn.style.background = 'rgba(255,255,255,0.15)'; }
    if (micBtn) { micBtn.textContent = 'Mute'; micBtn.style.background = 'rgba(255,255,255,0.15)'; }
  } catch (err) {
    video.style.display = 'none';
    if (noVideoMsg) { noVideoMsg.style.display = 'flex'; }
  }
}

function toggleCamera() {
  const video = document.getElementById('srMyVideo');
  const noVideoMsg = document.getElementById('srNoVideoMsg');
  const camBtn = document.getElementById('srCamBtn');
  if (!srLocalStream) { startCamera(); return; }
  const videoTracks = srLocalStream.getVideoTracks();
  if (!videoTracks.length) { startCamera(); return; }
  const nowEnabled = videoTracks[0].enabled;
  if (nowEnabled) {
    videoTracks[0].enabled = false;
    if (video) video.style.display = 'none';
    if (noVideoMsg) noVideoMsg.style.display = 'flex';
    if (camBtn) camBtn.textContent = 'Start Cam';
  } else {
    videoTracks[0].enabled = true;
    if (video) video.style.display = 'block';
    if (noVideoMsg) noVideoMsg.style.display = 'none';
    if (camBtn) camBtn.textContent = 'Stop Cam';
  }
}

function toggleMic() {
  const micBtn = document.getElementById('srMicBtn');
  if (!srLocalStream) { startCamera(); return; }
  const audioTracks = srLocalStream.getAudioTracks();
  if (!audioTracks.length) return;
  const enabled = audioTracks[0].enabled;
  audioTracks[0].enabled = !enabled;
  if (micBtn) { micBtn.textContent = enabled ? 'Unmute' : 'Mute'; }
}

function leaveStudyRoom() {
  if (srLocalStream) { srLocalStream.getTracks().forEach(t => t.stop()); srLocalStream = null; }
  clearInterval(srSessionTimer);
  clearInterval(srNotesTimer);
  clearTimeout(srTopicDebounce);
  saveStudyRoomData();
  showView('buddy');
}

// PARTNER VIDEO SNAPSHOT POLLING
let srSnapshotUploadInterval = null;
let srSnapshotFetchInterval = null;
function startPartnerVideoPolling() {
  stopPartnerVideoPolling();
  srSnapshotUploadInterval = setInterval(uploadMySnapshot, 2000);
  srSnapshotFetchInterval = setInterval(fetchPartnerSnapshot, 2000);
}
function stopPartnerVideoPolling() {
  clearInterval(srSnapshotUploadInterval); srSnapshotUploadInterval = null;
  clearInterval(srSnapshotFetchInterval); srSnapshotFetchInterval = null;
}
async function uploadMySnapshot() {
  if (!srLocalStream || !srRoomId || !currentUserld) return;
  const video = document.getElementById('srMyVideo');
  if (!video || video.readyState < 2) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
    await fetch(`${API_BASE}/study-rooms/${srRoomId}/snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserld, snapshot: canvas.toDataURL('image/jpeg', 0.5) })
    });
  } catch (e) { /* silent */ }
}
async function fetchPartnerSnapshot() {
  if (!srRoomId || !srBuddyId) return;
  try {
    const res = await fetch(`${API_BASE}/study-rooms/${srRoomId}/snapshot/${srBuddyId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.snapshot) {
      const img = document.getElementById('srPartnerVideo');
      if (img) { img.src = data.snapshot; img.style.display = 'block'; }
      const ph = document.getElementById('srPartnerPlaceholder');
      if (ph) ph.style.display = 'none';
    }
  } catch (e) { /* silent */ }
}

// POMODORO
function srFmt(secs) { return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`; }
function srTogglePomodoro() {
  if (sr_pomoRunning) {
    clearInterval(sr_pomoInterval); sr_pomoRunning = false;
    const b = document.getElementById('srPomoBtn'); if (b) b.textContent = 'Start';
  } else {
    sr_pomoRunning = true;
    const b = document.getElementById('srPomoBtn'); if (b) b.textContent = '⏸ Pause';
    sr_pomoInterval = setInterval(() => {
      sr_pomoSeconds--;
      const d = document.getElementById('srPomoDisplay'); if (d) d.textContent = srFmt(sr_pomoSeconds);
      if (sr_pomoSeconds <= 0) {
        clearInterval(sr_pomoInterval); sr_pomoRunning = false;
        const btn = document.getElementById('srPomoBtn'); if (btn) btn.textContent = 'Start';
        sr_pomoSeconds = 25 * 60;
      }
    }, 1000);
  }
}
function srResetPomodoro() {
  clearInterval(sr_pomoInterval); sr_pomoRunning = false;
  sr_pomoSeconds = 25 * 60;
  const d = document.getElementById('srPomoDisplay'); if (d) d.textContent = '25:00';
  const b = document.getElementById('srPomoBtn'); if (b) b.textContent = 'Start';
}
function srRequestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

// --- PROFILE PICTURE APPLICATOR ---
function applyProfilePicture(imageSrc) {
  const bigAvatar = document.getElementById('profileBigAvatar');
  if (bigAvatar) {
    bigAvatar.style.backgroundImage = `url(${imageSrc})`;
    bigAvatar.style.backgroundSize = 'cover';
    bigAvatar.style.backgroundPosition = 'center';
    bigAvatar.textContent = '';
  }
  const topNavAvatar = document.getElementById('topNavAvatar');
  if (topNavAvatar) {
    topNavAvatar.style.backgroundImage = `url(${imageSrc})`;
    topNavAvatar.style.backgroundSize = 'cover';
    topNavAvatar.style.backgroundPosition = 'center';
    topNavAvatar.textContent = '';
  }
  document.querySelectorAll('.avatar, .nav-avatar').forEach(avatar => {
    avatar.style.backgroundImage = `url(${imageSrc})`;
    avatar.style.backgroundSize = 'cover';
    avatar.style.backgroundPosition = 'center';
    avatar.textContent = '';
  });
}

// --- INITIALIZATION ON PAGE LOAD ---
document.addEventListener('DOMContentLoaded', () => {
  const rawSession = localStorage.getItem('currentUser') || localStorage.getItem('user');
  if (!rawSession) { 
    alert('Session expired. Please log in again.'); 
    window.location.href = 'Signin.html'; 
    return; 
  }

  let user = {};
  try { user = JSON.parse(rawSession); } catch (e) { user = { firstName: 'Student', lastName: 'User', studentNum: 'Connected' }; }

  currentUserld = user.id || localStorage.getItem('userId') || 1;
  currentUserId = currentUserld;
  currentUserCourse = user.course || '';

  const welcomeGreeting = document.getElementById('welcomeGreeting');
  if (welcomeGreeting) welcomeGreeting.textContent = `Welcome back, ${escapeHTML(user.firstName || 'Student')}! Choose your mode and connect with students on campus.`;

  const savedView = sessionStorage.getItem('activeView') || 'home';
  showView(savedView);

  if (currentUserld) {
    try {
      injectHobbyStyles();
      loadStats();
      loadHome();
      loadIncomingRequests();
      loadBuddies();
      loadMyHobbies();
      loadStudyGroups();
      applyPageLanguage();
    } catch (err) { console.error('Data loading error:', err); }
  }

  // Load saved profile picture avatar if available
  const savedAvatar = localStorage.getItem('profilePic');
  if (savedAvatar && typeof applyProfilePicture === 'function') {
    applyProfilePicture(savedAvatar);
  }

  // Profile Avatar Click Listener
  const topNavAvatar = document.getElementById('topNavAvatar');
  if (topNavAvatar) {
    topNavAvatar.style.cursor = 'pointer';
    topNavAvatar.addEventListener('click', navigateToProfile);
  }

  // Modal Setup
  const modal = document.getElementById('createGroupModal');
  let openBtn = document.getElementById('openCreateModalBtn');
  if (!openBtn) {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.innerText && btn.innerText.includes('Create Study Group')) openBtn = btn;
    });
  }
  const cancelBtn = document.querySelector('.close-modal-btn') || document.getElementById('cancelModalBtn');

  if (openBtn && modal) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.style.display = modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    });
  }
  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.style.display = 'none';
    });
  }

  // Form Submission
  // FORM SUBMISSION - CREATE STUDY GROUP
const groupForm = document.getElementById('createGroupForm');

if (groupForm) {
  groupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = groupForm.querySelector('button[type="submit"]');

    const title = document.getElementById('groupTitle').value.trim();
    const subject = document.getElementById('groupSubject').value.trim();
    const date = document.getElementById('groupDate').value;
    const time = document.getElementById('groupTime').value;
    const format = document.getElementById('groupFormat').value;

    const locationInput = format === 'online'
      ? document.getElementById('groupTeamsLink')
      : document.getElementById('groupLocation');

    const location = locationInput ? locationInput.value.trim() : '';

    const host = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ') || 'Student';

    // Validate fields
    if (!title || !subject || !date || !time || !location) {
      alert('Please complete all study group fields.');
      return;
    }

    if (!['physical', 'online'].includes(format)) {
      alert('Please select a valid session format.');
      return;
    }

    if (format === 'online') {
      try {
        const meetingUrl = new URL(location);
        if (meetingUrl.protocol !== 'https:') {
          alert('Please enter a valid HTTPS meeting link.');
          return;
        }
      } catch {
        alert('Please enter a valid MS Teams meeting link.');
        return;
      }
    }

    const newGroup = {
      title,
      subject,
      host,
      date,
      time,
      format,
      location
    };

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
      }

      const response = await fetch(`${API_BASE}/api/study-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newGroup)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'The server could not create your group.');
      }

      alert('Study group created successfully!');

      groupForm.reset();
      toggleFormatInputs();

      const modal = document.getElementById('createGroupModal');
      if (modal) modal.style.display = 'none';

      await loadStudyGroups();

    } catch (error) {
      console.error('CREATE STUDY GROUP ERROR:', error);
      alert('Could not create study group: ' + error.message);

    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish Study Group';
      }
    }
  });
}
 });


// --- STANDALONE BUDDY SEARCH ---
function filterBuddies() {
  const query = document.getElementById('buddySearchInput')?.value.toLowerCase() || '';
  document.querySelectorAll('.study-buddy-card, .buddy-card').forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
}

function navigateToProfile() {
  window.location.href = 'Profile.html';
}

function handleLogout() {
  clearInterval(clockInterval);
  stopMessagePolling();
  stopPartnerVideoPolling();
  if (srLocalStream) { srLocalStream.getTracks().forEach(t => t.stop()); }
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = 'Signin.html';
}
