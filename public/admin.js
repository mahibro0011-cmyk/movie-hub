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
    if (btn.dataset.panel === 'videos') { loadVideosTable(); loadVideoCategoryCheckboxes(); }
    if (btn.dataset.panel === 'categories') loadCategoriesTable();
    if (btn.dataset.panel === 'tasks') loadTasksTable();
    if (btn.dataset.panel === 'users') loadUsersTable();
    if (btn.dataset.panel === 'withdrawals') loadWithdrawalsTable();
    if (btn.dataset.panel === 'message') loadMessageVideoOptions();
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
async function loadVideoCategoryCheckboxes() {
  const box = document.getElementById('video-category-checkboxes');
  const { data } = await adminApi('/api/admin/manage?entity=category');
  if (!data.ok || !data.categories.length) {
    box.innerHTML = '<span style="font-size:12px; color:var(--muted);">কোনো Section নেই — আগে Categories ট্যাব থেকে একটা বানান।</span>';
    return;
  }
  box.innerHTML = data.categories.map(c => `
    <label><input type="checkbox" class="video-cat-checkbox" value="${c._id}"> ${c.name}</label>
  `).join('');
}

document.getElementById('video-publish-btn').addEventListener('click', async () => {
  const code = document.getElementById('video-code').value.trim();
  const title = document.getElementById('video-title').value.trim();
  const thumbnail = document.getElementById('video-thumb').value.trim();
  const categoryIds = [...document.querySelectorAll('.video-cat-checkbox:checked')].map(cb => cb.value);
  const includeInAll = document.getElementById('video-include-all').checked;
  const msg = document.getElementById('video-msg');

  if (!code || !title || !thumbnail) {
    msg.textContent = 'সব ঘর পূরণ করুন।'; msg.className = 'msg error'; return;
  }

  const { data } = await adminApi('/api/admin/manage?entity=video', {
    method: 'POST',
    body: { code, title, thumbnail, categoryIds, includeInAll }
  });
  if (data.ok) {
    msg.textContent = 'Video published!'; msg.className = 'msg ok';
    document.getElementById('video-code').value = '';
    document.getElementById('video-title').value = '';
    document.getElementById('video-thumb').value = '';
    document.querySelectorAll('.video-cat-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('video-include-all').checked = true;
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

// ---------------- Categories (sections like "Bangla Movies") ----------------
document.getElementById('category-add-btn').addEventListener('click', async () => {
  const name = document.getElementById('category-name').value.trim();
  const msg = document.getElementById('category-msg');
  if (!name) { msg.textContent = 'নাম দিন।'; msg.className = 'msg error'; return; }

  const { data } = await adminApi('/api/admin/manage?entity=category', { method: 'POST', body: { name } });
  if (data.ok) {
    msg.textContent = 'Section যোগ হয়েছে!'; msg.className = 'msg ok';
    document.getElementById('category-name').value = '';
    loadCategoriesTable();
  } else if (data.error === 'duplicate_name') {
    msg.textContent = 'এই নামে একটা section আগে থেকেই আছে।'; msg.className = 'msg error';
  } else {
    msg.textContent = 'কিছু একটা সমস্যা হয়েছে।'; msg.className = 'msg error';
  }
});

async function loadCategoriesTable() {
  const { data } = await adminApi('/api/admin/manage?entity=category');
  const tbody = document.querySelector('#categories-table tbody');
  if (!data.ok || !data.categories.length) {
    tbody.innerHTML = '<tr><td colspan="2">কোনো section নেই</td></tr>';
    return;
  }
  tbody.innerHTML = data.categories.map(c => `
    <tr>
      <td>${c.name}</td>
      <td><button class="btn-sm delete" onclick="deleteCategory('${c._id}')">Delete</button></td>
    </tr>
  `).join('');
}

async function deleteCategory(id) {
  if (!confirm('এই section delete করলে সব ভিডিও থেকেও এটা বাদ যাবে। নিশ্চিত?')) return;
  await adminApi(`/api/admin/manage?entity=category&id=${id}`, { method: 'DELETE' });
  loadCategoriesTable();
}

// ---------------- Withdrawals ----------------
document.getElementById('withdrawal-filter').addEventListener('change', () => loadWithdrawalsTable());

async function loadWithdrawalsTable() {
  const status = document.getElementById('withdrawal-filter').value;
  const { data } = await adminApi(`/api/admin/manage?entity=withdrawal${status ? `&status=${status}` : ''}`);
  const tbody = document.querySelector('#withdrawals-table tbody');
  if (!data.ok || !data.withdrawals.length) {
    tbody.innerHTML = '<tr><td colspan="6">কোনো request নেই</td></tr>';
    return;
  }
  tbody.innerHTML = data.withdrawals.map(w => `
    <tr>
      <td>${w.userName}</td>
      <td>${Number(w.amount).toFixed(2)} DHC</td>
      <td>${w.method === 'bkash' ? 'Bkash' : 'Nagad'}</td>
      <td>${w.accountNumber}</td>
      <td><span class="status-pill ${w.status}">${w.status}</span></td>
      <td>
        ${w.status === 'pending' ? `
          <button class="btn-sm approve" onclick="decideWithdrawal('${w.id}','approve')">Approve</button>
          <button class="btn-sm delete" onclick="decideWithdrawal('${w.id}','reject')">Reject</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

async function decideWithdrawal(id, action) {
  if (!confirm(action === 'approve' ? 'এই request approve করবেন?' : 'এই request reject করবেন? (balance ফেরত যাবে)')) return;
  const { data } = await adminApi('/api/admin/manage?entity=withdrawal', { method: 'POST', body: { id, action } });
  if (!data.ok) { alert('কিছু একটা সমস্যা হয়েছে।'); return; }
  loadWithdrawalsTable();
}

// ---------------- Message (send to one user, or broadcast to all) ----------------
async function loadMessageVideoOptions() {
  const select = document.getElementById('msg-video-select');
  const { data } = await adminApi('/api/admin/manage?entity=video');
  const currentValue = select.value;
  select.innerHTML = '<option value="">— Home page (default) —</option>';
  if (data.ok) {
    data.videos.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v._id;
      opt.textContent = v.title;
      select.appendChild(opt);
    });
  }
  select.value = currentValue; // keep selection if this is a refresh
}

document.getElementById('msg-send-btn').addEventListener('click', async () => {
  const targetId = document.getElementById('msg-target').value.trim();
  const text = document.getElementById('msg-text').value.trim();
  const imageUrl = document.getElementById('msg-image').value.trim();
  const videoId = document.getElementById('msg-video-select').value;
  const buttonText = document.getElementById('msg-btn-text').value.trim();
  const msg = document.getElementById('msg-status');

  if (!buttonText || (!text && !imageUrl)) {
    msg.textContent = 'Button text আর অন্তত text অথবা image URL — এইগুলো লাগবে।';
    msg.className = 'msg error';
    return;
  }

  if (!targetId) {
    const confirmed = confirm('Target ID খালি — এটা সব user-কে পাঠানো হবে। নিশ্চিত?');
    if (!confirmed) return;
  }

  const btn = document.getElementById('msg-send-btn');
  btn.disabled = true;
  msg.textContent = 'পাঠানো হচ্ছে...';
  msg.className = 'msg';

  const { data } = await adminApi('/api/admin/manage?entity=message', {
    method: 'POST',
    body: {
      targetId: targetId || undefined,
      text: text || undefined,
      imageUrl: imageUrl || undefined,
      videoId: videoId || undefined,
      buttonText
    }
  });

  btn.disabled = false;

  if (data.ok && data.broadcast) {
    msg.textContent = `Broadcast পাঠানো হয়েছে — ${data.sent}/${data.totalUsers} জন পেয়েছেন${data.failed ? ` (${data.failed} জনের কাছে পৌঁছায়নি)` : ''}।`;
    msg.className = 'msg ok';
  } else if (data.ok) {
    msg.textContent = 'Message পাঠানো হয়েছে!';
    msg.className = 'msg ok';
  } else if (data.error === 'user_not_found') {
    msg.textContent = 'এই Telegram ID-র কোনো user পাওয়া যায়নি (আগে bot-এ /start করতে হবে)।';
    msg.className = 'msg error';
  } else if (data.error === 'video_not_found' || data.error === 'invalid_video_id') {
    msg.textContent = 'Selected video পাওয়া যায়নি।';
    msg.className = 'msg error';
  } else {
    msg.textContent = 'পাঠাতে ব্যর্থ হয়েছে — হয়তো user bot-কে ব্লক করে রেখেছে, অথবা image URL ভুল।';
    msg.className = 'msg error';
  }

  if (data.ok) {
    document.getElementById('msg-target').value = '';
    document.getElementById('msg-text').value = '';
    document.getElementById('msg-image').value = '';
    document.getElementById('msg-btn-text').value = '';
    document.getElementById('msg-video-select').value = '';
  }
});

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
      <td id="balance-${u.telegramId}">${Number(u.balance || 0).toFixed(2)} DHC</td>
      <td>${u.referralCount || 0}</td>
      <td>${u.totalAdsWatched || 0}</td>
      <td>
        <button class="btn-sm plus" onclick="adjustBalance('${u.telegramId}', 1)">+ Add</button>
        <button class="btn-sm minus" onclick="adjustBalance('${u.telegramId}', -1)">− Deduct</button>
      </td>
    </tr>
  `).join('');
}

// Increase (sign=1) or decrease (sign=-1) a user's balance by an admin-entered amount.
async function adjustBalance(telegramId, sign) {
  const raw = prompt(sign > 0 ? 'কত DHC যোগ করবেন?' : 'কত DHC কমাবেন?');
  if (raw === null) return;
  const amount = parseFloat(raw);
  if (!amount || amount <= 0) { alert('একটা সঠিক সংখ্যা দিন।'); return; }

  const { data } = await adminApi('/api/admin/manage?entity=user', {
    method: 'POST',
    body: { telegramId, delta: sign * amount }
  });

  if (!data.ok) {
    alert(data.error === 'user_not_found' ? 'User পাওয়া যায়নি।' : 'কিছু একটা সমস্যা হয়েছে।');
    return;
  }

  const cell = document.getElementById(`balance-${telegramId}`);
  if (cell) cell.textContent = `${Number(data.newBalance).toFixed(2)} DHC`;
}
