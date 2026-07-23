
const CONFIG = {
  // URL Web App sau khi deploy Code.gs (Deploy > New deployment > Web app)
  API_URL: 'https://script.google.com/macros/s/AKfycbxx5ZMAQBrgRmZpG5lQUjmg4i4YDL2_ibcUT6nbHxLTM-Oqm_Us1tRflTKoaoMA9sL2/exec',

  // Client ID từ Google Cloud Console > OAuth consent > Credentials
  // (Tạo "OAuth client ID" loại "Web application")
  GOOGLE_CLIENT_ID: '799700157308-dtro1fab593ui6tr9q48jvbaid3g7m7d.apps.googleusercontent.com',

  // ⚠️ Khóa AIzaSy... bạn gửi trong chat đã lộ công khai — hãy REGENERATE key mới
  // trong Google Cloud Console rồi dán key MỚI vào đây trước khi dùng thật.
  // Dùng cho tính năng OCR (AI đọc ảnh phiếu xuất) qua Gemini API.
  GEMINI_API_KEY: 'AIzaSyDUfmSJMUWq9RGiufzRXDcUekHqDhLtUP8',
  GEMINI_MODEL: 'gemini-2.0-flash',
  CONFIRM_PASSWORD: 'changepassword123'
};


const LOCAL_USER_KEY = 'dientrack_vtd_user';

/* ---------------- STATE ---------------- */
const state = {
  user: null,
  projects: [],
  currentProject: null,
  screenStack: ['dashboard'],
  pdPage: 1,
  pdPageSize: 20,
  pdTotal: 0,
  pendingTxnType: null,
  editingTxnId: null,
  pendingPhotoBase64: null,
  pendingPhotoMime: null,
  activeTxnForAction: null,
  pendingPasswordAction: null // callback chạy sau khi nhập đúng mật khẩu
};

/* ---------------- DEMO MODE (khi chưa cấu hình API_URL) ---------------- */
const DEMO_MODE = CONFIG.API_URL.indexOf('DÁN_URL') === 0;
const demoStore = {
  projects: [
    { ProjectID: 'PRJ_demo1', ProjectName: 'Nhà anh Tuấn - Q7', Customer: 'Anh Tuấn', Address: '12 Nguyễn Lương Bằng, Q7', Status: 'Đang thi công', CreatedDate: new Date(), CreatedBy: 'demo@vtdsmarthome.vn' },
    { ProjectID: 'PRJ_demo2', ProjectName: 'Villa Thảo Điền', Customer: 'Chị Hoa', Address: '45 Quốc Hương, TP.Thủ Đức', Status: 'Đang thi công', CreatedDate: new Date(), CreatedBy: 'demo@vtdsmarthome.vn' }
  ],
  transactions: [
    { TransactionID: 'TXN_demo1', ProjectID: 'PRJ_demo1', Type: 'Xuất', DateTime: new Date(), ItemName: 'Dây điện CADIVI 2.5mm', ItemCode: 'DC-2.5', Quantity: 50, Note: 'Xuất cho tầng 2', ImageURL: '', CreatedBy: 'demo@vtdsmarthome.vn', CreatedTime: new Date() },
    { TransactionID: 'TXN_demo2', ProjectID: 'PRJ_demo1', Type: 'ThuHoi', DateTime: new Date(Date.now() - 86400000), ItemName: 'Ổ cắm âm tường Panasonic', ItemCode: 'OC-PN01', Quantity: 4, Note: 'Thu hồi do đổi màu', ImageURL: '', CreatedBy: 'demo@vtdsmarthome.vn', CreatedTime: new Date() },
    { TransactionID: 'TXN_demo3', ProjectID: 'PRJ_demo2', Type: 'Xuất', DateTime: new Date(Date.now() - 3600000), ItemName: 'Dây điện CADIVI 2.5mm', ItemCode: 'DC-2.5', Quantity: 20, Note: '', ImageURL: '', CreatedBy: 'demo@vtdsmarthome.vn', CreatedTime: new Date() }
  ],
  users: [{ Email: 'demo@vtdsmarthome.vn', Name: 'Người dùng Demo', Avatar: '', Role: 'Admin', Permissions: '' }],
  backups: []
};

/* ---------------- API WRAPPER ---------------- */
async function api(action, params = {}) {
  if (DEMO_MODE) return demoApi(action, params);
  try {
    const body = JSON.stringify({ action, userEmail: state.user ? state.user.Email : '', ...params });
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'Lỗi kết nối: ' + err.message };
  }
}

/** Giả lập backend ngay trên trình duyệt để bạn xem trước giao diện
 *  khi chưa deploy Apps Script. Tự tắt khi bạn điền API_URL thật. */
