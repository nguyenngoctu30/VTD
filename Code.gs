/**
 * ============================================================
 * XUẤT HÀNG / THU HỒI HÀNG - BACKEND (Google Apps Script)
 * ============================================================
 * CÁCH DÙNG:
 * 1. Vào https://script.google.com -> New project
 * 2. Xóa code mặc định, paste toàn bộ file này vào
 * 3. Đổi SPREADSHEET_ID và DRIVE_FOLDER_ID bên dưới
 * 4. Deploy -> New deployment -> Web app
 *      - Execute as: Me
 *      - Who has access: Anyone (hoặc "Anyone within [tổ chức]")
 * 5. Copy URL "Web app" -> dán vào app.js (biến API_URL)
 * ============================================================
 */

// ---------- CẤU HÌNH ----------
const SPREADSHEET_ID = '1RMLPg_W5tVfxZFIWvK6S-Pf0RyM3p8Y6Ayg4E7KSuoc';
const DRIVE_FOLDER_ID = '1bvhZnLNE2okrZzfgV3TFsCclxEPNHFwB';


const SHEETS = {
  PROJECTS: 'Projects',
  TRANSACTIONS: 'Transactions',
  AUDIT: 'AuditLog',
  USERS: 'Users',
  BACKUP: 'Backup'
};

// Đổi chuỗi này mỗi lần bạn deploy để tự kiểm tra xem web đang chạy đúng bản mới nhất chưa:
// mở .../exec?action=ping trên trình duyệt (GET) -> phải thấy đúng version này.
const BACKEND_VERSION = 'v4-2026-07-23-group-permission-trash';

// ---------- ENTRY POINTS ----------
function doGet(e) {
  return handleRequest(e);
}
function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  let result;
  try {
    const params = e.parameter.data ? JSON.parse(e.parameter.data) : (e.postData ? JSON.parse(e.postData.contents) : {});
    const action = e.parameter.action || params.action;
    const userEmail = params.userEmail || Session.getActiveUser().getEmail();

    switch (action) {
      case 'getBootstrap': result = getBootstrap(userEmail); break;
      case 'listProjects': result = listProjects(); break;
      case 'createProject': result = createProject(params, userEmail); break;
      case 'updateProject': result = updateProject(params, userEmail); break;
      case 'deleteProject': result = deleteProject(params, userEmail); break;
      case 'listTransactions': result = listTransactions(params); break;
      case 'createTransaction': result = createTransaction(params, userEmail); break;
      case 'updateTransaction': result = updateTransaction(params, userEmail); break;
      case 'deleteTransaction': result = deleteTransaction(params, userEmail); break;
      case 'uploadImage': result = uploadImage(params); break;
      case 'searchTransactions': result = searchTransactions(params); break;
      case 'getStats': result = getStats(params); break;
      case 'listUsers': result = listUsers(); break;
      case 'upsertUser': result = upsertUser(params); break;
      case 'setUserRole': result = setUserRole(params, userEmail); break;
      case 'listBackups': result = listBackups(params, userEmail); break;
      case 'restoreBackup': result = restoreBackup(params, userEmail); break;
      case 'purgeBackup': result = purgeBackup(params, userEmail); break;
      case 'syncExternalDeletions': result = manualSyncExternalDeletions(userEmail); break;
      case 'ping': result = { ok: true, version: BACKEND_VERSION }; break;
      default: result = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- HELPERS ----------
function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function sheet(name) {
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('Không tìm thấy sheet: ' + name);
  return s;
}

function sheetToObjects(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(c => c !== '' && c !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function findRowIndexById(sh, idColName, idValue) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idColName);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(idValue)) return i + 1; // 1-based row
  }
  return -1;
}

function appendRowFromObject(sh, obj) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
}

function updateRowFromObject(sh, rowIndex, obj) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function newId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0] + Date.now().toString(36);
}

