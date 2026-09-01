document.getElementById('today-label').textContent = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

async function loadDashboard() {
  const stats = await api.get('/dashboard');
  document.getElementById('stat-shoots').textContent = stats.shootsThisMonth;
  document.getElementById('stat-split').innerHTML = `${stats.commissionCount} <small>委託</small> / ${stats.mutualCount} <small>互惠</small>`;
  document.getElementById('stat-revenue').textContent = `NT$ ${stats.revenue.toLocaleString()}`;
  document.getElementById('stat-hours').innerHTML = `${stats.totalHours} <small>hrs</small>`;
  document.getElementById('stat-rate').innerHTML = stats.avgHourlyRate ? `NT$ ${Math.round(stats.avgHourlyRate).toLocaleString()} <small>/hr</small>` : '—';

  const pending = await api.get('/bookings?status=pending');
  const tbody = document.querySelector('#pending-table tbody');
  const empty = document.getElementById('pending-empty');
  tbody.innerHTML = '';
  if (!pending.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  for (const b of pending.slice(0, 8)) {
    const tr = document.createElement('tr');
    tr.className = 'is-clickable';
    tr.addEventListener('click', () => { window.location.href = `bookings.html?id=${b.id}`; });
    tr.innerHTML = `
      <td>${b.photographer_name}</td>
      <td><span class="badge badge--${b.type}">${typeLabel(b.type)}</span></td>
      <td>${b.shoot_date}</td>
      <td>${b.start_time ?? ''}${b.start_time ? '–' + b.end_time : ''}</td>
      <td><span class="badge badge--pending">${statusLabel(b.status)}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

loadDashboard();