function demoApi(action, p) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const findUser = (email) => demoStore.users.find(u => u.Email === email);
  const canModify = (ownerEmail, permKey) => {
    const u = findUser(state.user.Email);
    if (!u) return false;
    if (u.Role === 'Admin') return true;
    if (ownerEmail === state.user.Email) return true;
    return String(u.Permissions || '').split(',').includes(permKey);
  };
  switch (action) {
    case 'getBootstrap':
      return { ok: true, user: demoStore.users[0], projects: clone(demoStore.projects) };
    case 'listProjects':
      return { ok: true, projects: clone(demoStore.projects) };
    case 'createProject': {
      const obj = { ProjectID: 'PRJ_' + Date.now(), ProjectName: p.ProjectName, Customer: p.Customer || '', Address: p.Address || '', Status: p.Status || 'Đang thi công', CreatedDate: new Date(), CreatedBy: state.user.Email };
      demoStore.projects.unshift(obj); return { ok: true, project: obj };
    }
    case 'updateProject': {
      const it = demoStore.projects.find(x => x.ProjectID === p.ProjectID);
      if (!canModify(it.CreatedBy, 'edit_all')) return { ok: false, error: 'Bạn không có quyền sửa dự án này' };
      Object.assign(it, p); return { ok: true, project: it };
    }
    case 'deleteProject': {
      const it = demoStore.projects.find(x => x.ProjectID === p.ProjectID);
      if (!it) return { ok: false, error: 'Không tìm thấy dự án' };
      if (!canModify(it.CreatedBy, 'delete_all')) return { ok: false, error: 'Bạn không có quyền xóa dự án này' };
      demoStore.backups.unshift({ BackupID: 'BK_' + Date.now(), Table: 'Projects', RecordID: it.ProjectID, RecordData: JSON.stringify(it), DeletedBy: state.user.Email, DeletedTime: new Date(), Restored: 'N' });
      demoStore.projects = demoStore.projects.filter(x => x.ProjectID !== p.ProjectID);
      return { ok: true };
    }
    case 'listTransactions': {
      let items = demoStore.transactions.filter(t => t.ProjectID === p.ProjectID);
      if (p.Type) items = items.filter(t => t.Type === p.Type);
      if (p.DateFrom) items = items.filter(t => new Date(t.DateTime) >= new Date(p.DateFrom));
      items.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));
      const page = p.page || 1, pageSize = p.pageSize || 20;
      const total = items.length;
      const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
      return { ok: true, items: clone(pageItems), total, page, pageSize };
    }
    case 'searchTransactions': {
      const q = (p.q || '').toLowerCase();
      let items = demoStore.transactions.filter(t => (t.ItemName + t.ItemCode + t.Note).toLowerCase().includes(q));
      return { ok: true, items: clone(items) };
    }
    case 'createTransaction': {
      const obj = { TransactionID: 'TXN_' + Date.now(), ProjectID: p.ProjectID, Type: p.Type, DateTime: new Date(), ItemName: p.ItemName, ItemCode: p.ItemCode || '', Quantity: p.Quantity, Note: p.Note || '', ImageURL: p.ImageURL || '', CreatedBy: state.user.Email, CreatedTime: new Date() };
      demoStore.transactions.unshift(obj); return { ok: true, transaction: obj };
    }
    case 'updateTransaction': {
      const it = demoStore.transactions.find(x => x.TransactionID === p.TransactionID);
      if (!it) return { ok: false, error: 'Không tìm thấy giao dịch' };
      if (!canModify(it.CreatedBy, 'edit_all')) return { ok: false, error: 'Bạn không có quyền sửa giao dịch này' };
      Object.assign(it, p); return { ok: true, transaction: it };
    }
    case 'deleteTransaction': {
      const it = demoStore.transactions.find(x => x.TransactionID === p.TransactionID);
      if (!it) return { ok: false, error: 'Không tìm thấy giao dịch' };
      if (!canModify(it.CreatedBy, 'delete_all')) return { ok: false, error: 'Bạn không có quyền xóa giao dịch này' };
      demoStore.backups.unshift({ BackupID: 'BK_' + Date.now(), Table: 'Transactions', RecordID: it.TransactionID, RecordData: JSON.stringify(it), DeletedBy: state.user.Email, DeletedTime: new Date(), Restored: 'N' });
      demoStore.transactions = demoStore.transactions.filter(x => x.TransactionID !== p.TransactionID);
      return { ok: true };
    }
    case 'getStats': {
      let items = demoStore.transactions;
      if (p.ProjectID) items = items.filter(t => t.ProjectID === p.ProjectID);
      return { ok: true, totalXuat: items.filter(t => t.Type === 'Xuất').length, totalThuHoi: items.filter(t => t.Type === 'ThuHoi').length };
    }
    case 'listUsers':
      return { ok: true, users: clone(demoStore.users) };
    case 'setUserRole': {
      const u = findUser(p.Email);
      if (!u) return { ok: false, error: 'Không tìm thấy người dùng' };
      if (p.Role !== undefined) u.Role = p.Role;
      if (p.Permissions !== undefined) u.Permissions = p.Permissions;
      return { ok: true, user: u };
    }
    case 'listBackups': {
      let items = demoStore.backups.filter(b => String(b.Restored) !== 'Y');
      if (p.Table) items = items.filter(b => b.Table === p.Table);
      return { ok: true, items: clone(items) };
    }
    case 'restoreBackup': {
      const b = demoStore.backups.find(x => x.BackupID === p.BackupID);
      if (!b) return { ok: false, error: 'Không tìm thấy bản sao lưu' };
      const record = JSON.parse(b.RecordData);
      if (b.Table === 'Projects') demoStore.projects.unshift(record);
      else demoStore.transactions.unshift(record);
      b.Restored = 'Y';
      return { ok: true };
    }
    case 'uploadImage':
      return { ok: true, url: p._localPreviewUrl || '' };
    default:
      return { ok: false, error: 'Demo mode: hành động không hỗ trợ' };
  }
}

/* ---------------- HELPERS ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-active');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('is-active'), 2400);
}

function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('vi-VN') + ' ' + dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(-1)[0][0].toUpperCase();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

function projectNameById(id) {
  const p = state.projects.find(x => x.ProjectID === id);
  return p ? p.ProjectName : '(dự án đã xóa)';
}

/** Kiểm tra quyền phía client (chỉ để ẩn/hiện UI cho gọn — quyền THẬT luôn được
 *  backend Code.gs kiểm tra lại độc lập, nên dù can thiệp trình duyệt cũng không vượt qua được). */
function hasPerm(ownerEmail, permKey) {
  if (!state.user) return false;
  if (state.user.Role === 'Admin') return true;
  if (ownerEmail && ownerEmail === state.user.Email) return true;
  const perms = String(state.user.Permissions || '').split(',').map(s => s.trim());
  return perms.indexOf(permKey) !== -1;
}