function logAudit(user, action, table, recordId, oldValue, newValue) {
  const sh = sheet(SHEETS.AUDIT);
  appendRowFromObject(sh, {
    LogID: newId('LOG'),
    User: user,
    Action: action,
    Table: table,
    RecordID: recordId,
    OldValue: oldValue ? JSON.stringify(oldValue) : '',
    NewValue: newValue ? JSON.stringify(newValue) : '',
    Time: new Date()
  });
}

// ---------- PERMISSIONS ----------
function getUserRecord(email) {
  const users = sheetToObjects(sheet(SHEETS.USERS));
  return users.find(u => u.Email === email) || null;
}

/** permKey: 'edit_all' hoặc 'delete_all'.
 *  Cho phép nếu: là Admin, hoặc là chủ sở hữu bản ghi (ownerEmail === email),
 *  hoặc Admin đã ủy quyền permKey đó cho tài khoản này (cột Permissions, phân cách bởi dấu phẩy). */
function assertCanModify(email, ownerEmail, permKey) {
  const user = getUserRecord(email);
  if (!user) throw new Error('Tài khoản chưa được đăng ký trong hệ thống');
  if (user.Role === 'Admin') return true;
  if (ownerEmail && ownerEmail === email) return true;
  const perms = String(user.Permissions || '').split(',').map(s => s.trim());
  if (perms.indexOf(permKey) !== -1) return true;
  throw new Error('Bạn không có quyền thực hiện thao tác này. Liên hệ Admin để được ủy quyền.');
}

function isProjectOwner(email) {
  const projects = sheetToObjects(sheet(SHEETS.PROJECTS));
  return projects.some(pr => pr.CreatedBy === email);
}

/** Coi người TẠO ÍT NHẤT 1 DỰ ÁN cũng có quyền như Admin đối với: quản lý phân quyền,
 *  xem Thùng rác, khôi phục, xóa vĩnh viễn. Chỉ việc "phong Admin cho người khác" vẫn
 *  cần Admin thật (chặn ở setUserRole riêng). */
function canManageSystem(email) {
  const user = getUserRecord(email);
  if (user && user.Role === 'Admin') return true;
  return isProjectOwner(email);
}

function setUserRole(p, actingEmail) {
  const acting = getUserRecord(actingEmail);
  if (!acting) throw new Error('Tài khoản chưa được đăng ký trong hệ thống');
  const isAdmin = acting.Role === 'Admin';
  const canManage = isAdmin || isProjectOwner(actingEmail);
  if (!canManage) throw new Error('Chỉ Admin hoặc người đã tạo ít nhất 1 dự án mới có quyền phân quyền tài khoản khác');
  if (!isAdmin && p.Role === 'Admin') throw new Error('Chỉ Admin mới có quyền cấp vai trò Admin cho tài khoản khác');

  const sh = sheet(SHEETS.USERS);
  const rowIdx = findRowIndexById(sh, 'Email', p.Email);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy người dùng' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const oldRow = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const oldObj = {}; headers.forEach((h, i) => oldObj[h] = oldRow[i]);
  const newObj = Object.assign({}, oldObj, {
    Role: p.Role !== undefined ? p.Role : oldObj.Role,
    Permissions: p.Permissions !== undefined ? p.Permissions : oldObj.Permissions
  });
  updateRowFromObject(sh, rowIdx, newObj);
  logAudit(actingEmail, 'UPDATE_ROLE', SHEETS.USERS, p.Email, oldObj, newObj);
  return { ok: true, user: newObj };
}

// ---------- BACKUP / TRASH (chống xóa nhầm) ----------
/** Lưu bản sao đầy đủ của bản ghi vào sheet Backup trước khi xóa thật.
 *  Nhờ đó nếu lỡ xóa nhầm dự án hoặc giao dịch, Admin có thể khôi phục lại. */
function backupRecord(table, recordId, recordObj, deletedBy) {
  appendRowFromObject(sheet(SHEETS.BACKUP), {
    BackupID: newId('BK'),
    Table: table,
    RecordID: recordId,
    RecordData: JSON.stringify(recordObj),
    DeletedBy: deletedBy,
    DeletedTime: new Date(),
    Restored: 'N',
    RestoredBy: '',
    RestoredTime: ''
  });
}

