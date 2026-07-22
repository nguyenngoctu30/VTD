
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
  GEMINI_MODEL: 'gemini-2.0-flash'
};

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
};

/* ---------------- DEMO MODE (khi chưa cấu hình API_URL) ---------------- */
const DEMO_MODE = CONFIG.API_URL.indexOf('DÁN_URL') === 0;
const demoStore = {
  projects: [
    { ProjectID: 'PRJ_demo1', ProjectName: 'Nhà anh Tuấn - Q7', Customer: 'Anh Tuấn', Address: '12 Nguyễn Lương Bằng, Q7', Status: 'Đang thi công', CreatedDate: new Date(), CreatedBy: 'demo@congty.vn' },
    { ProjectID: 'PRJ_demo2', ProjectName: 'Villa Thảo Điền', Customer: 'Chị Hoa', Address: '45 Quốc Hương, TP.Thủ Đức', Status: 'Đang thi công', CreatedDate: new Date(), CreatedBy: 'demo@congty.vn' }
  ],
  transactions: [
    { TransactionID: 'TXN_demo1', ProjectID: 'PRJ_demo1', Type: 'Xuất', DateTime: new Date(), ItemName: 'Dây điện CADIVI 2.5mm', ItemCode: 'DC-2.5', Quantity: 50, Note: 'Xuất cho tầng 2', ImageURL: '', CreatedBy: 'demo@congty.vn', CreatedTime: new Date() },
    { TransactionID: 'TXN_demo2', ProjectID: 'PRJ_demo1', Type: 'ThuHoi', DateTime: new Date(Date.now()-86400000), ItemName: 'Ổ cắm âm tường Panasonic', ItemCode: 'OC-PN01', Quantity: 4, Note: 'Thu hồi do đổi màu', ImageURL: '', CreatedBy: 'demo@congty.vn', CreatedTime: new Date() }
  ],
  users: [{ Email: 'demo@congty.vn', Name: 'Người dùng Demo', Avatar: '', Role: 'Admin' }]
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
      Object.assign(it, p); return { ok: true, project: it };
    }
    case 'deleteProject':
      demoStore.projects = demoStore.projects.filter(x => x.ProjectID !== p.ProjectID);
      demoStore.transactions = demoStore.transactions.filter(x => x.ProjectID !== p.ProjectID);
      return { ok: true };
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
      Object.assign(it, p); return { ok: true, transaction: it };
    }
    case 'deleteTransaction':
      demoStore.transactions = demoStore.transactions.filter(x => x.TransactionID !== p.TransactionID);
      return { ok: true };
    case 'getStats': {
      let items = demoStore.transactions;
      if (p.ProjectID) items = items.filter(t => t.ProjectID === p.ProjectID);
      return { ok: true, totalXuat: items.filter(t => t.Type === 'Xuất').length, totalThuHoi: items.filter(t => t.Type === 'ThuHoi').length };
    }
    case 'listUsers':
      return { ok: true, users: clone(demoStore.users) };
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
  toast._timer = setTimeout(() => t.classList.remove('is-active'), 2200);
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

/* ---------------- NAVIGATION ---------------- */
const TITLES = {
  dashboard: 'Bảng điều khiển', projects: 'Danh sách dự án', 'project-detail': 'Chi tiết dự án',
  search: 'Tìm kiếm', profile: 'Hồ sơ', users: 'Quản lý người dùng'
};

function showScreen(name, { push = true, title } = {}) {
  $$('.screen').forEach(s => s.classList.remove('is-active'));
  $('#screen-' + name).classList.add('is-active');
  $('#topbar-title').textContent = title || TITLES[name] || '';
  $$('.nav-item[data-nav]').forEach(b => b.classList.toggle('is-active', b.dataset.nav === name));
  $('#btn-back').classList.toggle('is-hidden', name === 'dashboard' || name === 'projects' || name === 'search' || name === 'profile');
  if (push) {
    if (state.screenStack[state.screenStack.length - 1] !== name) state.screenStack.push(name);
  }
  window.scrollTo(0, 0);
  if (name === 'dashboard') loadDashboard();
  if (name === 'projects') loadProjectList();
  if (name === 'users') loadUsers();
}