/* ---------------- PASSWORD CONFIRM (bắt buộc trước khi Sửa/Xóa) ---------------- */
function requirePasswordThen(title, note, onConfirmed) {
  state.pendingPasswordAction = onConfirmed;
  $('#password-sheet-title').textContent = title;
  $('#password-sheet-note').textContent = note;
  $('#password-input').value = '';
  $('#password-error').classList.add('is-hidden');
  $('#password-overlay').classList.add('is-active');
  setTimeout(() => $('#password-input').focus(), 250);
}
$('[data-close-password]').addEventListener('click', () => { $('#password-overlay').classList.remove('is-active'); state.pendingPasswordAction = null; });
$('#password-overlay').addEventListener('click', (e) => { if (e.target.id === 'password-overlay') { $('#password-overlay').classList.remove('is-active'); state.pendingPasswordAction = null; } });
$('#btn-confirm-password').addEventListener('click', () => {
  const val = $('#password-input').value;
  if (val !== CONFIG.CONFIRM_PASSWORD) {
    $('#password-error').classList.remove('is-hidden');
    $('#password-input').value = '';
    $('#password-input').focus();
    return;
  }
  $('#password-overlay').classList.remove('is-active');
  const cb = state.pendingPasswordAction;
  state.pendingPasswordAction = null;
  if (cb) cb();
});
$('#password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-confirm-password').click(); });

/* ---------------- NAVIGATION ---------------- */
const TITLES = {
  dashboard: 'Bảng điều khiển', projects: 'Danh sách dự án', 'project-detail': 'Chi tiết dự án',
  search: 'Tìm kiếm', profile: 'Hồ sơ', users: 'Quản lý người dùng', trash: 'Thùng rác'
};
const TOP_LEVEL_SCREENS = ['dashboard', 'projects', 'search', 'profile'];

function showScreen(name, { push = true, title } = {}) {
  $$('.screen').forEach(s => s.classList.remove('is-active'));
  $('#screen-' + name).classList.add('is-active');
  $('#topbar-title').textContent = title || TITLES[name] || '';
  $$('.nav-item[data-nav]').forEach(b => b.classList.toggle('is-active', b.dataset.nav === name));
  $('#btn-back').classList.toggle('is-hidden', TOP_LEVEL_SCREENS.indexOf(name) !== -1);
  if (push) {
    if (state.screenStack[state.screenStack.length - 1] !== name) state.screenStack.push(name);
  }
  window.scrollTo(0, 0);
  if (name === 'dashboard') loadDashboard();
  if (name === 'projects') loadProjectList();
  if (name === 'users') loadUsers();
  if (name === 'trash') loadTrash();
}

$('#btn-back').addEventListener('click', () => {
  state.screenStack.pop();
  const prev = state.screenStack[state.screenStack.length - 1] || 'dashboard';
  showScreen(prev, { push: false });
});

// Nút trong thanh điều hướng dưới cùng
$$('.nav-item[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.screenStack = [btn.dataset.nav];
    showScreen(btn.dataset.nav, { push: false });
  });
});
// Các nút điều hướng KHÁC nằm rải rác trong app (VD: chip trong Hồ sơ, "Xem tất cả" ở Dashboard)
$$('[data-nav]:not(.nav-item)').forEach(btn => {
  btn.addEventListener('click', () => {
    state.screenStack.push(btn.dataset.nav);
    showScreen(btn.dataset.nav, { push: false });
  });
});
$('#btn-profile').addEventListener('click', () => { state.screenStack.push('profile'); showScreen('profile', { push: false }); });

/* ---------------- LOGIN (có lưu phiên đăng nhập) ---------------- */
function completeLogin(email, name, picture, { remember = true } = {}) {
  toast('Đang tải dữ liệu...');
  api('getBootstrap', { userEmail: email }).then(res => {
    if (!res.ok) { toast('Lỗi đăng nhập: ' + res.error); return; }
    state.user = Object.assign({ Name: name, Avatar: picture }, res.user);
    state.projects = res.projects || [];
    $('#screen-login').classList.remove('is-active');
    $('#app-shell').classList.add('is-active');
    $('#avatar-initial').textContent = initials(state.user.Name || state.user.Email);
    fillProfile();
    showScreen('dashboard', { push: false });

    if (remember) {
      try { localStorage.setItem(LOCAL_USER_KEY, JSON.stringify({ email, name, picture })); } catch (e) {}
    }
  });
}

/** Khôi phục phiên đăng nhập đã lưu khi tải lại trang — chỉ cần đăng nhập lại
 *  khi người dùng chủ động bấm "Đăng xuất". */
function tryRestoreSession() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && saved.email) completeLogin(saved.email, saved.name, saved.picture, { remember: false });
  } catch (e) {}
}

let googleTokenClient = null;
let googleAuthReady = false;

/** Khởi tạo OAuth2 token client MỘT LẦN DUY NHẤT sau khi script GIS tải xong.
 *  Dùng popup chuẩn (initTokenClient) thay vì One Tap/FedCM (hay bị 403/AbortError). */
function initGoogleAuth() {
  if (!window.google || !google.accounts || CONFIG.GOOGLE_CLIENT_ID.indexOf('DÁN_') === 0) return;
  try {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: async (resp) => {
        if (resp.error) { toast('Đăng nhập thất bại: ' + resp.error); return; }
        try {
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + resp.access_token }
          });
          const info = await infoRes.json();
          completeLogin(info.email, info.name, info.picture);
        } catch (e) {
          toast('Không lấy được thông tin tài khoản Google');
        }
      }
    });
    googleAuthReady = true;
  } catch (e) {
    console.warn('Không khởi tạo được Google OAuth:', e);
  }
}

$('#btn-google-login').addEventListener('click', () => {
  if (googleAuthReady && googleTokenClient) {
    googleTokenClient.requestAccessToken();
  } else if (CONFIG.GOOGLE_CLIENT_ID.indexOf('DÁN_') === 0) {
    const email = prompt('Chưa cấu hình Google OAuth Client ID.\nNhập email công ty để dùng thử:', 'ban@vtdsmarthome.vn');
    if (email) completeLogin(email, email.split('@')[0], '');
  } else {
    toast('Đang tải Google Sign-In, vui lòng thử lại sau 1-2 giây...');
  }
});

