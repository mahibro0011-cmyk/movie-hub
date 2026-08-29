const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const initData = tg.initData || '';
const tgUser = tg.initDataUnsafe?.user || {};

// ---------------- Helpers ----------------
async function api(path, { method = 'GET', body, isAdmin = false } = {}) {
  let url = path;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };

  if (method === 'GET') {
    const sep = path.includes('?') ? '&' : '?';
    url += `${sep}initData=${encodeURIComponent(initData)}`;
  } else {
    opts.body = JSON.stringify({ ...body, initData });
  }

  const res = await fetch(url, opts);
  return res.json();
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ---------------- Tab navigation ----------------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.overlay-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById(`tab-${name}`)?.classList.add('active');

  if (name === 'earn') loadProfile();
  if (name === 'task') loadTasks();
  if (name === 'refer') loadReferral();
  if (name === 'profile') loadProfile();
}

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.overlay-panel').forEach(p => p.classList.remove('active'));
    showTab(btn.dataset.back);
  });
});

document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.overlay-panel').forEach(p => p.classList.remove('active'));
    showTab(el.dataset.goto);
  });
});

// ---------------- Watch tab: category tabs + video grid ----------------
let currentCategory = 'all';

async function loadCategoryTabs() {
  const bar = document.getElementById('category-tabs');
  const data = await api('/api/content?type=categories');
  if (!data.ok) return;

  // Keep the existing "All" tab, append the rest.
  bar.innerHTML = '<button class="category-tab active" data-category="all">All</button>' +
    data.categories.map(c => `<button class="category-tab" data-category="${c.id}">${c.name}</button>`).join('');

  bar.querySelectorAll('.category-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      loadVideos();
    });
  });
}