$('#btn-back').addEventListener('click', () => {
  state.screenStack.pop();
  const prev = state.screenStack[state.screenStack.length - 1] || 'dashboard';
  showScreen(prev, { push: false });
});

$$('.nav-item[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.screenStack = [btn.dataset.nav];
    showScreen(btn.dataset.nav, { push: false });
  });
});
$('#btn-profile').addEventListener('click', () => { state.screenStack.push('profile'); showScreen('profile', { push: false }); });

/* ---------------- LOGIN ---------------- */
function completeLogin(email, name, picture) {
  loadingToast('Đang tải dữ liệu...');
  api('getBootstrap', { userEmail: email }).then(res => {
    if (!res.ok) { toast('Lỗi đăng nhập: ' + res.error); return; }
    state.user = Object.assign({ Name: name, Avatar: picture }, res.user);
    state.projects = res.projects || [];
    $('#screen-login').classList.remove('is-active');
    $('#app-shell').classList.add('is-active');
    $('#avatar-initial').textContent = initials(state.user.Name || state.user.Email);
    fillProfile();
    showScreen('dashboard', { push: false });
  });
}

function loadingToast(msg) { toast(msg); }

let googleTokenClient = null;
let googleAuthReady = false;

/** Khởi tạo OAuth2 token client MỘT LẦN DUY NHẤT sau khi script GIS tải xong.
 *  Dùng popup chuẩn (initTokenClient) thay vì One Tap/FedCM (google.accounts.id.prompt)
 *  vì FedCM hay bị 403/AbortError khi domain chưa khai báo đủ hoặc mở bằng file://. */
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
    // Chưa cấu hình Google OAuth Client ID -> đăng nhập tạm bằng email để xem giao diện
    const email = prompt('Chưa cấu hình Google OAuth Client ID.\nNhập email công ty để dùng thử:', 'ban@congty.vn');
    if (email) completeLogin(email, email.split('@')[0], '');
  } else {
    toast('Đang tải Google Sign-In, vui lòng thử lại sau 1-2 giây...');
  }
});

$('#btn-logout').addEventListener('click', () => {
  state.user = null;
  $('#app-shell').classList.remove('is-active');
  $('#screen-login').classList.add('is-active');
});

function fillProfile() {
  $('#profile-name').textContent = state.user.Name || state.user.Email;
  $('#profile-email').textContent = state.user.Email;
  $('#profile-role').textContent = state.user.Role || 'Viewer';
  $('#profile-avatar').textContent = initials(state.user.Name || state.user.Email);
}

/* ---------------- DASHBOARD ---------------- */
async function loadDashboard() {
  const stats = await api('getStats', {});
  $('#stat-xuat').textContent = stats.totalXuat ?? 0;
  $('#stat-thuhoi').textContent = stats.totalThuHoi ?? 0;

  const list = await api('listProjects', {});
  state.projects = list.projects || [];
  renderProjectCards($('#dashboard-projects'), state.projects.slice(0, 3));

  const recent = await api('listTransactions', { ProjectID: null, page: 1, pageSize: 5 });
  // Nếu backend lọc theo ProjectID null sẽ trả rỗng ở chế độ thật; fallback: gộp từ tất cả dự án gần nhất
  let recentItems = recent.items || [];
  if (!DEMO_MODE && recentItems.length === 0 && state.projects[0]) {
    const alt = await api('listTransactions', { ProjectID: state.projects[0].ProjectID, page: 1, pageSize: 5 });
    recentItems = alt.items || [];
  }
  renderTxnCards($('#dashboard-recent'), recentItems, { showProject: false });
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

function renderTxnCards(container, items, { showProject = false } = {}) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="empty-state">Chưa có giao dịch nào.</div>'; return; }
  items.forEach(t => container.appendChild(txnCardEl(t)));
}

function txnCardEl(t) {
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
  el.addEventListener('click', () => {
    if (t.ImageURL) { openImageViewer(t.ImageURL); return; }
    openTxnActions(t);
  });
  return el;
}

