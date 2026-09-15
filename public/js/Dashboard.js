// ─── ROOM / GLOBAL STATE ───
let currentRoomId = null;
let currentRoomBuddyId = null;
let currentRoomBuddyName = '';
let roomStartTime = null;
let roomSessionInterval = null;
let notesAutoSaveInterval = null;

// ─── DASHBOARD STATE ───
let currentMode = 'study';
let shyMode = false;
let availOn = true;
let currentUserId = null;
let allTasks = [];
let taskFilter = 'all';
let selectedContactId = null;
let selectedContactName = '';
let sessionFilter = 'mine';
let allBuddies = [];
let buddyFilter = 'all';
let currentUserCourse = '';
const API_BASE = 'http://localhost:5001';

// ─── MODE SELECTOR ───
function selectMode(mode) {
  currentMode = mode;
  document.getElementById('studyCard').classList.toggle('active', mode === 'study');
  document.getElementById('socialCard').classList.toggle('active', mode === 'social');
  document.getElementById('studyPanel').classList.toggle('active', mode === 'study');
  document.getElementById('socialPanel').classList.toggle('active', mode === 'social');

  const matchCountEl = document.getElementById('matchCount');
  if (matchCountEl) {
    matchCountEl.textContent = mode === 'study' ? '12' : '8';
  }

  const panel = document.getElementById(mode + 'Panel');
  if (panel) {
    panel.classList.remove('fade-in');
    void panel.offsetWidth;
    panel.classList.add('fade-in');
  }

  document.querySelectorAll('.filter-btn.active').forEach(b => {
    b.classList.remove('green');
    if (mode === 'social') b.classList.add('green');
  });
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
  document.querySelectorAll('.toggle-switch').forEach(t => {
    t.classList.toggle('off', !availOn);
  });
}

function setFilter(btn) {
  const filterBar = btn.closest('.filter-bar');
  if (!filterBar) return;
  filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'green'));
  btn.classList.add('active');
  if (currentMode === 'social') btn.classList.add('green');
}

// ─── DOM INIT ───
document.addEventListener("DOMContentLoaded", () => {
  console.log("--- Browser Storage Diagnostic Check ---");
  console.log("currentUser key:", localStorage.getItem('currentUser'));
  console.log("user key:", localStorage.getItem('user'));
  console.log("token key:", localStorage.getItem('token'));

  const rawSession = localStorage.getItem('currentUser') || localStorage.getItem('user') || localStorage.getItem('token');

  if (!rawSession) {
    console.error("Security Alert: No login data found in browser memory!");
    alert("Session expired. Please log in again.");
    window.location.href = 'Signin.html';
    return;
  }

  let user = {};
  try {
    user = JSON.parse(rawSession);
  } catch (e) {
    console.log("Session data is a plain token format. Creating a fallback profile.");
    user = { firstName: "Student", lastName: "User", studentNum: localStorage.getItem('studentNum') || "Connected" };
  }

  currentUserId = user.id || null;
  currentUserCourse = user.course || '';
  console.log('currentUserId set to:', currentUserId);

  const firstInitial = user.firstName ? user.firstName.charAt(0).toUpperCase() : 'S';
  const lastInitial = user.lastName ? user.lastName.charAt(0).toUpperCase() : 'D';
  const initials = firstInitial + lastInitial;

  const welcomeGreeting = document.getElementById('welcomeGreeting');
  const widgetName = document.getElementById('widgetName');
  const widgetNum = document.getElementById('widgetNum');
  const topNavAvatar = document.getElementById('topNavAvatar');
  const widgetAvatar = document.getElementById('widgetAvatar');

  if (welcomeGreeting) welcomeGreeting.textContent = `Welcome back, ${user.firstName || 'Student'}! Choose your mode and connect with students on campus.`;
  if (widgetName) widgetName.textContent = `${user.firstName || 'Student'} ${user.lastName || ''}`;
  if (widgetNum) widgetNum.textContent = `STU · ${user.studentNum || 'Active'}`;
  if (topNavAvatar) topNavAvatar.textContent = initials;
  if (widgetAvatar) widgetAvatar.textContent = initials;

  setupInteractiveListeners();

  const taskForm = document.getElementById('taskForm');
  if (taskForm) taskForm.addEventListener('submit', addTask);

  const savedView = sessionStorage.getItem('activeView') || 'home';
  showView(savedView);

  if (currentUserId) {
    loadStats();
    loadHome();
    if (savedView === 'tasks') loadTasks();
    if (savedView === 'messages') loadContacts();
    if (savedView === 'sessions') loadSessions();
    if (savedView === 'buddy') loadBuddies();
    loadIncomingRequests();
    applyPageLanguage();

    // Apply saved language to nav labels
    const langLabels = {
      en: { dashboard:'Dashboard', tasks:'Tasks', buddies:'Find Buddies', messages:'Messages', sessions:'Study Sessions' },
      zu: { dashboard:'Ikhasi Elikhulu', tasks:'Imisebenzi', buddies:'Thola Umngane', messages:'Imiyalezo', sessions:'Izikhathi Zokufunda' },
      xh: { dashboard:'Ikhasi Elingundoqo', tasks:'Imisebenzi', buddies:'Fumana Umhlobo', messages:'Imiyalezo', sessions:'Izikhathi Zokufunda' },
      af: { dashboard:'Tuisbladsy', tasks:'Take', buddies:"Vind 'n Maat", messages:'Boodskappe', sessions:'Studiesessies' }
    };
    const prefs = JSON.parse(localStorage.getItem('rc_prefs') || '{}');
    const lang = prefs.language || 'en';
    const labels = langLabels[lang] || langLabels.en;
    const navMap = {
      navDashboard: labels.dashboard,
      navTasks: labels.tasks,
      navBuddies: labels.buddies,
      navMessages: labels.messages,
      navSessions: labels.sessions
    };
    Object.entries(navMap).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) {
        el.childNodes.forEach(node => {
          if (node.nodeType === 3 && node.textContent.trim()) node.textContent = ' ' + text + ' ';
        });
      }
    });
  }
});