async function loadVideos() {
  const grid = document.getElementById('video-grid');
  const data = await api(`/api/content?type=videos&category=${encodeURIComponent(currentCategory)}`);
  if (!data.ok || !data.videos.length) {
    grid.innerHTML = '<div class="empty-state">এখনো কোনো ভিডিও নেই।</div>';
    return;
  }
  grid.innerHTML = data.videos.map(v => `
    <div class="video-card" data-id="${v.id}">
      <img src="${v.thumbnail}" alt="${v.title}">
      <div class="video-card-title">${v.title}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => openVideoDetail(card.dataset.id));
  });
}

let currentVideoId = null;

async function openVideoDetail(id) {
  currentVideoId = id;
  const data = await api(`/api/content?type=video_detail&id=${id}`);
  if (!data.ok) return;

  document.getElementById('detail-thumb').src = data.video.thumbnail;
  document.getElementById('detail-title').textContent = data.video.title;
  document.getElementById('detail-cost').textContent = data.video.unlockCost;
  document.getElementById('detail-status').textContent = '';

  const insufficientMsg = document.getElementById('insufficient-msg');
  const unlockBtn = document.getElementById('unlock-btn');

  if (data.alreadyUnlocked) {
    unlockBtn.textContent = 'ইতিমধ্যে Unlocked ✓ — আবার পাঠাতে ট্যাপ করুন';
    insufficientMsg.style.display = 'none';
  } else if (data.userBalance < data.video.unlockCost) {
    insufficientMsg.style.display = 'block';
    unlockBtn.textContent = 'Unlock করুন';
  } else {
    insufficientMsg.style.display = 'none';
    unlockBtn.textContent = 'Unlock করুন';
  }

  document.getElementById('panel-video-detail').classList.add('active');
}

document.getElementById('unlock-btn').addEventListener('click', async () => {
  const btn = document.getElementById('unlock-btn');
  const status = document.getElementById('detail-status');
  btn.disabled = true;
  status.textContent = 'অপেক্ষা করুন...';

  const data = await api('/api/user?action=unlock', { method: 'POST', body: { videoId: currentVideoId } });

  if (data.ok) {
    status.textContent = 'ভিডিও আপনার ইনবক্সে পাঠানো হয়েছে! Bot চ্যাট চেক করুন।';
    tg.HapticFeedback?.notificationOccurred('success');
  } else if (data.error === 'insufficient_balance') {
    status.textContent = `Insufficient balance. প্রয়োজন ${data.required} DHC, আছে ${data.balance} DHC।`;
    document.getElementById('insufficient-msg').style.display = 'block';
  } else {
    status.textContent = 'কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।';
  }
  btn.disabled = false;
});

// ---------------- Earn tab ----------------
let cooldownTimer = null;

async function loadProfile() {
  const data = await api('/api/user?action=profile');
  if (!data.ok) return;
  const u = data.user;

  // Watch tab chip
  document.getElementById('watch-username').textContent = u.firstName || 'User';
  if (u.photoUrl) document.getElementById('watch-avatar').src = u.photoUrl;

  // Earn tab
  document.getElementById('progress-count').textContent = `${u.adViewsToday} / ${u.dailyAdLimit}`;
  document.getElementById('progress-fill').style.width = `${Math.min(100, (u.adViewsToday / u.dailyAdLimit) * 100)}%`;
  document.getElementById('daily-limit-value').textContent = u.dailyAdLimit;
  document.getElementById('completed-value').textContent = u.adViewsToday;
  document.getElementById('overview-balance').textContent = fmt(u.balance) + ' DHC';
  document.getElementById('overview-ads').textContent = u.totalAdsWatched;

  const watchBtn = document.getElementById('watch-ad-btn');
  watchBtn.disabled = u.adViewsToday >= u.dailyAdLimit;
  if (watchBtn.disabled) document.getElementById('ad-status').textContent = 'আজকের daily limit শেষ। কাল আবার আসুন।';

  // Profile tab
  document.getElementById('profile-name').textContent = u.firstName || 'User';
  document.getElementById('profile-handle').textContent = tgUser.username ? `@${tgUser.username}` : '';
  if (u.photoUrl) document.getElementById('profile-avatar').src = u.photoUrl;
  document.getElementById('profile-balance').textContent = fmt(u.balance);
  document.getElementById('profile-referrals').textContent = u.referralCount;

  // Withdraw panel needs the live balance + minimum each time it's opened
  currentBalance = u.balance;
  currentMinWithdraw = u.minWithdraw;
}

document.getElementById('watch-ad-btn').addEventListener('click', async () => {
  const btn = document.getElementById('watch-ad-btn');
  const status = document.getElementById('ad-status');

  // NOTE: This is where a real rewarded-ad SDK call goes (e.g. Adsgram / Monetag).
  // For now this simulates the ad being watched, per current build stage.
  btn.disabled = true;
  status.textContent = 'বিজ্ঞাপন দেখানো হচ্ছে...';

  await new Promise(r => setTimeout(r, 1500)); // placeholder ad-watch delay

  const data = await api('/api/user?action=watch_ad', { method: 'POST' });

  if (data.ok) {
    status.textContent = data.pointsEarned > 0
      ? `+${data.pointsEarned} DHC পেয়েছেন!`
      : 'বিজ্ঞাপন গণনা হয়েছে। আরেকটা দেখলে DHC পাবেন।';
    loadProfile();
    startAdCooldown(20);
  } else if (data.error === 'cooldown') {
    startAdCooldown(data.waitSeconds);
  } else if (data.error === 'daily_limit_reached') {
    status.textContent = 'আজকের daily limit শেষ।';
    btn.disabled = true;
  } else {
    status.textContent = 'সমস্যা হয়েছে, আবার চেষ্টা করুন।';
    btn.disabled = false;
  }
});

function startAdCooldown(seconds) {
  const btn = document.getElementById('watch-ad-btn');
  const status = document.getElementById('ad-status');
  btn.disabled = true;
  let remaining = seconds;
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    status.textContent = `আবার দেখতে ${remaining}s অপেক্ষা করুন...`;
    remaining -= 1;
    if (remaining < 0) {
      clearInterval(cooldownTimer);
      status.textContent = '';
      btn.disabled = false;
    }
  }, 1000);
}

// ---------------- Task tab ----------------
async function loadTasks() {
  const list = document.getElementById('task-list');
  const data = await api('/api/content?type=tasks');
  if (!data.ok || !data.tasks.length) {
    list.innerHTML = '<div class="empty-state">এখনো কোনো টাস্ক নেই।</div>';
    return;
  }
  list.innerHTML = data.tasks.map(t => `
    <div class="task-card">
      <div class="task-title">${t.title}</div>
      <div class="task-reward">Reward: ${t.reward} DHC</div>
      <div class="task-btn-row">
        <button class="task-btn join" onclick="window.open('${t.link}', '_blank')">Join</button>
        <button class="task-btn verify ${t.completed ? 'done' : ''}" data-id="${t.id}" ${t.completed ? 'disabled' : ''}>
          ${t.completed ? 'Verified ✓' : 'Verify'}
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.task-btn.verify:not(.done)').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.textContent = '...';
      const data = await api('/api/content?type=verify_task', { method: 'POST', body: { taskId: btn.dataset.id } });
      if (data.ok) {
        btn.textContent = 'Verified ✓';
        btn.classList.add('done');
        btn.disabled = true;
      } else if (data.error === 'not_joined') {
        btn.textContent = 'Verify';
        tg.showAlert?.('আগে চ্যানেলে জয়েন করুন, তারপর Verify করুন।');
      } else {
        btn.textContent = 'Verify';
      }
    });
  });
}