function openTxnActions(t) {
  const canEdit = state.user.Role === 'Admin' || t.CreatedBy === state.user.Email;
  if (!canEdit) return;
  const choice = prompt('Nhập "sua" để sửa số lượng/ghi chú, hoặc "xoa" để xóa giao dịch:', '');
  if (choice === 'xoa') {
    if (confirm('Xóa giao dịch "' + t.ItemName + '"?')) {
      api('deleteTransaction', { TransactionID: t.TransactionID }).then(() => {
        toast('Đã xóa giao dịch');
        refreshCurrentScreen();
      });
    }
  } else if (choice === 'sua') {
    const qty = prompt('Số lượng mới:', t.Quantity);
    if (qty === null) return;
    const note = prompt('Ghi chú mới:', t.Note || '');
    api('updateTransaction', { TransactionID: t.TransactionID, Quantity: qty, Note: note }).then(() => {
      toast('Đã cập nhật giao dịch');
      refreshCurrentScreen();
    });
  }
}

function refreshCurrentScreen() {
  const cur = state.screenStack[state.screenStack.length - 1];
  if (cur === 'project-detail') loadProjectDetail();
  else if (cur === 'dashboard') loadDashboard();
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

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
  renderTxnCards($('#pd-txn-list'), items);
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
  if (!confirm('Xóa dự án "' + state.currentProject.ProjectName + '"? Toàn bộ lịch sử vẫn được lưu trong AuditLog.')) return;
  api('deleteProject', { ProjectID: state.currentProject.ProjectID }).then(() => {
    toast('Đã xóa dự án');
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

function openTxnForm(type) {
  state.pendingTxnType = type;
  state.editingTxnId = null;
  state.pendingPhotoBase64 = null;
  populateProjectSelect();
  $('#txn-sheet-title').textContent = type === 'Xuất' ? 'Xuất hàng' : 'Thu hồi hàng';
  $('#txn-sheet-title').style.color = type === 'Xuất' ? 'var(--color-xuat)' : 'var(--color-thuhoi)';
  $('#txn-itemname').value = '';
  $('#txn-itemcode').value = '';
  $('#txn-qty').value = '';
  $('#txn-note').value = '';
  $('#txn-photo-preview').classList.add('is-hidden');
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

$('#btn-save-txn').addEventListener('click', async () => {
  const itemName = $('#txn-itemname').value.trim();
  const qty = $('#txn-qty').value;
  if (!itemName) { toast('Vui lòng nhập tên hàng'); return; }
  if (!qty) { toast('Vui lòng nhập số lượng'); return; }

  $('#btn-save-txn').textContent = 'Đang lưu...';
  $('#btn-save-txn').disabled = true;

  let imageUrl = '';
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
  const res = await api('createTransaction', payload);
  $('#btn-save-txn').textContent = 'Lưu';
  $('#btn-save-txn').disabled = false;
  if (!res.ok) { toast('Lỗi: ' + res.error); return; }

  toast(state.pendingTxnType === 'Xuất' ? '✓ Đã ghi nhận xuất hàng' : '✓ Đã ghi nhận thu hồi');
  $('#txn-overlay').classList.remove('is-active');
  refreshCurrentScreen();
  loadDashboard();
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
    // Cũng dùng luôn ảnh này làm ảnh đính kèm giao dịch
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

/* ---------------- GLOBAL SEARCH ---------------- */
let searchDebounce;
$('#global-search').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  searchDebounce = setTimeout(async () => {
    if (!q) { $('#global-search-results').innerHTML = ''; return; }
    const res = await api('searchTransactions', { q });
    renderTxnCards($('#global-search-results'), res.items || []);
  }, 300);
});

/* ---------------- USERS ---------------- */
async function loadUsers() {
  const res = await api('listUsers', {});
  const container = $('#users-list');
  container.innerHTML = '';
  (res.users || []).forEach(u => {
    const el = document.createElement('div');
    el.className = 'project-card';
    el.innerHTML = `<strong>${escapeHtml(u.Name || u.Email)}</strong><span>${escapeHtml(u.Email)}</span><span class="status-chip">${escapeHtml(u.Role || 'Viewer')}</span>`;
    container.appendChild(el);
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
    name: 'ĐiệnTrack',
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
  const swCode = `
    self.addEventListener('fetch', e => {});
  `;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
}

if (DEMO_MODE) {
  console.warn('ĐiệnTrack đang chạy DEMO MODE (dữ liệu giả, chỉ trong bộ nhớ). Điền CONFIG.API_URL trong app.js để kết nối Google Sheets thật.');
}