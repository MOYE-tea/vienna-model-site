let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0-indexed
let selectedDate = null;
let monthSlots = [];

function pad(n) { return String(n).padStart(2, '0'); }
function monthStr() { return `${viewYear}-${pad(viewMonth + 1)}`; }

async function loadMonth() {
  document.getElementById('month-label').textContent = `${viewYear} 年 ${pad(viewMonth + 1)} 月`;
  monthSlots = await api.get(`/availability?month=${monthStr()}`);
  renderCalendar();
  if (selectedDate) renderSelectedDate();
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell is-empty';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
    const daySlots = monthSlots.filter((s) => s.date === dateStr);
    const hasOpen = daySlots.some((s) => s.is_open && s.lock_status === 'open');
    const hasLocked = daySlots.some((s) => s.lock_status === 'locked');

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (hasLocked ? ' has-locked' : hasOpen ? ' has-open' : '');
    if (dateStr === selectedDate) cell.style.borderColor = 'var(--gold)';
    cell.innerHTML = `<span>${d}</span>${daySlots.length ? '<span class="cal-cell__dot"></span>' : ''}`;
    cell.addEventListener('click', () => { selectedDate = dateStr; renderCalendar(); renderSelectedDate(); });
    grid.appendChild(cell);
  }
}

function renderSelectedDate() {
  document.getElementById('selected-date-label').textContent = selectedDate;
  const daySlots = monthSlots.filter((s) => s.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const container = document.getElementById('slots-for-day');
  container.innerHTML = daySlots.length
    ? daySlots.map((s) => `
      <div class="slot-row">
        <div>
          <div class="slot-row__time">${s.start_time} – ${s.end_time}</div>
          <div style="font-size:11px; color:var(--ink-faint);">${s.lock_status === 'locked' ? '已鎖定（有邀約）' : s.is_open ? '開放中' : '已關閉'}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <label class="toggle-switch">
            <input type="checkbox" ${s.is_open ? 'checked' : ''} ${s.lock_status === 'locked' ? 'disabled' : ''} data-slot-id="${s.id}" class="slot-toggle">
            <span class="track"></span>
          </label>
          <button class="btn--danger btn btn--sm slot-delete" data-slot-id="${s.id}" ${s.lock_status === 'locked' ? 'disabled' : ''}>刪除</button>
        </div>
      </div>
    `).join('')
    : '<div class="placeholder">這天還沒有開放任何時段</div>';

  container.querySelectorAll('.slot-toggle').forEach((el) => {
    el.addEventListener('change', async () => {
      await api.patch(`/availability/${el.dataset.slotId}`, { is_open: el.checked ? 1 : 0 });
      loadMonth();
    });
  });
  container.querySelectorAll('.slot-delete').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await api.del(`/availability/${el.dataset.slotId}`);
        loadMonth();
      } catch (err) {
        alert('這個時段已有邀約，無法刪除');
      }
    });
  });
}

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth -= 1;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  loadMonth();
});
document.getElementById('next-month').addEventListener('click', () => {
  viewMonth += 1;
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  loadMonth();
});

document.getElementById('add-slot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedDate) { alert('請先在月曆上選一個日期'); return; }
  const form = new FormData(e.target);
  try {
    await api.post('/availability', { date: selectedDate, start_time: form.get('start_time'), end_time: form.get('end_time') });
    e.target.reset();
    loadMonth();
  } catch (err) {
    alert(err.data?.error === 'slot_exists' ? '這個時段已經存在' : '新增失敗');
  }
});

document.getElementById('bulk-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const dates = form.get('dates').split(',').map((d) => d.trim()).filter(Boolean);
  const result = await api.post('/availability/bulk', {
    dates,
    slots: [{ start_time: form.get('start_time'), end_time: form.get('end_time') }]
  });
  document.getElementById('bulk-result').textContent = `已建立 ${result.created} 個時段`;
  loadMonth();
});

loadMonth();