function listBackups(p, actingEmail) {
  if (!canManageSystem(actingEmail)) throw new Error('Chỉ Admin hoặc người đã tạo dự án mới xem được Thùng rác');
  let items = sheetToObjects(sheet(SHEETS.BACKUP));
  if (p && p.Table) items = items.filter(b => b.Table === p.Table);
  items = items.filter(b => String(b.Restored) !== 'Y');
  items.sort((a, b) => new Date(b.DeletedTime) - new Date(a.DeletedTime));
  return { ok: true, items: items.slice(0, 200) };
}

function restoreBackup(p, actingEmail) {
  if (!canManageSystem(actingEmail)) throw new Error('Chỉ Admin hoặc người đã tạo dự án mới có quyền khôi phục dữ liệu');

  const sh = sheet(SHEETS.BACKUP);
  const rowIdx = findRowIndexById(sh, 'BackupID', p.BackupID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy bản sao lưu' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const backupObj = {}; headers.forEach((h, i) => backupObj[h] = row[i]);

  const recordObj = JSON.parse(backupObj.RecordData);
  const targetSheetName = backupObj.Table;
  appendRowFromObject(sheet(targetSheetName), recordObj);

  const updated = Object.assign({}, backupObj, { Restored: 'Y', RestoredBy: actingEmail, RestoredTime: new Date() });
  updateRowFromObject(sh, rowIdx, updated);

  logAudit(actingEmail, 'RESTORE', targetSheetName, backupObj.RecordID, null, recordObj);
  return { ok: true };
}

/** Xóa vĩnh viễn 1 bản ghi khỏi Thùng rác — KHÔNG thể hoàn tác. Chỉ Admin. */
function purgeBackup(p, actingEmail) {
  if (!canManageSystem(actingEmail)) throw new Error('Chỉ Admin hoặc người đã tạo dự án mới có quyền xóa vĩnh viễn');
  const sh = sheet(SHEETS.BACKUP);
  const rowIdx = findRowIndexById(sh, 'BackupID', p.BackupID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy bản sao lưu' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const backupObj = {}; headers.forEach((h, i) => backupObj[h] = row[i]);
  sh.deleteRow(rowIdx);
  logAudit(actingEmail, 'PURGE', backupObj.Table, backupObj.RecordID, backupObj, null);
  return { ok: true };
}

/** Quét & phát hiện các dòng bị xóa TRỰC TIẾP trong Google Sheet (không qua app),
 *  bằng cách so sánh với bản mirror (_SnapshotProjects / _SnapshotTransactions)
 *  được cập nhật ở lần quét trước. Bất kỳ ID nào có trong mirror nhưng biến mất
 *  khỏi sheet sống đều được backup lại để Admin có thể khôi phục/xóa vĩnh viễn. */
function syncExternalDeletions() {
  const c1 = syncOneTable(SHEETS.PROJECTS, '_SnapshotProjects', 'ProjectID');
  const c2 = syncOneTable(SHEETS.TRANSACTIONS, '_SnapshotTransactions', 'TransactionID');
  return c1 + c2;
}

function syncOneTable(liveName, snapName, idField) {
  const liveSh = sheet(liveName);
  const snapSh = sheet(snapName);
  const liveData = sheetToObjects(liveSh);
  const snapData = sheetToObjects(snapSh);

  const liveIds = {};
  liveData.forEach(r => liveIds[String(r[idField])] = true);

  let backedUpCount = 0;
  if (snapData.length > 0) {
    snapData.forEach(row => {
      if (!liveIds[String(row[idField])]) {
        backupRecord(liveName, row[idField], row, '(Xóa trực tiếp trong Google Sheet)');
        backedUpCount++;
      }
    });
  }

  // Cập nhật lại mirror = đúng bản hiện tại của sheet sống, để lần quét sau so sánh đúng
  const headers = liveSh.getRange(1, 1, 1, liveSh.getLastColumn()).getValues()[0];
  snapSh.clearContents();
  snapSh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (liveData.length > 0) {
    const rows = liveData.map(obj => headers.map(h => obj[h] !== undefined ? obj[h] : ''));
    snapSh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return backedUpCount;
}

/** Admin bấm nút "Quét xóa ngoài Sheet" trong app để kiểm tra ngay lập tức
 *  (ngoài ra hệ thống cũng tự quét định kỳ nhờ trigger được tạo trong setupSpreadsheet). */
function manualSyncExternalDeletions(actingEmail) {
  if (!canManageSystem(actingEmail)) throw new Error('Chỉ Admin hoặc người đã tạo dự án mới quét được dữ liệu xóa ngoài Sheet');
  const count = syncExternalDeletions();
  return { ok: true, count: count };
}

/** Tạo trigger tự động chạy syncExternalDeletions mỗi 10 phút (chỉ tạo 1 lần, không nhân bản). */
function ensureSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === 'syncExternalDeletions');
  if (!exists) {
    ScriptApp.newTrigger('syncExternalDeletions').timeBased().everyMinutes(10).create();
  }
}

// ---------- BOOTSTRAP ----------
function getBootstrap(userEmail) {
  const users = sheetToObjects(sheet(SHEETS.USERS));
  let me = users.find(u => u.Email === userEmail);
  if (!me) {
    me = { Email: userEmail, Name: userEmail.split('@')[0], Avatar: '', Role: users.length === 0 ? 'Admin' : 'Viewer' };
    appendRowFromObject(sheet(SHEETS.USERS), me);
  }
  return { ok: true, user: me, projects: listProjects().projects };
}

// ---------- PROJECTS ----------
function listProjects() {
  const projects = sheetToObjects(sheet(SHEETS.PROJECTS));
  return { ok: true, projects: projects.reverse() };
}

function createProject(p, userEmail) {
  const obj = {
    ProjectID: newId('PRJ'),
    ProjectName: p.ProjectName,
    Customer: p.Customer || '',
    Address: p.Address || '',
    Status: p.Status || 'Đang thi công',
    CreatedDate: new Date(),
    CreatedBy: userEmail
  };
  appendRowFromObject(sheet(SHEETS.PROJECTS), obj);
  logAudit(userEmail, 'CREATE', SHEETS.PROJECTS, obj.ProjectID, null, obj);
  return { ok: true, project: obj };
}

function updateProject(p, userEmail) {
  const sh = sheet(SHEETS.PROJECTS);
  const rowIdx = findRowIndexById(sh, 'ProjectID', p.ProjectID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy dự án' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const oldRow = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const oldObj = {}; headers.forEach((h, i) => oldObj[h] = oldRow[i]);
  assertCanModify(userEmail, oldObj.CreatedBy, 'edit_all');
  const newObj = Object.assign({}, oldObj, p);
  updateRowFromObject(sh, rowIdx, newObj);
  logAudit(userEmail, 'UPDATE', SHEETS.PROJECTS, p.ProjectID, oldObj, newObj);
  return { ok: true, project: newObj };
}

function deleteProject(p, userEmail) {
  const sh = sheet(SHEETS.PROJECTS);
  const rowIdx = findRowIndexById(sh, 'ProjectID', p.ProjectID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy dự án' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const oldRow = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const oldObj = {}; headers.forEach((h, i) => oldObj[h] = oldRow[i]);
  assertCanModify(userEmail, oldObj.CreatedBy, 'delete_all');
  backupRecord(SHEETS.PROJECTS, p.ProjectID, oldObj, userEmail);
  sh.deleteRow(rowIdx);
  logAudit(userEmail, 'DELETE', SHEETS.PROJECTS, p.ProjectID, oldObj, null);
  return { ok: true };
}

// ---------- TRANSACTIONS ----------
function listTransactions(p) {
  let items = sheetToObjects(sheet(SHEETS.TRANSACTIONS));
  if (p.ProjectID) items = items.filter(t => t.ProjectID === p.ProjectID);
  if (p.Type) items = items.filter(t => t.Type === p.Type);
  if (p.CreatedBy) items = items.filter(t => t.CreatedBy === p.CreatedBy);
  if (p.DateFrom) items = items.filter(t => new Date(t.DateTime) >= new Date(p.DateFrom));
  if (p.DateTo) items = items.filter(t => new Date(t.DateTime) <= new Date(p.DateTo));
  items.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));

  const page = parseInt(p.page || 1);
  const pageSize = parseInt(p.pageSize || 20);
  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { ok: true, items: pageItems, total: total, page: page, pageSize: pageSize };
}

function searchTransactions(p) {
  let items = sheetToObjects(sheet(SHEETS.TRANSACTIONS));
  const q = (p.q || '').toLowerCase().trim();
  if (q) {
    items = items.filter(t =>
      String(t.ItemName).toLowerCase().includes(q) ||
      String(t.ItemCode).toLowerCase().includes(q) ||
      String(t.Note).toLowerCase().includes(q)
    );
  }
  items.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));
  return { ok: true, items: items.slice(0, 100) };
}