function setupInteractiveListeners() {
  document.querySelectorAll('.req-btn.accept, .req-btn.decline').forEach(btn => {
    btn.addEventListener('click', function() {
      const requestItem = this.closest('.request-item');
      if (requestItem) {
        requestItem.style.opacity = '0';
        requestItem.style.transition = 'opacity 0.3s';
        setTimeout(() => requestItem.remove(), 300);
      }
    });
  });

  document.querySelectorAll('.buddy-card .btn-connect.primary').forEach(btn => {
    btn.addEventListener('click', function() {
      this.textContent = '✓ Sent!';
      this.style.background = '#16a34a';
      this.disabled = true;
    });
  });
}

// ─── VIEW ROUTER ───
function showView(view) {
  ['buddyView','tasksView','homeView','messagesView','sessionsView','studyRoomView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const active = document.getElementById(
    view === 'buddy'      ? 'buddyView'     :
    view === 'tasks'      ? 'tasksView'     :
    view === 'home'       ? 'homeView'      :
    view === 'messages'   ? 'messagesView'  :
    view === 'sessions'   ? 'sessionsView'  :
    view === 'studyRoom'  ? 'studyRoomView' : 'homeView'
  );
  if (active) active.style.display = '';
  document.getElementById('navDashboard').classList.toggle('active', view === 'home');
  document.getElementById('navBuddies').classList.toggle('active', view === 'buddy');
  document.getElementById('navTasks').classList.toggle('active', view === 'tasks');
  document.getElementById('navMessages').classList.toggle('active', view === 'messages');
  document.getElementById('navSessions').classList.toggle('active', view === 'sessions');
  sessionStorage.setItem('activeView', view);
  if (view === 'home')     loadHome();
  if (view === 'tasks')    loadTasks();
  if (view === 'messages') loadContacts();
  if (view === 'sessions') loadSessions();
  if (view === 'buddy' && currentUserId) loadBuddies();
}

