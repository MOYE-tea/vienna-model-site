let pricingRows = [];

async function loadSettings() {
  const settings = await api.get('/settings');
  document.getElementById('disclaimer-text').value = settings.content_disclaimer_text || '';
  document.getElementById('rules-text').value = settings.collaboration_rules_text || '';
  try {
    pricingRows = JSON.parse(settings.pricing_card || '[]');
  } catch {
    pricingRows = [];
  }
  renderPricingRows();
}

function renderPricingRows() {
  const container = document.getElementById('pricing-rows');
  container.innerHTML = '';
  if (!pricingRows.length) {
    container.innerHTML = '<div class="placeholder">還沒有任何價目項目</div>';
  }
  pricingRows.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'field-row';
    div.style.alignItems = 'flex-end';
    div.innerHTML = `
      <div class="field" style="margin:0;"><label>項目</label><input value="${row.label ?? ''}" data-i="${i}" data-k="label"></div>
      <div class="field" style="margin:0;"><label>價格 (NT$)</label><input type="number" value="${row.price ?? ''}" data-i="${i}" data-k="price"></div>
      <button class="btn btn--danger btn--sm" data-remove="${i}" style="margin-bottom:16px;">移除</button>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      pricingRows[input.dataset.i][input.dataset.k] = input.dataset.k === 'price' ? Number(input.value) : input.value;
    });
  });
  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => { pricingRows.splice(Number(btn.dataset.remove), 1); renderPricingRows(); });
  });
}

document.getElementById('add-price-row').addEventListener('click', () => {
  pricingRows.push({ label: '', price: 0 });
  renderPricingRows();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const status = document.getElementById('save-status');
  await api.patch('/settings', {
    content_disclaimer_text: document.getElementById('disclaimer-text').value,
    collaboration_rules_text: document.getElementById('rules-text').value,
    pricing_card: JSON.stringify(pricingRows)
  });
  status.textContent = '已儲存';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

document.getElementById('test-calendar-btn').addEventListener('click', async () => {
  const status = document.getElementById('calendar-status');
  status.textContent = '測試中…';
  status.className = 'placeholder';
  const result = await api.get('/calendar/test');
  if (result.ok) {
    status.textContent = `連線成功，會寫入「${result.calendarName}」行事曆`;
    status.className = '';
    status.style.color = 'var(--ok)';
  } else if (result.reason === 'not_configured') {
    status.textContent = '尚未設定 — 請在 server/.env 填入 ICLOUD_APPLE_ID 與 ICLOUD_APP_PASSWORD';
    status.className = 'placeholder';
  } else {
    status.textContent = `連線失敗：${result.reason}`;
    status.className = '';
    status.style.color = 'var(--danger)';
  }
});

loadSettings();