function createTransaction(p, userEmail) {
  const obj = {
    TransactionID: newId('TXN'),
    ProjectID: p.ProjectID,
    Type: p.Type, // 'Xuất' | 'ThuHoi'
    DateTime: p.DateTime ? new Date(p.DateTime) : new Date(),
    ItemName: p.ItemName,
    ItemCode: p.ItemCode || '',
    Quantity: p.Quantity,
    Note: p.Note || '',
    ImageURL: p.ImageURL || '',
    CreatedBy: userEmail,
    CreatedTime: new Date()
  };
  appendRowFromObject(sheet(SHEETS.TRANSACTIONS), obj);
  logAudit(userEmail, 'CREATE', SHEETS.TRANSACTIONS, obj.TransactionID, null, obj);
  return { ok: true, transaction: obj };
}

function updateTransaction(p, userEmail) {
  const sh = sheet(SHEETS.TRANSACTIONS);
  const rowIdx = findRowIndexById(sh, 'TransactionID', p.TransactionID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy giao dịch' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const oldRow = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const oldObj = {}; headers.forEach((h, i) => oldObj[h] = oldRow[i]);
  assertCanModify(userEmail, oldObj.CreatedBy, 'edit_all');
  const newObj = Object.assign({}, oldObj, p);
  updateRowFromObject(sh, rowIdx, newObj);
  logAudit(userEmail, 'UPDATE', SHEETS.TRANSACTIONS, p.TransactionID, oldObj, newObj);
  return { ok: true, transaction: newObj };
}

function deleteTransaction(p, userEmail) {
  const sh = sheet(SHEETS.TRANSACTIONS);
  const rowIdx = findRowIndexById(sh, 'TransactionID', p.TransactionID);
  if (rowIdx === -1) return { ok: false, error: 'Không tìm thấy giao dịch' };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const oldRow = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const oldObj = {}; headers.forEach((h, i) => oldObj[h] = oldRow[i]);
  assertCanModify(userEmail, oldObj.CreatedBy, 'delete_all');
  backupRecord(SHEETS.TRANSACTIONS, p.TransactionID, oldObj, userEmail);
  sh.deleteRow(rowIdx);
  logAudit(userEmail, 'DELETE', SHEETS.TRANSACTIONS, p.TransactionID, oldObj, null);
  return { ok: true };
}

// ---------- STATS ----------
function getStats(p) {
  let items = sheetToObjects(sheet(SHEETS.TRANSACTIONS));
  if (p.ProjectID) items = items.filter(t => t.ProjectID === p.ProjectID);
  const xuat = items.filter(t => t.Type === 'Xuất').length;
  const thuHoi = items.filter(t => t.Type === 'ThuHoi').length;
  return { ok: true, totalXuat: xuat, totalThuHoi: thuHoi, totalTransactions: items.length };
}

// ---------- USERS ----------
function listUsers() {
  return { ok: true, users: sheetToObjects(sheet(SHEETS.USERS)) };
}

function upsertUser(p) {
  const sh = sheet(SHEETS.USERS);
  const rowIdx = findRowIndexById(sh, 'Email', p.Email);
  if (rowIdx === -1) {
    appendRowFromObject(sh, p);
  } else {
    updateRowFromObject(sh, rowIdx, p);
  }
  return { ok: true };
}

// ---------- IMAGE UPLOAD (base64 -> Drive) ----------
function uploadImage(p) {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const bytes = Utilities.base64Decode(p.base64Data);
  const blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', p.fileName || ('img_' + Date.now() + '.jpg'));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://drive.google.com/uc?id=' + file.getId();
  return { ok: true, url: url, fileId: file.getId() };
}

/**
 * Hàm chạy 1 lần để tự tạo cấu trúc Sheet (headers) nếu Sheet trống.
 * Vào Apps Script -> chọn hàm "setupSpreadsheet" -> Run.
 */
function setupSpreadsheet() {
  const s = ss();
  const schemas = {
    Projects: ['ProjectID', 'ProjectName', 'Customer', 'Address', 'Status', 'CreatedDate', 'CreatedBy'],
    Transactions: ['TransactionID', 'ProjectID', 'Type', 'DateTime', 'ItemName', 'ItemCode', 'Quantity', 'Note', 'ImageURL', 'CreatedBy', 'CreatedTime'],
    AuditLog: ['LogID', 'User', 'Action', 'Table', 'RecordID', 'OldValue', 'NewValue', 'Time'],
    // Permissions: danh sách quyền được Admin ủy quyền, cách nhau bởi dấu phẩy. VD: "edit_all,delete_all"
    Users: ['Email', 'Name', 'Avatar', 'Role', 'Permissions'],
    // Backup: lưu bản sao đầy đủ của mọi bản ghi đã xóa để có thể khôi phục khi lỡ xóa nhầm
    Backup: ['BackupID', 'Table', 'RecordID', 'RecordData', 'DeletedBy', 'DeletedTime', 'Restored', 'RestoredBy', 'RestoredTime'],
    // Sheet mirror nội bộ, dùng để phát hiện khi có dòng bị xóa TRỰC TIẾP trong Google Sheet (không qua app)
    _SnapshotProjects: ['ProjectID', 'ProjectName', 'Customer', 'Address', 'Status', 'CreatedDate', 'CreatedBy'],
    _SnapshotTransactions: ['TransactionID', 'ProjectID', 'Type', 'DateTime', 'ItemName', 'ItemCode', 'Quantity', 'Note', 'ImageURL', 'CreatedBy', 'CreatedTime']
  };
  Object.keys(schemas).forEach(name => {
    let sh = s.getSheetByName(name);
    if (!sh) sh = s.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, schemas[name].length).setValues([schemas[name]]);
      sh.setFrozenRows(1);
    } else {
      // Nếu sheet đã có sẵn (từ lần setup trước) nhưng thiếu cột mới -> tự thêm cột còn thiếu vào cuối
      const existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      schemas[name].forEach(col => {
        if (existingHeaders.indexOf(col) === -1) {
          sh.getRange(1, sh.getLastColumn() + 1).setValue(col);
        }
      });
    }
    if (name.indexOf('_Snapshot') === 0) {
      try { sh.hideSheet(); } catch (e) {}
    }
  });

  // Khởi tạo baseline cho mirror (lần đầu chạy sẽ không backup gì, chỉ đồng bộ)
  syncExternalDeletions();
  // Tạo trigger tự động quét mỗi 10 phút để phát hiện xóa trực tiếp trong Sheet
  try { ensureSyncTrigger(); } catch (e) { Logger.log('Không tạo được trigger tự động: ' + e.message); }

  Logger.log('Setup xong! (Đã kiểm tra/bổ sung sheet, cột còn thiếu, và bật quét tự động chống xóa nhầm ngoài Sheet)');
}