$('#btn-logout').addEventListener('click', () => {
  if (!confirm('Đăng xuất khỏi ĐiệnTrack?')) return;
  try { localStorage.removeItem(LOCAL_USER_KEY); } catch (e) {}
  state.user = null;
  state.screenStack = ['dashboard'];
  $('#app-shell').classList.remove('is-active');
  $('#screen-login').classList.add('is-active');
});

function fillProfile() {
  $('#profile-name').textContent = state.user.Name || state.user.Email;
  $('#profile-email').textContent = state.user.Email;
  $('#profile-role').textContent = state.user.Role || 'Viewer';
  $('#profile-avatar').textContent = initials(state.user.Name || state.user.Email);
}

/* ---------------- DASHBOARD (chỉ hiện dự án + hoạt động gần đây) ---------------- */
async function loadDashboard() {
  const list = await api('listProjects', {});
  state.projects = list.projects || [];
  renderProjectCards($('#dashboard-projects'), state.projects.slice(0, 3));

  let recentItems = [];
  if (DEMO_MODE) {
    const recent = await api('listTransactions', { ProjectID: state.projects[0] ? state.projects[0].ProjectID : null, page: 1, pageSize: 5 });
    recentItems = recent.items || [];
  } else if (state.projects[0]) {
    // Gộp hoạt động gần đây từ vài dự án gần nhất
    const batches = await Promise.all(
      state.projects.slice(0, 5).map(p => api('listTransactions', { ProjectID: p.ProjectID, page: 1, pageSize: 5 }))
    );
    recentItems = batches.flatMap(b => b.items || []);
    recentItems.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));
    recentItems = recentItems.slice(0, 6);
  }
  renderTxnCards($('#dashboard-recent'), recentItems, { context: 'dashboard' });
}

function renderProjectCards(container, projects) {
  container.innerHTML = '';
  if (!projects.length) { container.innerHTML = '<div class="empty-state">Chưa có dự án nào. Bấm "+ Tạo dự án mới" để bắt đầu.</div>'; return; }
  projects.forEach(p => {
    const el = document.createElement('button');
    el.className = 'project-card';
    el.style.textAlign = 'left';
    el.style.border = 'none';
    el.innerHTML = `<strong>${escapeHtml(p.ProjectName)}</strong>
      <span>${escapeHtml(p.Customer || 'Chưa có khách hàng')} · ${escapeHtml(p.Address || '')}</span>
      <span class="status-chip">${escapeHtml(p.Status || '')}</span>`;
    el.addEventListener('click', () => openProjectDetail(p));
    container.appendChild(el);
  });
}

/** context: 'dashboard' | 'project-detail' | 'search'
 *  Chỉ context 'project-detail' mới cho phép bấm vào để Sửa/Xóa.
 *  'dashboard' chỉ xem nhanh (bấm mở ảnh nếu có). 'search' xử lý riêng (dạng gộp nhóm). */
function renderTxnCards(container, items, { context = 'dashboard' } = {}) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="empty-state">Chưa có giao dịch nào.</div>'; return; }
  items.forEach(t => container.appendChild(txnCardEl(t, context)));
}

function txnCardEl(t, context) {
  const el = document.createElement('div');
  el.className = 'txn-card type-' + t.Type;
  const isXuat = t.Type === 'Xuất';
  const iconSvg = isXuat
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.innerHTML = `
    ${t.ImageURL ? `<img class="txn-thumb" src="${escapeAttr(t.ImageURL)}">` : `<span class="txn-icon">${iconSvg}</span>`}
    <div class="txn-body">
      <strong>${escapeHtml(t.ItemName)}</strong>
      <div class="txn-meta">
        ${t.ItemCode ? `<code>${escapeHtml(t.ItemCode)}</code>` : ''}
        <span>${fmtDate(t.DateTime)}</span>
        <span>${escapeHtml((t.CreatedBy || '').split('@')[0])}</span>
      </div>
      ${t.Note ? `<div class="txn-meta">${escapeHtml(t.Note)}</div>` : ''}
    </div>
    <span class="txn-qty">${isXuat ? '-' : '+'}${escapeHtml(String(t.Quantity))}</span>
  `;
  if (context === 'project-detail') {
    // Chỉ trong màn Chi tiết dự án mới được mở action Sửa/Xóa
    el.addEventListener('click', () => openTxnAction(t));
  } else {
    // Dashboard: chỉ xem ảnh, không sửa/xóa được ở đây
    el.addEventListener('click', () => { if (t.ImageURL) openImageViewer(t.ImageURL); });
  }
  return el;
}