// ─── TASKS ───
async function loadTasks() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/tasks/${currentUserId}`);
    allTasks = await res.json();
    renderTasks();
    updateTaskBadge();
  } catch (e) {
    const list = document.getElementById('taskList');
    if (list) list.innerHTML = '<div class="stat-sub">Could not reach the server. Is Server.js running?</div>';
  }
}

function dueInfo(dueDate, status) {
  if (!dueDate) return { label: 'No due date', cls: '' };
  if (status === 'done') return { label: dueDate, cls: '' };
  const diffDays = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
  if (diffDays < 0) return { label: `Overdue · ${dueDate}`, cls: 'overdue' };
  if (diffDays <= 2) return { label: `Due soon · ${dueDate}`, cls: 'soon' };
  return { label: `Due ${dueDate}`, cls: '' };
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  const visible = allTasks.filter(t => {
    if (taskFilter === 'pending') return t.status !== 'done';
    if (taskFilter === 'done') return t.status === 'done';
    return true;
  });
  if (visible.length === 0) {
    list.innerHTML = '<div class="stat-sub" style="padding:10px 0;">No tasks here yet.</div>';
    return;
  }
  list.innerHTML = visible.map(t => {
    const done = t.status === 'done';
    const due = dueInfo(t.due_date, t.status);
    return `
      <div class="task-card ${done ? 'done' : ''}">
        <div class="task-check ${done ? 'checked' : ''}" onclick="toggleTaskDone(${t.id}, ${done})">
          ${done ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </div>
        <div class="task-info">
          <div class="task-title ${done ? 'done' : ''}">${t.title}</div>
          <div class="task-meta">${t.course ? t.course + ' · ' : ''}${due.label}</div>
        </div>
        <span class="task-priority ${t.priority}">${t.priority}</span>
      </div>
    `;
  }).join('');
}

function setTaskFilter(btn, filter) {
  taskFilter = filter;
  btn.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

function updateTaskBadge() {
  const badge = document.getElementById('taskBadge');
  if (!badge) return;
  const urgent = allTasks.filter(t => {
    if (t.status === 'done' || !t.due_date) return false;
    const diffDays = Math.ceil((new Date(t.due_date) - new Date()) / 86400000);
    return diffDays <= 2;
  }).length;
  badge.style.display = urgent > 0 ? '' : 'none';
  badge.textContent = urgent;
}

async function addTask(e) {
  e.preventDefault();
  if (!currentUserId) { alert('Session expired. Please log in again.'); return; }
  const body = {
    user_id: currentUserId,
    title: document.getElementById('taskTitle').value,
    course: document.getElementById('taskCourse').value,
    due_date: document.getElementById('taskDue').value,
    priority: document.getElementById('taskPriority').value
  };
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Could not create task.'); return; }
    document.getElementById('taskForm').reset();
    document.getElementById('taskPriority').value = 'medium';
    loadTasks();
  } catch (e) { alert('Could not reach the server. Is Server.js running?'); }
}

async function toggleTaskDone(taskId, currentlyDone) {
  try {
    await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentlyDone ? 'pending' : 'done' })
    });
    loadTasks();
  } catch (e) { alert('Could not update the task. Is Server.js running?'); }
}

// ─── LANGUAGE ───
function applyPageLanguage() {
  const prefs = JSON.parse(localStorage.getItem('rc_prefs') || '{}');
  const lang = prefs.language || 'en';
  const t = {
    en: { findBuddy:'Find a Buddy ', tasks:'Task & assignment tracker', tasksSub:'Stay ahead of deadlines without needing a timetable to remind you.', messages:'Messages 💬', messagesSub:'Chat with your study buddies and classmates.', sessions:'Study Sessions 📚', sessionsSub:'Schedule personal sessions or join group sessions with your buddies.', addTask:'Add a task', yourTasks:'Your tasks', scheduleSession:'Schedule a session', mySessions:'My Sessions', joinGroup:'Join a Group' },
    zu: { findBuddy:'Thola Umngane ', tasks:'Ulandelelo Lwemisebenzi', tasksSub:'Hlala phambili nemikhawulo ngaphandle kwejadwal.', messages:'Imiyalezo 💬', messagesSub:'Xoxa nezabelo zakho zokufunda.', sessions:'Izikhathi Zokufunda 📚', sessionsSub:'Hlela izikhathi noma ujoyine izikhathi zeqembu.', addTask:'Engeza Umsebenzi', yourTasks:'Imisebenzi Yakho', scheduleSession:'Hlela Isikhathi', mySessions:'Izikhathi Zami', joinGroup:'Joyina Iqembu' },
    xh: { findBuddy:'Fumana Umhlobo ', tasks:'Ulandelelwano Lwemisebenzi', tasksSub:'Hlala phambili neengxingane ngaphandle kwejadwal.', messages:'Imiyalezo 💬', messagesSub:'Thetha nabalingani bakho bokufunda.', sessions:'Izikhathi Zokufunda 📚', sessionsSub:'Hlela izikhathi okanye ujoyine izikhathi zeqela.', addTask:'Yongeza Umsebenzi', yourTasks:'Imisebenzi Yakho', scheduleSession:'Hlela Ixesha', mySessions:'Izikhathi Zam', joinGroup:'Joyina Iqela' },
    af: { findBuddy:"Vind 'n Maat ", tasks:"Taak & Opdragopsporing", tasksSub:"Bly voor spertye sonder 'n rooster om jou te herinner.", messages:'Boodskappe 💬', messagesSub:'Gesels met jou studiemaats en klasmaats.', sessions:'Studiesessies 📚', sessionsSub:"Skeduleer persoonlike sessies of sluit aan by groepsessies.", addTask:'Voeg Taak By', yourTasks:'Jou Take', scheduleSession:'Skeduleer Sessie', mySessions:'My Sessies', joinGroup:'Sluit Groep Aan' }
  };
  const l = t[lang] || t.en;
  document.querySelectorAll('.page-header h1').forEach(h => {
    const txt = h.textContent;
    if (txt.includes('Find a Buddy')) h.textContent = l.findBuddy;
    if (txt.includes('Task')) h.textContent = l.tasks;
    if (txt.includes('Messages')) h.textContent = l.messages;
    if (txt.includes('Study Sessions')) h.textContent = l.sessions;
  });
  document.querySelectorAll('.page-header p').forEach(p => {
    const txt = p.textContent;
    if (txt.includes('deadline')) p.textContent = l.tasksSub;
    if (txt.includes('buddies and classmates')) p.textContent = l.messagesSub;
    if (txt.includes('personal sessions')) p.textContent = l.sessionsSub;
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.textContent.trim() === 'My Sessions') btn.textContent = l.mySessions;
    if (btn.textContent.trim() === 'Join a Group') btn.textContent = l.joinGroup;
  });
}

// ─── HOME PANEL ───
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calTasks = [];
let calSessions = [];
let clockInterval = null;

function startClock() {
  if (clockInterval) return;
  clockInterval = setInterval(() => {
    const now = new Date();
    const clock = document.getElementById('homeClock');
    const dateEl = document.getElementById('homeDate');
    if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, 1000);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function loadHome() {
  if (!currentUserId) return;
  const greetEl = document.getElementById('homeGreeting');
  if (greetEl) {
    const stored = localStorage.getItem('currentUser');
    const firstName = stored ? JSON.parse(stored).firstName : 'Student';
    greetEl.textContent = `${getGreeting()}, ${firstName}! 👋`;
  }
  startClock();
  try {
    const res = await fetch(`${API_BASE}/stats/${currentUserId}`);
    const s = await res.json();
    ['homeStatMatches','homeStatBuddies','homeStatPending','homeStatHours'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = [s.matches, s.buddies, s.pendingRequests, s.studyHours][i];
    });
  } catch(e) {}
  try {
    const [tasksRes, sessRes] = await Promise.all([
      fetch(`${API_BASE}/tasks/${currentUserId}`),
      fetch(`${API_BASE}/study-sessions/user/${currentUserId}`)
    ]);
    calTasks = await tasksRes.json();
    calSessions = await sessRes.json();
  } catch(e) { calTasks = []; calSessions = []; }
  renderCalendar();
  renderUpcoming();
}

function changeMonth(dir) {
  if (dir === 0) { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); }
  else { calMonth += dir; if (calMonth > 11) { calMonth = 0; calYear++; } if (calMonth < 0) { calMonth = 11; calYear--; } }
  renderCalendar();
}

function renderCalendar() {
  const title = document.getElementById('calMonthTitle');
  const grid = document.getElementById('calGrid');
  if (!title || !grid) return;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent = `${monthNames[calMonth]} ${calYear}`;
  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const taskDates = new Set(calTasks
    .filter(t => t.due_date && t.status !== 'done')
    .map(t => t.due_date.substring(0, 10))
    .filter(d => d.startsWith(`${calYear}-${String(calMonth+1).padStart(2,'0')}`))
    .map(d => parseInt(d.split('-')[2]))
  );
  const sessionDates = new Set(calSessions
    .filter(s => s.status === 'planned')
    .map(s => s.session_date)
    .filter(d => d && d.startsWith(`${calYear}-${String(calMonth+1).padStart(2,'0')}`))
    .map(d => parseInt(d.split('-')[2]))
  );
  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dayLabels.map(d => `<div class="cal-day-label">${d}</div>`).join('');
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-cell other-month">${daysInPrev - i}</div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const hasTask = taskDates.has(d);
    const hasSess = sessionDates.has(d);
    const classes = ['cal-cell', isToday ? 'today' : '', hasTask ? 'has-task' : '', hasSess ? 'has-session' : ''].filter(Boolean).join(' ');
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += `<div class="${classes}" onclick="showCalDay('${dateStr}', event)">${d}</div>`;
  }
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) {
    html += `<div class="cal-cell other-month">${d}</div>`;
  }
  grid.innerHTML = html;
}

function showCalDay(dateStr, e) {
  document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
  if (e && e.target) e.target.classList.add('selected');
  const detail = document.getElementById('calDayDetail');
  if (!detail) return;
  const dayTasks = calTasks.filter(t => t.due_date && t.due_date.startsWith(dateStr) && t.status !== 'done');
  const daySess = calSessions.filter(s => s.session_date === dateStr && s.status === 'planned');
  if (!dayTasks.length && !daySess.length) {
    detail.innerHTML = `<div class="cal-day-detail-title">No events on ${dateStr}</div>`;
    return;
  }
  let html = `<div class="cal-day-detail-title">Events on ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {weekday:'long', day:'numeric', month:'short'})}</div>`;
  const pColors = { high: 'var(--red)', medium: 'var(--blue)', low: 'var(--muted)' };
  dayTasks.forEach(t => {
    html += `<div class="cal-event-item"><span class="cal-event-dot" style="background:${pColors[t.priority]||'var(--blue)'}"></span><span style="flex:1;font-weight:600;">${t.title}</span><span style="font-size:0.7rem;color:var(--muted);">${t.course||''}</span></div>`;
  });
  daySess.forEach(s => {
    html += `<div class="cal-event-item"><span class="cal-event-dot" style="background:var(--green)"></span><span style="flex:1;font-weight:600;">${s.title}</span><span style="font-size:0.7rem;color:var(--muted);">${s.start_time}</span></div>`;
  });
  detail.innerHTML = html;
}

function renderUpcoming() {
  const taskEl = document.getElementById('homeUpcomingTasks');
  const upcoming = calTasks.filter(t => t.status !== 'done' && t.due_date).sort((a,b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  if (!upcoming.length) {
    taskEl.innerHTML = '<div class="stat-sub">No upcoming tasks.</div>';
  } else {
    const pColors = { high: 'var(--red)', medium: 'var(--blue)', low: 'var(--muted)' };
    taskEl.innerHTML = upcoming.map(t => {
      const diff = Math.ceil((new Date(t.due_date) - new Date()) / 86400000);
      const dateClass = diff <= 2 ? 'soon' : '';
      const dateLabel = diff < 0 ? 'Overdue' : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : t.due_date;
      return `<div class="upcoming-item"><span class="upcoming-dot" style="background:${pColors[t.priority]};"></span><div class="upcoming-info"><div class="upcoming-title">${t.title}</div><div class="upcoming-meta">${t.course||'No course'} · ${t.priority} priority</div></div><span class="upcoming-date ${dateClass}">${dateLabel}</span></div>`;
    }).join('');
  }
  const sessEl = document.getElementById('homeUpcomingSessions');
  const upcomingSess = calSessions.filter(s => s.status === 'planned').sort((a,b) => a.session_date.localeCompare(b.session_date)||a.start_time.localeCompare(b.start_time)).slice(0, 4);
  if (!upcomingSess.length) {
    sessEl.innerHTML = '<div class="stat-sub">No upcoming sessions.</div>';
  } else {
    sessEl.innerHTML = upcomingSess.map(s => {
      const d = new Date(s.session_date + 'T00:00:00');
      const dateLabel = d.toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
      const icon = s.location_type === 'online' ? '' : '';
      return `<div class="upcoming-item"><span class="upcoming-dot" style="background:var(--green);"></span><div class="upcoming-info"><div class="upcoming-title">${s.title}</div><div class="upcoming-meta">${icon} ${s.location||'No location'} · ${s.start_time}</div></div><span class="upcoming-date green">${dateLabel}</span></div>`;
    }).join('');
  }
}

// ─── STATS ───
async function loadStats() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/stats/${currentUserId}`);
    const s = await res.json();
    const matches = document.getElementById('statMatches');
    const buddies = document.getElementById('statBuddies');
    const pending = document.getElementById('statPending');
    const hours   = document.getElementById('statHours');
    if (matches) matches.textContent = s.matches;
    if (buddies) buddies.textContent = s.buddies;
    if (hours)   hours.textContent   = s.studyHours;
    if (pending) {
      pending.textContent  = s.pendingRequests;
      pending.style.color  = s.pendingRequests > 0 ? 'var(--amber)' : 'var(--text)';
    }
  } catch (e) { console.error('Could not load stats:', e); }
}

