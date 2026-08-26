const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || '';

async function adminApi(path, { method = 'GET', body } = {}) {
  let url = path;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };

  if (method === 'GET' || method === 'DELETE') {
    const sep = path.includes('?') ? '&' : '?';
    url += `${sep}initData=${encodeURIComponent(initData)}`;
  } else {
    opts.body = JSON.stringify({ ...body, initData });
  }

  const res = await fetch(url, opts);
  return { status: res.status, data: await res.json() };
}

// ---------------- Access check (Telegram-account based, no password) ----------------
async function checkAccess() {
  if (!initData) {
    // Not opened inside Telegram at all (e.g. plain browser tab) -> deny.
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('denied-screen').style.display = 'block';
    return;
  }

  const { status, data } = await adminApi('/api/admin/stats?view=overview');
  document.getElementById('loading-screen').style.display = 'none';

  if (status === 200 && data.ok) {
    document.getElementById('admin-app').style.display = 'block';
    const user = tg.initDataUnsafe?.user;
    if (user) {
      document.getElementById('admin-name-badge').textContent =
        `${user.first_name || ''}${user.username ? ' (@' + user.username + ')' : ''}`;
    }
    loadOverview();
  } else {
    document.getElementById('denied-screen').style.display = 'block';
  }
}

checkAccess();

// ---------------- Tabs ----------------
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
    if (btn.dataset.panel === 'overview') loadOverview();
    if (btn.dataset.panel === 'videos') loadVideosTable();
    if (btn.dataset.panel === 'tasks') loadTasksTable();
    if (btn.dataset.panel === 'users') loadUsersTable();
  });
});

// ---------------- Overview ----------------
async function loadOverview() {
  const { data } = await adminApi('/api/admin/stats?view=overview');
  if (!data.ok) return;
  const s = data.stats;
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-tile"><div class="num">${s.totalUsers}</div><div class="lbl">Total Users</div></div>
    <div class="stat-tile"><div class="num">${s.totalVideos}</div><div class="lbl">Videos</div></div>
    <div class="stat-tile"><div class="num">${s.activeTasks}</div><div class="lbl">Active Tasks</div></div>
    <div class="stat-tile"><div class="num">${s.totalUnlocks}</div><div class="lbl">Total Unlocks</div></div>
    <div class="stat-tile"><div class="num">${s.totalAdsWatched}</div><div class="lbl">Ads Watched</div></div>
    <div class="stat-tile"><div class="num">${Number(s.totalDhcInCirculation).toFixed(1)}</div><div class="lbl">DHC in Circulation</div></div>
  `;
}

// ---------------- Videos ----------------
document.getElementById('video-publish-btn').addEventListener('click', async () => {
  const code = document.getElementById('video-code').value.trim();
  const title = document.getElementById('video-title').value.trim();
  const thumbnail = document.getElementById('video-thumb').value.trim();
  const msg = document.getElementById('video-msg');

  if (!code || !title || !thumbnail) {
    msg.textContent = 'সব ঘর পূরণ করুন।'; msg.className = 'msg error'; return;
  }

  const { data } = await adminApi('/api/admin/manage?entity=video', { method: 'POST', body: { code, title, thumbnail } });
  if (data.ok) {
    msg.textContent = 'Video published!'; msg.className = 'msg ok';
    document.getElementById('video-code').value = '';
    document.getElementById('video-title').value = '';
    document.getElementById('video-thumb').value = '';
    loadVideosTable();
  } else {
    msg.textContent = data.error === 'invalid_or_used_code' ? 'কোডটি ভুল অথবা আগেই ব্যবহার হয়ে গেছে।' : 'কিছু একটা সমস্যা হয়েছে।';
    msg.className = 'msg error';
  }
});

async function loadVideosTable() {
  const { data } = await adminApi('/api/admin/manage?entity=video');
  const tbody = document.querySelector('#videos-table tbody');
  if (!data.ok || !data.videos.length) {
    tbody.innerHTML = '<tr><td colspan="3">কোনো ভিডিও নেই</td></tr>';
    return;
  }
  tbody.innerHTML = data.videos.map(v => `
    <tr>
      <td>${v.title}</td>
      <td>${v.unlockCount || 0}</td>
      <td><button class="btn-sm delete" onclick="deleteVideo('${v._id}')">Delete</button></td>
    </tr>
  `).join('');
}

async function deleteVideo(id) {
  if (!confirm('Delete this video?')) return;
  await adminApi(`/api/admin/manage?entity=video&id=${id}`, { method: 'DELETE' });
  loadVideosTable();
}

// ---------------- Tasks ----------------
document.getElementById('task-type').addEventListener('change', (e) => {
  document.getElementById('task-channel-field').style.display = e.target.value === 'verified' ? 'block' : 'none';
});

document.getElementById('task-add-btn').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  const taskType = document.getElementById('task-type').value;
  const link = document.getElementById('task-link').value.trim();
  const channelId = document.getElementById('task-channel-id').value.trim();
  const reward = document.getElementById('task-reward').value;
  const msg = document.getElementById('task-msg');

  if (!title || !link || !reward) {
    msg.textContent = 'সব ঘর পূরণ করুন।'; msg.className = 'msg error'; return;
  }

  const { data } = await adminApi('/api/admin/manage?entity=task', {
    method: 'POST',
    body: { title, taskType, link, channelId: channelId || undefined, reward }
  });

  if (data.ok) {
    msg.textContent = 'Task added!'; msg.className = 'msg ok';
    document.getElementById('task-title').value = '';
    document.getElementById('task-link').value = '';
    document.getElementById('task-channel-id').value = '';
    document.getElementById('task-reward').value = '';
    loadTasksTable();
  } else {
    msg.textContent = 'কিছু একটা সমস্যা হয়েছে।'; msg.className = 'msg error';
  }
});

async function loadTasksTable() {
  const { data } = await adminApi('/api/admin/manage?entity=task');
  const tbody = document.querySelector('#tasks-table tbody');
  const active = (data.tasks || []).filter(t => t.active);
  if (!data.ok || !active.length) {
    tbody.innerHTML = '<tr><td colspan="4">কোনো টাস্ক নেই</td></tr>';
    return;
  }
  tbody.innerHTML = active.map(t => `
    <tr>
      <td>${t.title}</td>
      <td>${t.taskType}</td>
      <td>${t.reward} DHC</td>
      <td><button class="btn-sm delete" onclick="deleteTask('${t._id}')">Remove</button></td>
    </tr>
  `).join('');
}

async function deleteTask(id) {
  if (!confirm('Remove this task?')) return;
  await adminApi(`/api/admin/manage?entity=task&id=${id}`, { method: 'DELETE' });
  loadTasksTable();
}

// ---------------- Users ----------------
let userSearchDebounce;
document.getElementById('user-search').addEventListener('input', (e) => {
  clearTimeout(userSearchDebounce);
  userSearchDebounce = setTimeout(() => loadUsersTable(e.target.value), 300);
});

async function loadUsersTable(search = '') {
  const { data } = await adminApi(`/api/admin/stats?view=users${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  const tbody = document.querySelector('#users-table tbody');
  if (!data.ok || !data.users.length) {
    tbody.innerHTML = '<tr><td colspan="4">কোনো ইউজার নেই</td></tr>';
    return;
  }
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td>${u.firstName || '—'} ${u.username ? `(@${u.username})` : ''}</td>
      <td>${Number(u.balance || 0).toFixed(2)} DHC</td>
      <td>${u.referralCount || 0}</td>
      <td>${u.totalAdsWatched || 0}</td>
    </tr>
  `).join('');
}