/* ---------------- TXN ACTION SHEET (thay cho prompt "sua"/"xoa") ---------------- */
function openTxnAction(t) {
  state.activeTxnForAction = t;
  const isXuat = t.Type === 'Xuất';
  $('#txn-action-body').innerHTML = `
    ${t.ImageURL ? `<img class="txn-action-thumb" src="${escapeAttr(t.ImageURL)}" id="txn-action-thumb-img">` : ''}
    <div class="txn-action-info">
      <strong>${escapeHtml(t.ItemName)}</strong>
      ${t.ItemCode ? `<div><code>${escapeHtml(t.ItemCode)}</code></div>` : ''}
      <div>${isXuat ? 'Xuất' : 'Thu hồi'}: <strong>${escapeHtml(String(t.Quantity))}</strong></div>
      <div>${fmtDate(t.DateTime)} · ${escapeHtml((t.CreatedBy || '').split('@')[0])}</div>
      ${t.Note ? `<div>Ghi chú: ${escapeHtml(t.Note)}</div>` : ''}
    </div>`;
  if (t.ImageURL) {
    $('#txn-action-thumb-img').addEventListener('click', () => openImageViewer(t.ImageURL));
  }

  const canEdit = hasPerm(t.CreatedBy, 'edit_all');
  const canDelete = hasPerm(t.CreatedBy, 'delete_all');
  const btnBox = $('#txn-action-buttons');
  btnBox.innerHTML = '';
  if (t.ImageURL) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'txn-action-view';
    viewBtn.textContent = 'Xem ảnh đầy đủ';
    viewBtn.addEventListener('click', () => openImageViewer(t.ImageURL));
    btnBox.appendChild(viewBtn);
  }
  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'txn-action-edit';
    editBtn.textContent = 'Sửa giao dịch';
    editBtn.addEventListener('click', () => {
      $('#txn-action-overlay').classList.remove('is-active');
      requirePasswordThen('Xác nhận sửa giao dịch', 'Nhập mật khẩu để sửa "' + t.ItemName + '".', () => openTxnForm(t.Type, t));
    });
    btnBox.appendChild(editBtn);
  }
  if (canDelete) {
    const delBtn = document.createElement('button');
    delBtn.className = 'txn-action-delete';
    delBtn.textContent = 'Xóa giao dịch';
    delBtn.addEventListener('click', () => {
      $('#txn-action-overlay').classList.remove('is-active');
      requirePasswordThen('Xác nhận xóa giao dịch', 'Nhập mật khẩu để xóa "' + t.ItemName + '". Dữ liệu sẽ được lưu vào Thùng rác, có thể khôi phục sau.', async () => {
        const res = await api('deleteTransaction', { TransactionID: t.TransactionID });
        if (!res.ok) { toast('Lỗi: ' + res.error); return; }
        toast('Đã xóa giao dịch — có thể khôi phục ở Thùng rác');
        refreshCurrentScreen();
      });
    });
    btnBox.appendChild(delBtn);
  }
  if (!canEdit && !canDelete) {
    const note = document.createElement('div');
    note.className = 'no-permission-note';
    note.textContent = 'Bạn không có quyền sửa/xóa giao dịch này.';
    btnBox.appendChild(note);
  }

  $('#txn-action-overlay').classList.add('is-active');
}
$('[data-close-txn-action]').addEventListener('click', () => $('#txn-action-overlay').classList.remove('is-active'));
$('#txn-action-overlay').addEventListener('click', (e) => { if (e.target.id === 'txn-action-overlay') $('#txn-action-overlay').classList.remove('is-active'); });

function refreshCurrentScreen() {
  const cur = state.screenStack[state.screenStack.length - 1];
  if (cur === 'project-detail') loadProjectDetail();
  else if (cur === 'dashboard') loadDashboard();
  else if (cur === 'trash') loadTrash();
}

/* ---------------- PROJECT LIST ---------------- */
async function loadProjectList(filterText) {
  const res = await api('listProjects', {});
  let projects = res.projects || [];
  if (filterText) {
    const q = filterText.toLowerCase();
    projects = projects.filter(p => (p.ProjectName + p.Customer).toLowerCase().includes(q));
  }
  state.projects = res.projects || state.projects;
  renderProjectCards($('#project-list-full'), projects);
}
$('#project-search').addEventListener('input', (e) => loadProjectList(e.target.value));
$('#btn-add-project').addEventListener('click', () => openProjectForm());

/* ---------------- PROJECT DETAIL ---------------- */
function openProjectDetail(project) {
  state.currentProject = project;
  state.pdPage = 1;
  $('#pd-name').textContent = project.ProjectName;
  $('#pd-meta').textContent = `${project.Customer || 'Chưa có khách hàng'} · ${project.Address || ''} · ${project.Status || ''}`;
  $('#pd-edit').classList.toggle('is-hidden', !hasPerm(project.CreatedBy, 'edit_all'));
  $('#pd-delete').classList.toggle('is-hidden', !hasPerm(project.CreatedBy, 'delete_all'));
  state.screenStack.push('project-detail');
  showScreen('project-detail', { push: false, title: 'Chi tiết dự án' });
  loadProjectDetail();
}

async function loadProjectDetail() {
  if (!state.currentProject) return;
  const params = {
    ProjectID: state.currentProject.ProjectID,
    page: state.pdPage,
    pageSize: state.pdPageSize,
    Type: $('#filter-type').value || undefined,
    DateFrom: $('#filter-date').value || undefined
  };
  const res = await api('listTransactions', params);
  let items = res.items || [];
  const q = $('#pd-search').value.trim().toLowerCase();
  if (q) items = items.filter(t => (t.ItemName + t.ItemCode + (t.Note || '')).toLowerCase().includes(q));
  renderTxnCards($('#pd-txn-list'), items, { context: 'project-detail' });
  state.pdTotal = res.total || items.length;
  const pages = Math.max(1, Math.ceil(state.pdTotal / state.pdPageSize));
  $('#pd-page-info').textContent = `Trang ${state.pdPage}/${pages}`;
}

$('#filter-type').addEventListener('change', () => { state.pdPage = 1; loadProjectDetail(); });
$('#filter-date').addEventListener('change', () => { state.pdPage = 1; loadProjectDetail(); });
$('#pd-search').addEventListener('input', () => loadProjectDetail());
$('#pd-prev').addEventListener('click', () => { if (state.pdPage > 1) { state.pdPage--; loadProjectDetail(); } });
$('#pd-next').addEventListener('click', () => { state.pdPage++; loadProjectDetail(); });

$('#pd-edit').addEventListener('click', () => openProjectForm(state.currentProject));
$('#pd-delete').addEventListener('click', () => {
  const proj = state.currentProject;
  requirePasswordThen('Xác nhận xóa dự án', 'Nhập mật khẩu để xóa dự án "' + proj.ProjectName + '". Dữ liệu sẽ được lưu vào Thùng rác, Admin có thể khôi phục sau.', async () => {
    const res = await api('deleteProject', { ProjectID: proj.ProjectID });
    if (!res.ok) { toast('Lỗi: ' + res.error); return; }
    toast('Đã xóa dự án — có thể khôi phục ở Thùng rác');
    state.screenStack = ['projects'];
    showScreen('projects', { push: false });
  });
});