// ─── BUDDIES ───
const avatarColors = ['#3461d1','#7c3aed','#16a34a','#0891b2','#ea580c','#db2777','#b45309','#0f766e'];

function setBuddyFilter(btn, filter) {
  buddyFilter = filter;
  btn.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBuddies();
}

async function loadBuddies() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/buddies/${currentUserId}`);
    allBuddies = await res.json();
    renderBuddies();
  } catch (e) {
    const list = document.getElementById('buddyList');
    if (list) list.innerHTML = '<div class="stat-sub">Could not load students. Is the server running?</div>';
  }
}

function compatScore(buddy) {
  if (buddy.connection_status === 'accepted') return 100;
  if (buddy.course && currentUserCourse && buddy.course === currentUserCourse) {
    return Math.floor(Math.random() * 11) + 88;
  }
  return Math.floor(Math.random() * 21) + 60;
}

function renderBuddies() {
  const list = document.getElementById('buddyList');
  if (!list) return;
  let visible = allBuddies.filter(b => {
    if (buddyFilter === 'same')     return b.course === currentUserCourse;
    if (buddyFilter === 'pending')  return b.connection_status === 'pending';
    if (buddyFilter === 'accepted') return b.connection_status === 'accepted';
    return true;
  });
  if (!visible.length) {
    list.innerHTML = '<div class="stat-sub" style="padding:10px 0;">No students found for this filter.</div>';
    return;
  }
  list.innerHTML = visible.map(b => {
    const initials = b.firstName.charAt(0) + b.lastName.charAt(0);
    const color    = avatarColors[b.id % avatarColors.length];
    const score    = compatScore(b);
    const isSameCourse = b.course === currentUserCourse;
    const status   = b.connection_status;
    const iSent    = status === 'pending' && b.requester_id === currentUserId;
    const theySent = status === 'pending' && b.requester_id !== currentUserId;
    let actionBtn  = '';
    if (status === 'accepted') {
      actionBtn = `
        <button class="btn-connect primary" style="background:var(--green);gap:6px;" onclick="openStudyRoom(${b.id}, '${b.firstName} ${b.lastName}')">
           Study Together
        </button>
        <button class="btn-connect ghost" onclick="openMessageWith(${b.id}, '${b.firstName} ${b.lastName}')">
          
        </button>`;
    } else if (iSent) {
      actionBtn = `<button class="btn-connect ghost" disabled>Sent ✓</button>`;
    } else if (theySent) {
      actionBtn = `<button class="btn-connect primary" onclick="respondRequest(${b.connection_id},'accepted')">Accept</button>
                   <button class="btn-connect ghost" onclick="respondRequest(${b.connection_id},'declined')">Decline</button>`;
    } else {
      actionBtn = `<button class="btn-connect primary" onclick="sendRequest(${b.id})">Connect</button>
                   <button class="btn-connect ghost">Skip</button>`;
    }
    return `
      <div class="buddy-card" id="buddy-${b.id}">
        <div class="buddy-avatar" style="background:${color};">${initials}</div>
        <div class="buddy-info">
          <div class="buddy-name">${b.firstName} ${b.lastName}</div>
          <div class="buddy-meta">${b.course || 'Student'} · ${b.studentNum}</div>
          <div class="buddy-tags">
            ${isSameCourse ? `<span class="tag blue">Same course</span>` : `<span class="tag amber">Different course</span>`}
            ${status === 'accepted' ? `<span class="tag green">Connected</span>` : ''}
          </div>
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
    await fetch(`${API_BASE}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester_id: currentUserId, receiver_id: receiverId })
    });
    loadBuddies();
  } catch (e) { alert('Could not send request. Is the server running?'); }
}

async function respondRequest(connectionId, status) {
  try {
    await fetch(`${API_BASE}/connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadBuddies();
    loadIncomingRequests();
    loadStats();
  } catch (e) { alert('Could not update request.'); }
}

