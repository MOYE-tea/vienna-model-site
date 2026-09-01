async function loadPhotographers() {
  const rows = await api.get('/photographers');
  const tbody = document.getElementById('photographers-tbody');
  const empty = document.getElementById('photographers-empty');
  tbody.innerHTML = '';
  empty.style.display = rows.length ? 'none' : 'block';

  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.className = 'is-clickable';
    tr.addEventListener('click', () => openDetail(p.id));
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.instagram_handle || '—'}</td>
      <td>${p.email || '—'}</td>
      <td>${p.booking_count}</td>
    `;
    tbody.appendChild(tr);
  }
}

const modal = document.getElementById('detail-modal');
async function openDetail(id) {
  const p = await api.get(`/photographers/${id}`);
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-body').innerHTML = `
    <div class="field-row">
      <div class="field"><label>Instagram</label><div>${p.instagram_handle || '—'}</div></div>
      <div class="field"><label>Email</label><div>${p.email || '—'}</div></div>
    </div>
    <div class="field"><label>作品集連結</label><div>${p.portfolio_url ? `<a href="${p.portfolio_url}" target="_blank">${p.portfolio_url}</a>` : '—'}</div></div>
    <div class="field"><label>備註</label><div>${p.notes || '—'}</div></div>
    <div class="field">
      <label>合作紀錄（${p.bookings.length}）</label>
      <table class="data-table">
        <thead><tr><th>日期</th><th>類型</th><th>狀態</th><th>進度</th></tr></thead>
        <tbody>
          ${p.bookings.map((b) => `
            <tr>
              <td>${b.shoot_date}</td>
              <td><span class="badge badge--${b.type}">${typeLabel(b.type)}</span></td>
              <td><span class="badge badge--${b.status}">${statusLabel(b.status)}</span></td>
              <td>${PIPELINE_LABELS[b.pipeline_stage]}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  modal.classList.add('is-open');
}
document.getElementById('detail-close').addEventListener('click', () => modal.classList.remove('is-open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });

loadPhotographers();