/* ---------------- PROJECT FORM SHEET ---------------- */
let editingProjectId = null;
function openProjectForm(project) {
  editingProjectId = project ? project.ProjectID : null;
  $('#project-sheet-title').textContent = project ? 'Sửa dự án' : 'Tạo dự án mới';
  $('#prj-name').value = project ? project.ProjectName : '';
  $('#prj-customer').value = project ? project.Customer : '';
  $('#prj-address').value = project ? project.Address : '';
  $('#prj-status').value = project ? project.Status : 'Đang thi công';
  $('#project-overlay').classList.add('is-active');
}
$('[data-close-project]').addEventListener('click', () => $('#project-overlay').classList.remove('is-active'));
$('#project-overlay').addEventListener('click', (e) => { if (e.target.id === 'project-overlay') $('#project-overlay').classList.remove('is-active'); });

$('#btn-save-project').addEventListener('click', async () => {
  const name = $('#prj-name').value.trim();
  if (!name) { toast('Vui lòng nhập tên dự án'); return; }
  const payload = { ProjectName: name, Customer: $('#prj-customer').value.trim(), Address: $('#prj-address').value.trim(), Status: $('#prj-status').value };
  if (editingProjectId) payload.ProjectID = editingProjectId;
  const res = await api(editingProjectId ? 'updateProject' : 'createProject', payload);
  if (!res.ok) { toast('Lỗi: ' + res.error); return; }
  toast(editingProjectId ? 'Đã cập nhật dự án' : 'Đã tạo dự án mới');
  $('#project-overlay').classList.remove('is-active');
  if (editingProjectId && state.currentProject) { state.currentProject = res.project; openProjectDetail(res.project); }
  else loadProjectList();
  loadDashboard();
});

/* ---------------- FAB / ADD TRANSACTION ---------------- */
$('#btn-fab').addEventListener('click', () => {
  populateProjectSelect();
  $('#sheet-overlay').classList.add('is-active');
});
$('[data-close-sheet]').addEventListener('click', () => $('#sheet-overlay').classList.remove('is-active'));
$('#sheet-overlay').addEventListener('click', (e) => { if (e.target.id === 'sheet-overlay') $('#sheet-overlay').classList.remove('is-active'); });

$$('.type-choice').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#sheet-overlay').classList.remove('is-active');
    openTxnForm(btn.dataset.type);
  });
});

function populateProjectSelect() {
  const sel = $('#txn-project');
  sel.innerHTML = state.projects.map(p => `<option value="${p.ProjectID}">${escapeHtml(p.ProjectName)}</option>`).join('');
  if (state.currentProject) sel.value = state.currentProject.ProjectID;
}

/** existingTxn: nếu có -> chế độ SỬA (không phải tạo mới) */
function openTxnForm(type, existingTxn) {
  state.pendingTxnType = type;
  state.editingTxnId = existingTxn ? existingTxn.TransactionID : null;
  state.pendingPhotoBase64 = null;
  state.pendingPhotoMime = null;
  populateProjectSelect();
  $('#txn-sheet-title').textContent = (existingTxn ? 'Sửa: ' : '') + (type === 'Xuất' ? 'Xuất hàng' : 'Thu hồi hàng');
  $('#txn-sheet-title').style.color = type === 'Xuất' ? 'var(--color-xuat)' : 'var(--color-thuhoi)';
  $('#txn-itemname').value = existingTxn ? existingTxn.ItemName : '';
  $('#txn-itemcode').value = existingTxn ? existingTxn.ItemCode : '';
  $('#txn-qty').value = existingTxn ? existingTxn.Quantity : '';
  $('#txn-note').value = existingTxn ? existingTxn.Note : '';
  if (existingTxn) $('#txn-project').value = existingTxn.ProjectID;

  if (existingTxn && existingTxn.ImageURL) {
    $('#txn-photo-preview').src = existingTxn.ImageURL;
    $('#txn-photo-preview').classList.remove('is-hidden');
  } else {
    $('#txn-photo-preview').classList.add('is-hidden');
  }
  $('#ocr-status').classList.add('is-hidden');
  $('#txn-overlay').classList.add('is-active');
  setTimeout(() => $('#txn-itemname').focus(), 250);
}

$('[data-close-txn]').addEventListener('click', () => $('#txn-overlay').classList.remove('is-active'));
$('#txn-overlay').addEventListener('click', (e) => { if (e.target.id === 'txn-overlay') $('#txn-overlay').classList.remove('is-active'); });

$('#txn-photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingPhotoBase64 = await fileToBase64(file);
  state.pendingPhotoMime = file.type;
  const preview = $('#txn-photo-preview');
  preview.src = 'data:' + file.type + ';base64,' + state.pendingPhotoBase64;
  preview.classList.remove('is-hidden');
});

$('#btn-save-txn').addEventListener('click', () => {
  const itemName = $('#txn-itemname').value.trim();
  const qty = $('#txn-qty').value;
  if (!itemName) { toast('Vui lòng nhập tên hàng'); return; }
  if (!qty) { toast('Vui lòng nhập số lượng'); return; }

  const isEdit = !!state.editingTxnId;
  const doSave = async () => {
    $('#btn-save-txn').textContent = 'Đang lưu...';
    $('#btn-save-txn').disabled = true;

    let imageUrl = (isEdit && state.activeTxnForAction) ? (state.activeTxnForAction.ImageURL || '') : '';
    if (state.pendingPhotoBase64) {
      const up = await api('uploadImage', {
        base64Data: state.pendingPhotoBase64,
        mimeType: state.pendingPhotoMime,
        fileName: 'txn_' + Date.now() + '.jpg',
        _localPreviewUrl: 'data:' + state.pendingPhotoMime + ';base64,' + state.pendingPhotoBase64
      });
      if (up.ok) imageUrl = up.url;
    }

    const payload = {
      ProjectID: $('#txn-project').value,
      Type: state.pendingTxnType,
      ItemName: itemName,
      ItemCode: $('#txn-itemcode').value.trim(),
      Quantity: qty,
      Note: $('#txn-note').value.trim(),
      ImageURL: imageUrl
    };
    if (isEdit) payload.TransactionID = state.editingTxnId;

    const res = await api(isEdit ? 'updateTransaction' : 'createTransaction', payload);
    $('#btn-save-txn').textContent = 'Lưu';
    $('#btn-save-txn').disabled = false;
    if (!res.ok) { toast('Lỗi: ' + res.error); return; }

    toast(isEdit ? '✓ Đã cập nhật giao dịch' : (state.pendingTxnType === 'Xuất' ? '✓ Đã ghi nhận xuất hàng' : '✓ Đã ghi nhận thu hồi'));
    $('#txn-overlay').classList.remove('is-active');
    refreshCurrentScreen();
  };

  if (isEdit) {
    // Sửa giao dịch đã được xác nhận mật khẩu ở bước mở form (openTxnAction) -> lưu thẳng
    doSave();
  } else {
    doSave();
  }
});