async function loadIncomingRequests() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/connections/requests/${currentUserId}`);
    const requests = await res.json();
    const badge = document.querySelector('#navBuddies .badge');
    if (badge) badge.textContent = requests.length;
    const requestsWidget = document.querySelectorAll('.widget')[1];
    if (!requestsWidget) return;
    requestsWidget.querySelectorAll('.request-item').forEach(el => el.remove());
    if (!requests.length) {
      requestsWidget.insertAdjacentHTML('beforeend', '<div class="stat-sub" style="padding:8px 0;">No pending requests.</div>');
      return;
    }
    requests.forEach(r => {
      const initials = r.firstName.charAt(0) + r.lastName.charAt(0);
      const color    = avatarColors[r.requester_id % avatarColors.length];
      requestsWidget.insertAdjacentHTML('beforeend', `
        <div class="request-item" id="req-${r.id}">
          <div class="req-avatar" style="background:${color};">${initials}</div>
          <div class="req-info">
            <div class="req-name">${r.firstName} ${r.lastName}</div>
            <div class="req-meta">${r.course || 'Student'}</div>
          </div>
          <div class="req-btns">
            <button class="req-btn accept" onclick="respondRequest(${r.id},'accepted')">✓</button>
            <button class="req-btn decline" onclick="respondRequest(${r.id},'declined')">✕</button>
          </div>
        </div>`);
    });
  } catch (e) { /* silent */ }
}

// ─── STUDY SESSIONS ───
function toggleLocField() {
  const type = document.getElementById('sessLocType').value;
  document.getElementById('sessLocLabel').textContent = type === 'online' ? 'Meeting link' : 'Location (e.g. Library B2)';
  document.getElementById('sessLocation').placeholder  = type === 'online' ? 'https://meet.google.com/...' : 'e.g. Library Block B, Room 2';
}

async function createSession() {
  if (!currentUserId) return;
  const title        = document.getElementById('sessTitle').value.trim();
  const session_date = document.getElementById('sessDate').value;
  const start_time   = document.getElementById('sessTime').value;
  if (!title || !session_date || !start_time) { alert('Please fill in at least a title, date, and start time.'); return; }
  const body = {
    creator_id:   currentUserId,
    title,
    course:       document.getElementById('sessCourse').value,
    session_date,
    start_time,
    duration_mins: parseInt(document.getElementById('sessDuration').value),
    location_type: document.getElementById('sessLocType').value,
    location:      document.getElementById('sessLocation').value,
    is_group:      document.getElementById('sessIsGroup').checked
  };
  try {
    const res = await fetch(`${API_BASE}/study-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const e = await res.json(); alert(e.error); return; }
    ['sessTitle','sessCourse','sessDate','sessTime','sessLocation'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('sessDuration').value = '60';
    document.getElementById('sessLocType').value  = 'online';
    document.getElementById('sessIsGroup').checked = false;
    loadSessions();
  } catch (e) { alert('Could not reach server. Is Server.js running?'); }
}

function setSessionFilter(btn, filter) {
  sessionFilter = filter;
  btn.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadSessions();
}