// ---------------- Refer tab ----------------
async function loadReferral() {
  const data = await api('/api/content?type=referral');
  if (!data.ok) return;
  document.getElementById('refer-count').textContent = data.totalReferrals;
  document.getElementById('refer-rate').textContent = `${data.bonusRatePct}%`;
  document.getElementById('how-bonus-pct').textContent = `${data.bonusRatePct}%`;
  document.getElementById('refer-link-input').value = data.referralLink;

  document.getElementById('refer-copy-btn').onclick = () => {
    navigator.clipboard?.writeText(data.referralLink);
    tg.HapticFeedback?.notificationOccurred('success');
  };
  document.getElementById('refer-share-btn').onclick = () => {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(data.referralLink)}`);
  };
}

// ---------------- Profile: unlocked history ----------------
document.getElementById('unlocked-history-btn').addEventListener('click', async () => {
  const box = document.getElementById('unlocked-history-list');
  const data = await api('/api/user?action=unlocked_history');
  if (!data.ok) return;
  document.getElementById('unlocked-count-inline').textContent = data.count;
  document.getElementById('profile-unlocked').textContent = data.count;

  box.innerHTML = data.videos.length
    ? data.videos.map(v => `<div class="unlocked-history-item"><span>${v.title}</span><span>${new Date(v.unlockedAt).toLocaleDateString()}</span></div>`).join('')
    : '<div class="empty-state">এখনো কোনো ভিডিও unlock করা হয়নি।</div>';
});

// ---------------- Profile: withdraw ----------------
let currentBalance = 0;
let currentMinWithdraw = 500;

document.getElementById('withdraw-btn').addEventListener('click', () => {
  document.getElementById('withdraw-balance').textContent = fmt(currentBalance);
  document.getElementById('withdraw-min').textContent = currentMinWithdraw;
  document.getElementById('withdraw-amount').value = '';
  document.getElementById('withdraw-account').value = '';
  document.getElementById('withdraw-status').textContent = '';
  document.getElementById('panel-withdraw').classList.add('active');
});

document.getElementById('withdraw-submit-btn').addEventListener('click', async () => {
  const btn = document.getElementById('withdraw-submit-btn');
  const status = document.getElementById('withdraw-status');
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  const method = document.getElementById('withdraw-method').value;
  const accountNumber = document.getElementById('withdraw-account').value.trim();

  if (!amount || amount < currentMinWithdraw) {
    status.textContent = `সর্বনিম্ন ${currentMinWithdraw} DHC withdraw করা যাবে।`;
    return;
  }
  if (amount > currentBalance) {
    status.textContent = 'আপনার balance যথেষ্ট নয়।';
    return;
  }
  if (!accountNumber) {
    status.textContent = 'Account number দিন।';
    return;
  }

  btn.disabled = true;
  status.textContent = 'পাঠানো হচ্ছে...';

  const data = await api('/api/user?action=withdraw_request', {
    method: 'POST',
    body: { amount, method, accountNumber }
  });

  btn.disabled = false;

  if (data.ok) {
    status.textContent = 'Withdraw request পাঠানো হয়েছে! Admin approve করলে টাকা পাবেন।';
    tg.HapticFeedback?.notificationOccurred('success');
    loadProfile();
  } else if (data.error === 'below_minimum') {
    status.textContent = `সর্বনিম্ন ${data.minimum} DHC withdraw করা যাবে।`;
  } else if (data.error === 'insufficient_balance') {
    status.textContent = 'আপনার balance যথেষ্ট নয়।';
  } else {
    status.textContent = 'সমস্যা হয়েছে, আবার চেষ্টা করুন।';
  }
});

const withdrawStatusLabel = { pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected' };

document.getElementById('withdraw-history-btn').addEventListener('click', async () => {
  const box = document.getElementById('withdraw-history-list');
  box.innerHTML = '<div class="empty-state">লোড হচ্ছে...</div>';
  document.getElementById('panel-withdraw-history').classList.add('active');

  const data = await api('/api/user?action=withdraw_history');
  if (!data.ok) return;

  box.innerHTML = data.withdrawals.length
    ? data.withdrawals.map(w => `
        <div class="unlocked-history-item withdraw-history-item status-${w.status}">
          <span>${fmt(w.amount)} DHC — ${w.method === 'bkash' ? 'Bkash' : 'Nagad'}</span>
          <span class="status-badge status-${w.status}">${withdrawStatusLabel[w.status] || w.status}</span>
        </div>
      `).join('')
    : '<div class="empty-state">এখনো কোনো withdraw request নেই।</div>';
});

// ---------------- Init ----------------
// Deep link support: an admin-sent button can point to ?video=<id> which
// opens that video's detail page directly instead of the home grid.
const deepLinkVideoId = new URLSearchParams(window.location.search).get('video');

loadCategoryTabs();
loadVideos();
loadProfile();
if (deepLinkVideoId) {
  openVideoDetail(deepLinkVideoId);
}