/* ---------------- AI OCR (Gemini) ---------------- */
$('#btn-ocr').addEventListener('click', () => $('#ocr-input').click());

$('#ocr-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = $('#ocr-status');
  statusEl.classList.remove('is-hidden');
  statusEl.textContent = '🤖 AI đang đọc ảnh, vui lòng chờ...';

  if (CONFIG.GEMINI_API_KEY.indexOf('DÁN_') === 0) {
    statusEl.textContent = '⚠️ Chưa cấu hình Gemini API Key trong app.js';
    return;
  }

  try {
    const base64 = await fileToBase64(file);
    state.pendingPhotoBase64 = base64;
    state.pendingPhotoMime = file.type;
    const preview = $('#txn-photo-preview');
    preview.src = 'data:' + file.type + ';base64,' + base64;
    preview.classList.remove('is-hidden');

    const prompt = 'Đây là ảnh phiếu xuất kho hoặc danh sách vật tư điện/smarthome. ' +
      'Hãy đọc và trả về DUY NHẤT một JSON object (không giải thích, không markdown) theo định dạng: ' +
      '{"ItemName": "tên hàng chính", "ItemCode": "mã hàng nếu có, hoặc rỗng", "Quantity": số lượng dạng số}. ' +
      'Nếu có nhiều mặt hàng, chỉ lấy mặt hàng đầu tiên/quan trọng nhất.';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: base64 } }] }]
        })
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.ItemName) $('#txn-itemname').value = parsed.ItemName;
    if (parsed.ItemCode) $('#txn-itemcode').value = parsed.ItemCode;
    if (parsed.Quantity) $('#txn-qty').value = parsed.Quantity;

    statusEl.textContent = '✓ AI đã điền sẵn — vui lòng kiểm tra lại trước khi lưu';
  } catch (err) {
    statusEl.textContent = '⚠️ AI không đọc được ảnh, vui lòng nhập tay';
  }
});

/* ---------------- GLOBAL SEARCH (chỉ xem, gộp số lượng theo từng dự án) ---------------- */
let searchDebounce;
$('#global-search').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  searchDebounce = setTimeout(async () => {
    const container = $('#global-search-results');
    if (!q) { container.innerHTML = ''; return; }
    if (!state.projects.length) { const pr = await api('listProjects', {}); state.projects = pr.projects || []; }
    const res = await api('searchTransactions', { q });
    renderSearchGroups(container, res.items || []);
  }, 300);
});

function renderSearchGroups(container, items) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="empty-state">Không tìm thấy kết quả.</div>'; return; }

  // Gộp theo mã hàng (hoặc tên hàng nếu không có mã), rồi theo từng dự án
  const groups = new Map();
  items.forEach(t => {
    const key = (t.ItemCode && String(t.ItemCode).trim()) ? String(t.ItemCode).trim().toLowerCase() : String(t.ItemName).trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { itemName: t.ItemName, itemCode: t.ItemCode, byProject: new Map() });
    const g = groups.get(key);
    if (!g.byProject.has(t.ProjectID)) g.byProject.set(t.ProjectID, { xuat: 0, thuhoi: 0 });
    const pg = g.byProject.get(t.ProjectID);
    const qty = Number(t.Quantity) || 0;
    if (t.Type === 'Xuất') pg.xuat += qty; else pg.thuhoi += qty;
  });

  groups.forEach(g => {
    const card = document.createElement('div');
    card.className = 'search-group-card';
    let rows = '';
    g.byProject.forEach((v, projectId) => {
      rows += `<div class="search-group-row">
        <span class="sg-project">${escapeHtml(projectNameById(projectId))}</span>
        <span class="sg-qty sg-xuat">Xuất ${v.xuat}</span>
        <span class="sg-qty sg-thuhoi">Thu hồi ${v.thuhoi}</span>
      </div>`;
    });
    card.innerHTML = `
      <div class="search-group-head">
        <strong>${escapeHtml(g.itemName)}</strong>
        ${g.itemCode ? `<code>${escapeHtml(g.itemCode)}</code>` : ''}
      </div>
      ${rows}`;
    container.appendChild(card);
  });
}