async function loadSessions() {
  if (!currentUserId) return;
  const list  = document.getElementById('sessionList');
  const label = document.getElementById('sessionsLabel');
  list.innerHTML = '<div class="stat-sub" style="padding:10px 0;">Loading...</div>';
  try {
    let url = sessionFilter === 'mine'
      ? `${API_BASE}/study-sessions/user/${currentUserId}`
      : `${API_BASE}/study-sessions/group/${currentUserId}`;
    label.textContent = sessionFilter === 'mine' ? 'Your scheduled sessions' : 'Open group sessions you can join';
    const res      = await fetch(url);
    const sessions = await res.json();
    if (!sessions.length) {
      list.innerHTML = `<div class="stat-sub" style="padding:10px 0;">${sessionFilter === 'mine' ? 'No sessions yet. Schedule one above!' : 'No open group sessions right now.'}</div>`;
      return;
    }
    list.innerHTML = sessions.map(s => {
      const d            = new Date(s.session_date + 'T00:00:00');
      const day          = d.getDate();
      const mon          = d.toLocaleString('default', { month: 'short' });
      const isPhysical   = s.location_type === 'physical';
      const durationLabel = s.duration_mins >= 60 ? `${s.duration_mins / 60}h` : `${s.duration_mins}m`;
      const locIcon      = isPhysical ? '📍' : '🔗';
      const locText      = s.location || (isPhysical ? 'TBC' : 'No link added');
      const statusBadge  = sessionFilter === 'group'
        ? `<span class="sess-status group">👥 ${s.member_count} joined</span>`
        : `<span class="sess-status ${s.status}">${s.status}</span>`;
      const actions = sessionFilter === 'mine'
        ? `<div style="display:flex;gap:8px;margin-top:10px;">
             <button class="btn-connect primary" style="font-size:0.75rem;padding:5px 12px;" onclick="markSession(${s.id},'completed')">✓ Done</button>
             <button class="btn-connect ghost" style="font-size:0.75rem;padding:5px 12px;" onclick="markSession(${s.id},'missed')">✗ Missed</button>
           </div>`
        : `<button class="btn-connect primary" style="font-size:0.75rem;padding:5px 12px;margin-top:10px;" onclick="joinSession(${s.id})">Join session</button>`;
      return `
        <div class="session-card">
          <div class="session-date-block ${isPhysical ? 'physical' : ''}">
            <div class="sess-day">${day}</div>
            <div class="sess-mon">${mon}</div>
          </div>
          <div class="session-info">
            <div class="session-title">${s.title}</div>
            <div class="session-meta">
              ${s.course ? `<span>📖 ${s.course}</span>` : ''}
              <span>🕐 ${s.start_time} · ${durationLabel}</span>
              <span>${locIcon} ${locText}</span>
              ${s.is_group ? `<span>👥 ${s.member_count} member${s.member_count !== 1 ? 's' : ''}</span>` : ''}
              ${sessionFilter === 'mine' && s.creator_id !== currentUserId ? `<span style="color:var(--blue);">by ${s.creator_name}</span>` : ''}
            </div>
            ${actions}
          </div>
          ${statusBadge}
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="stat-sub">Could not load sessions. Is the server running?</div>';
  }
}

async function markSession(sessionId, status) {
  try {
    await fetch(`${API_BASE}/study-sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadSessions();
  } catch (e) { alert('Could not update session.'); }
}

async function joinSession(sessionId) {
  try {
    await fetch(`${API_BASE}/study-sessions/${sessionId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId })
    });
    loadSessions();
  } catch (e) { alert('Could not join session.'); }
}

// ─── STUDY ROOM ───
let activeTimer = 'pomodoro';
let pomoInterval = null, pomoRunning = false, pomoSeconds = 25*60, pomoTotalSeconds = 25*60, pomoIsBreak = false, pomoCycleCount = 0;
let cdInterval = null, cdRunning = false, cdSeconds = 0, cdTotalSeconds = 0, cdSet = false;
let swInterval = null, swRunning = false, swSeconds = 0, swLapCount = 0;

async function openStudyRoom(buddyId, buddyName) {
  currentRoomBuddyId   = buddyId;
  currentRoomBuddyName = buddyName;
  const initials = buddyName.split(' ').map(n => n[0]).join('');
  const color    = avatarColors[buddyId % avatarColors.length];
  document.getElementById('roomBuddyAvatar').textContent = initials;
  document.getElementById('roomBuddyAvatar').style.background = color;
  document.getElementById('roomTitle').textContent = `Study Room · ${buddyName}`;
  try {
    const res  = await fetch(`${API_BASE}/study-rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user1_id: currentUserId, user2_id: buddyId })
    });
    const room = await res.json();
    currentRoomId = room.id;
    if (room.topic) document.getElementById('roomTopic').value = room.topic;
    if (room.notes) document.getElementById('roomNotes').value = room.notes;
    updateWordCount();
  } catch (e) { console.error('Could not open study room:', e); }
  roomStartTime = Date.now();
  if (roomSessionInterval)   clearInterval(roomSessionInterval);
  if (notesAutoSaveInterval) clearInterval(notesAutoSaveInterval);
  roomSessionInterval   = setInterval(updateRoomSessionTime, 1000);
  notesAutoSaveInterval = setInterval(saveNotes, 10000);
  document.getElementById('roomNotes').addEventListener('input', updateWordCount);
  document.getElementById('roomTopic').addEventListener('change', saveNotes);
  showView('studyRoom');
}

function openRoomMessage() {
  if (currentRoomBuddyId && currentRoomBuddyName) {
    showView('messages');
    setTimeout(() => selectContact(currentRoomBuddyId, currentRoomBuddyName), 300);
  }
}

function openMessageWith(buddyId, buddyName) {
  showView('messages');
  setTimeout(() => selectContact(buddyId, buddyName), 300);
}

