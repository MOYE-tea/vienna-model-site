const API_BASE = '/api/admin';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' })
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return dateStr;
}

function statusLabel(status) {
  return { pending: '待確認', accepted: '已接受', rejected: '已拒絕' }[status] || status;
}

function typeLabel(type) {
  return { commission: '委託', mutual: '互惠' }[type] || type;
}

const PIPELINE_LABELS = {
  requested: '邀約中',
  confirmed: '已確認',
  shot: '已拍攝',
  awaiting_delivery: '待交片',
  delivered: '已交片',
  done: '完成'
};
const PIPELINE_ORDER = ['requested', 'confirmed', 'shot', 'awaiting_delivery', 'delivered', 'done'];

async function loadSidebarBadge() {
  try {
    const stats = await api.get('/dashboard');
    const badge = document.getElementById('sidebar-pending-badge');
    if (badge) {
      if (stats.pendingCount > 0) {
        badge.textContent = stats.pendingCount;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {
    // sidebar badge is a nicety, fail silently
  }
}

document.addEventListener('DOMContentLoaded', loadSidebarBadge);