/* ---------------- USERS & PHÂN QUYỀN ---------------- */
async function loadUsers() {
  const res = await api('listUsers', {});
  const container = $('#users-list');
  container.innerHTML = '';
  const isAdmin = state.user.Role === 'Admin';

  (res.users || []).forEach(u => {
    const perms = String(u.Permissions || '').split(',').map(s => s.trim()).filter(Boolean);
    const el = document.createElement('div');
    el.className = 'project-card user-card';

    if (!isAdmin) {
      el.innerHTML = `
        <div class="user-card-head">
          <span class="user-card-avatar">${initials(u.Name || u.Email)}</span>
          <div>
            <div class="user-card-name">${escapeHtml(u.Name || u.Email)}</div>
            <div class="user-card-email">${escapeHtml(u.Email)}</div>
          </div>
        </div>
        <span class="status-chip">${escapeHtml(u.Role || 'Viewer')}</span>`;
      container.appendChild(el);
      return;
    }

    const uid = 'u_' + btoa(unescape(encodeURIComponent(u.Email))).replace(/[^a-zA-Z0-9]/g, '');
    el.innerHTML = `
      <div class="user-card-head">
        <span class="user-card-avatar">${initials(u.Name || u.Email)}</span>
        <div>
          <div class="user-card-name">${escapeHtml(u.Name || u.Email)}</div>
          <div class="user-card-email">${escapeHtml(u.Email)}</div>
        </div>
      </div>
      <div class="user-card-controls">
        <select class="user-role-select" id="role-${uid}">
          <option value="Admin" ${u.Role === 'Admin' ? 'selected' : ''}>Admin — Toàn quyền (kể cả xóa dự án)</option>
          <option value="Staff" ${u.Role === 'Staff' || !u.Role ? 'selected' : ''}>Staff — Chỉ thêm/sửa dữ liệu của mình</option>
          <option value="Viewer" ${u.Role === 'Viewer' ? 'selected' : ''}>Viewer — Chỉ xem</option>
        </select>
        <div class="perm-toggle-row">
          <label class="perm-toggle">
            <input type="checkbox" id="perm-edit-${uid}" ${perms.includes('edit_all') ? 'checked' : ''}>
            Được sửa dự án/giao dịch của người khác
          </label>
          <label class="perm-toggle">
            <input type="checkbox" id="perm-delete-${uid}" ${perms.includes('delete_all') ? 'checked' : ''}>
            Được xóa dự án/giao dịch của người khác
          </label>
        </div>
        <button class="user-save-btn" data-save-user="${escapeAttr(u.Email)}" data-uid="${uid}">Lưu thay đổi</button>
      </div>`;
    container.appendChild(el);
  });

  $$('[data-save-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.saveUser;
      const uid = btn.dataset.uid;
      const role = $('#role-' + uid).value;
      const perms = [];
      if ($('#perm-edit-' + uid).checked) perms.push('edit_all');
      if ($('#perm-delete-' + uid).checked) perms.push('delete_all');
      const res = await api('setUserRole', { Email: email, Role: role, Permissions: perms.join(',') });
      if (!res.ok) { toast('Lỗi: ' + res.error); return; }
      toast('Đã cập nhật quyền cho ' + email);
      if (email === state.user.Email) { state.user.Role = role; state.user.Permissions = perms.join(','); fillProfile(); }
    });
  });
}

/* ---------------- TRASH / BACKUP (khôi phục dữ liệu lỡ xóa nhầm) ---------------- */
async function loadTrash() {
  const container = $('#trash-list');
  if (state.user.Role !== 'Admin') {
    container.innerHTML = '<div class="empty-state">Chỉ Admin mới xem được thùng rác.</div>';
    return;
  }
  const res = await api('listBackups', {});
  const items = res.items || [];
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="empty-state">Thùng rác trống — chưa có dữ liệu nào bị xóa.</div>'; return; }

  items.forEach(b => {
    let data = {};
    try { data = JSON.parse(b.RecordData); } catch (e) {}
    const label = b.Table === 'Projects' ? (data.ProjectName || b.RecordID) : (data.ItemName || b.RecordID);
    const typeLabel = b.Table === 'Projects' ? 'Dự án' : 'Giao dịch';
    const el = document.createElement('div');
    el.className = 'project-card backup-card';
    el.innerHTML = `
      <div class="backup-body">
        <strong>${escapeHtml(label)}</strong>
        <span>${typeLabel} · Xóa bởi ${escapeHtml((b.DeletedBy || '').split('@')[0])} · ${fmtDate(b.DeletedTime)}</span>
      </div>
      <button class="backup-restore-btn" data-restore="${escapeAttr(b.BackupID)}">Khôi phục</button>`;
    container.appendChild(el);
  });

  $$('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Khôi phục lại bản ghi này?')) return;
      const res = await api('restoreBackup', { BackupID: btn.dataset.restore });
      if (!res.ok) { toast('Lỗi: ' + res.error); return; }
      toast('✓ Đã khôi phục thành công');
      loadTrash();
      loadDashboard();
    });
  });
}

/* ---------------- IMAGE VIEWER ---------------- */
function openImageViewer(url) {
  $('#image-viewer-img').src = url;
  $('#image-viewer').classList.add('is-active');
}
$('#image-viewer-close').addEventListener('click', () => $('#image-viewer').classList.remove('is-active'));
$('#image-viewer').addEventListener('click', (e) => { if (e.target.id === 'image-viewer') $('#image-viewer').classList.remove('is-active'); });

/* ---------------- GOOGLE IDENTITY SCRIPT LOADER ---------------- */
(function loadGIS() {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true; s.defer = true;
  s.onload = initGoogleAuth; // chỉ khởi tạo 1 lần, không lặp trong click handler
  document.head.appendChild(s);
})();

/* ---------------- PWA MANIFEST (tạo động bằng Blob, tránh lỗi encode data-URI) ---------------- */
(function setupManifest() {
  const manifest = {
    name: 'ĐiệnTrack - VTD Smarthome',
    short_name: 'ĐiệnTrack',
    start_url: '.',
    display: 'standalone',
    background_color: '#F6F5F0',
    theme_color: '#12356B'
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
})();

/* ---------------- SERVICE WORKER (PWA offline shell, tuỳ chọn) ---------------- */
if ('serviceWorker' in navigator) {
  const swCode = `self.addEventListener('fetch', e => {});`;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
}

if (DEMO_MODE) {
  console.warn('ĐiệnTrack đang chạy DEMO MODE (dữ liệu giả, chỉ trong bộ nhớ). Điền CONFIG.API_URL trong app.js để kết nối Google Sheets thật.');
}

/* ---------------- KHỞI ĐỘNG: khôi phục phiên đăng nhập nếu có ---------------- */
tryRestoreSession();