function updateRoomSessionTime() {
  if (!roomStartTime) return;
  const elapsed = Math.floor((Date.now() - roomStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const el = document.getElementById('roomSessionTime');
  if (el) el.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function updateWordCount() {
  const notes = document.getElementById('roomNotes');
  const el    = document.getElementById('roomNoteWords');
  if (!notes || !el) return;
  const words = notes.value.trim() ? notes.value.trim().split(/\s+/).length : 0;
  el.textContent = words;
}

async function saveNotes() {
  if (!currentRoomId) return;
  const notes    = document.getElementById('roomNotes')?.value || '';
  const topic    = document.getElementById('roomTopic')?.value || '';
  const statusEl = document.getElementById('notesSaveStatus');
  try {
    await fetch(`${API_BASE}/study-rooms/${currentRoomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, topic })
    });
    if (statusEl) { statusEl.textContent = 'Saved ✓'; setTimeout(() => { statusEl.textContent = 'Auto-saves every 10s'; }, 2000); }
  } catch(e) { if (statusEl) statusEl.textContent = 'Save failed'; }
}

function switchTimer(mode) {
  activeTimer = mode;
  ['pomodoro','countdown','stopwatch'].forEach(t => {
    document.getElementById('timer-' + t).style.display = t === mode ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === mode);
  });
}

// Pomodoro
function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function togglePomodoro() {
  if (pomoRunning) {
    clearInterval(pomoInterval); pomoRunning = false;
    document.getElementById('pomoPlayBtn').textContent = '▶';
  } else {
    pomoRunning = true;
    document.getElementById('pomoPlayBtn').textContent = '⏸';
    pomoInterval = setInterval(() => {
      pomoSeconds--;
      document.getElementById('pomoDisplay').textContent = formatTime(pomoSeconds);
      document.getElementById('pomoProgress').style.width = (pomoSeconds / pomoTotalSeconds * 100) + '%';
      if (pomoSeconds <= 0) {
        clearInterval(pomoInterval); pomoRunning = false;
        document.getElementById('pomoPlayBtn').textContent = '▶';
        if (!pomoIsBreak) {
          pomoCycleCount++;
          document.getElementById('roomPomoCycles').textContent = pomoCycleCount;
          updatePomoDots();
          pomoIsBreak = true; pomoSeconds = 5*60; pomoTotalSeconds = 5*60;
          document.getElementById('pomoLabel').textContent = '☕ Break time!';
          document.getElementById('pomoProgress').style.background = 'var(--green)';
        } else {
          pomoIsBreak = false; pomoSeconds = 25*60; pomoTotalSeconds = 25*60;
          document.getElementById('pomoLabel').textContent = 'Focus time';
          document.getElementById('pomoProgress').style.background = 'var(--blue)';
        }
        document.getElementById('pomoDisplay').textContent = formatTime(pomoSeconds);
        document.getElementById('pomoProgress').style.width = '100%';
      }
    }, 1000);
  }
}
function resetPomodoro() {
  clearInterval(pomoInterval); pomoRunning = false; pomoIsBreak = false;
  pomoSeconds = 25*60; pomoTotalSeconds = 25*60;
  document.getElementById('pomoDisplay').textContent = '25:00';
  document.getElementById('pomoLabel').textContent = 'Focus time';
  document.getElementById('pomoProgress').style.width = '100%';
  document.getElementById('pomoProgress').style.background = 'var(--blue)';
  document.getElementById('pomoPlayBtn').textContent = '▶';
}
function skipPomodoro() {
  clearInterval(pomoInterval); pomoRunning = false; pomoSeconds = 0;
  document.getElementById('pomoPlayBtn').textContent = '▶';
  togglePomodoro(); togglePomodoro();
}
function updatePomoDots() {
  document.querySelectorAll('.pomo-dot').forEach((d, i) => {
    d.classList.remove('done', 'break');
    if (i < pomoCycleCount % 4) d.classList.add('done');
  });
}

// Countdown
function toggleCountdown() {
  if (cdRunning) {
    clearInterval(cdInterval); cdRunning = false;
    document.getElementById('cdPlayBtn').textContent = '▶';
  } else {
    if (!cdSet) {
      const h = parseInt(document.getElementById('cdHours').value)   || 0;
      const m = parseInt(document.getElementById('cdMinutes').value)  || 0;
      const s = parseInt(document.getElementById('cdSeconds').value)  || 0;
      cdTotalSeconds = h*3600 + m*60 + s; cdSeconds = cdTotalSeconds; cdSet = true;
      document.getElementById('countdownSetup').style.opacity = '0.5';
    }
    if (cdSeconds <= 0) return;
    cdRunning = true;
    document.getElementById('cdPlayBtn').textContent = '⏸';
    document.getElementById('cdLabel').textContent   = 'Counting down...';
    cdInterval = setInterval(() => {
      cdSeconds--;
      const h = Math.floor(cdSeconds/3600).toString().padStart(2,'0');
      const m = Math.floor((cdSeconds%3600)/60).toString().padStart(2,'0');
      const s = (cdSeconds%60).toString().padStart(2,'0');
      document.getElementById('cdDisplay').textContent = `${h}:${m}:${s}`;
      document.getElementById('cdProgress').style.width = (cdTotalSeconds > 0 ? cdSeconds/cdTotalSeconds*100 : 0) + '%';
      if (cdSeconds <= 0) {
        clearInterval(cdInterval); cdRunning = false;
        document.getElementById('cdPlayBtn').textContent = '▶';
        document.getElementById('cdLabel').textContent   = "⏰ Time's up!";
        document.getElementById('cdDisplay').textContent = '00:00:00';
      }
    }, 1000);
  }
}
function resetCountdown() {
  clearInterval(cdInterval); cdRunning = false; cdSet = false; cdSeconds = 0;
  document.getElementById('cdDisplay').textContent = '00:25:00';
  document.getElementById('cdLabel').textContent   = 'Set time above and press play';
  document.getElementById('cdProgress').style.width = '100%';
  document.getElementById('cdPlayBtn').textContent  = '▶';
  document.getElementById('countdownSetup').style.opacity = '1';
  document.getElementById('cdHours').value   = 0;
  document.getElementById('cdMinutes').value = 25;
  document.getElementById('cdSeconds').value = 0;
}

// Stopwatch
function toggleStopwatch() {
  if (swRunning) {
    clearInterval(swInterval); swRunning = false;
    document.getElementById('swPlayBtn').textContent = '▶';
  } else {
    swRunning = true;
    document.getElementById('swPlayBtn').textContent = '⏸';
    swInterval = setInterval(() => {
      swSeconds++;
      const h = Math.floor(swSeconds/3600).toString().padStart(2,'0');
      const m = Math.floor((swSeconds%3600)/60).toString().padStart(2,'0');
      const s = (swSeconds%60).toString().padStart(2,'0');
      document.getElementById('swDisplay').textContent = `${h}:${m}:${s}`;
    }, 1000);
  }
}
function resetStopwatch() {
  clearInterval(swInterval); swRunning = false; swSeconds = 0; swLapCount = 0;
  document.getElementById('swDisplay').textContent = '00:00:00';
  document.getElementById('swPlayBtn').textContent = '▶';
  document.getElementById('swLaps').innerHTML = '';
}
function lapStopwatch() {
  if (!swRunning) return;
  swLapCount++;
  const h = Math.floor(swSeconds/3600).toString().padStart(2,'0');
  const m = Math.floor((swSeconds%3600)/60).toString().padStart(2,'0');
  const s = (swSeconds%60).toString().padStart(2,'0');
  document.getElementById('swLaps').insertAdjacentHTML('afterbegin', `
    <div style="display:flex;justify-content:space-between;padding:4px 8px;border-radius:6px;background:var(--bg);margin-bottom:4px;font-size:0.78rem;">
      <span style="color:var(--muted);font-weight:600;">Lap ${swLapCount}</span>
      <span style="font-weight:700;">${h}:${m}:${s}</span>
    </div>`);
}

// ─── MESSAGES ───
async function loadContacts() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/users/${currentUserId}/contacts`);
    const contacts = await res.json();
    const list = document.getElementById('contactList');
    if (!contacts.length) { list.innerHTML = '<div class="stat-sub">No other students registered yet.</div>'; return; }
    const colors = ['#3461d1','#7c3aed','#16a34a','#0891b2','#ea580c','#db2777'];
    list.innerHTML = contacts.map(c => {
      const initials = c.firstName.charAt(0) + c.lastName.charAt(0);
      const color    = colors[c.id % colors.length];
      return `
        <div class="request-item" style="cursor:pointer;padding:10px 8px;border-radius:8px;transition:background 0.15s;"
          id="contact-${c.id}"
          onmouseenter="this.style.background='var(--bg)'"
          onmouseleave="this.style.background=''"
          onclick="selectContact(${c.id}, '${c.firstName} ${c.lastName}')">
          <div class="req-avatar" style="background:${color};">${initials}</div>
          <div class="req-info">
            <div class="req-name">${c.firstName} ${c.lastName}</div>
            <div class="req-meta">${c.course || 'Student'}</div>
          </div>
        </div>`;
    }).join('');
    loadUnreadCount();
  } catch (e) {
    document.getElementById('contactList').innerHTML = '<div class="stat-sub">Could not load contacts.</div>';
  }
}

async function selectContact(contactId, contactName) {
  selectedContactId   = contactId;
  selectedContactName = contactName;
  document.getElementById('chatHeader').textContent = contactName;
  document.getElementById('chatInputArea').style.display = 'flex';
  document.querySelectorAll('#contactList .request-item').forEach(el => { el.style.background = ''; });
  const selected = document.getElementById(`contact-${contactId}`);
  if (selected) selected.style.background = 'var(--blue-light)';
  await loadThread();
}

async function loadThread() {
  if (!currentUserId || !selectedContactId) return;
  try {
    const res  = await fetch(`${API_BASE}/messages/${currentUserId}/${selectedContactId}`);
    const msgs = await res.json();
    const thread = document.getElementById('chatThread');
    if (!msgs.length) {
      thread.innerHTML = '<div class="stat-sub" style="text-align:center;margin-top:40px;">No messages yet. Say hello! 👋</div>';
      return;
    }
    thread.innerHTML = msgs.map(m => {
      const mine = m.sender_id === currentUserId;
      const time = new Date(m.sent_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div style="display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};">
          <div style="max-width:68%;padding:10px 14px;border-radius:${mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${mine ? 'var(--blue)' : 'var(--bg)'};color:${mine ? '#fff' : 'var(--text)'};font-size:0.85rem;line-height:1.5;">${m.body}</div>
          <div style="font-size:0.68rem;color:var(--muted);margin-top:3px;padding:0 4px;">${time}</div>
        </div>`;
    }).join('');
    thread.scrollTop = thread.scrollHeight;
    loadUnreadCount();
  } catch (e) {
    document.getElementById('chatThread').innerHTML = '<div class="stat-sub">Could not load messages.</div>';
  }
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const body  = input.value.trim();
  if (!body || !selectedContactId) return;
  input.value = '';
  try {
    await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: currentUserId, receiver_id: selectedContactId, body })
    });
    loadThread();
  } catch (e) { alert('Could not send message. Is the server running?'); }
}

async function loadUnreadCount() {
  if (!currentUserId) return;
  try {
    const res  = await fetch(`${API_BASE}/messages/${currentUserId}/unread`);
    const data = await res.json();
    const badge = document.getElementById('msgBadge');
    if (badge) { badge.style.display = data.count > 0 ? '' : 'none'; badge.textContent = data.count; }
  } catch (e) { /* silent */ }
}

// ─── LOGOUT ───
function handleLogout() {
  localStorage.clear();
  window.location.href = 'Signin.html';
}