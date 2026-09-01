let currentStatus = '';
let currentType = '';

document.querySelectorAll('#status-filters .filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#status-filters .filter-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    currentStatus = chip.dataset.status;
    loadBookings();
  });
});
document.querySelectorAll('#type-filters .filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#type-filters .filter-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    currentType = chip.dataset.type;
    loadBookings();
  });
});

async function loadBookings() {
  const params = new URLSearchParams();
  if (currentStatus) params.set('status', currentStatus);
  if (currentType) params.set('type', currentType);
  const rows = await api.get(`/bookings?${params.toString()}`);
  const tbody = document.getElementById('bookings-tbody');
  const empty = document.getElementById('bookings-empty');
  tbody.innerHTML = '';
  if (!rows.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  for (const b of rows) {
    const tr = document.createElement('tr');
    tr.className = 'is-clickable';
    tr.addEventListener('click', () => openDetail(b.id));
    tr.innerHTML = `
      <td>${b.photographer_name}</td>
      <td><span class="badge badge--${b.type}">${typeLabel(b.type)}</span></td>
      <td>${b.shoot_date}</td>
      <td>${b.start_time ?? ''}${b.start_time ? '–' + b.end_time : ''}</td>
      <td><span class="pipeline-chip is-current">${PIPELINE_LABELS[b.pipeline_stage]}</span></td>
      <td><span class="badge badge--${b.status}">${statusLabel(b.status)}</span></td>
      <td>${b.type === 'commission' ? paymentBadge(b.payment_status) : '<span class="form-hint">—</span>'}</td>
    `;
    tbody.appendChild(tr);
  }
}

function paymentBadge(status) {
  const map = {
    not_required: ['—', ''],
    awaiting_deposit: ['等待預約金', 'badge--pending'],
    deposit_paid: ['預約金已付', 'badge--accepted'],
    payment_expired: ['付款逾期', 'badge--rejected'],
    balance_paid: ['已結清', 'badge--accepted']
  };
  const [label, cls] = map[status] || [status, ''];
  return cls ? `<span class="badge ${cls}">${label}</span>` : `<span class="form-hint">${label}</span>`;
}

const detailModal = document.getElementById('detail-modal');
const detailBody = document.getElementById('detail-body');

async function openDetail(id) {
  const b = await api.get(`/bookings/${id}`);
  detailBody.innerHTML = renderDetail(b);
  wireDetail(b);
  detailModal.classList.add('is-open');
}

const PAYMENT_LABELS = {
  not_required: '不需要付款（互惠）',
  awaiting_deposit: '等待預約金',
  deposit_paid: '預約金已支付',
  payment_expired: '付款逾期',
  balance_paid: '尾款已支付'
};
const CANCELLATION_LABELS = {
  cancelled_by_model: '本人取消',
  cancelled_by_photographer: '攝影師取消',
  refund_pending: '退款處理中',
  refunded: '已退款'
};

function money(n) { return n === null || n === undefined ? '—' : `NT$${Number(n).toLocaleString()}`; }

function renderPaymentSection(b) {
  if (b.type !== 'commission') return '';
  const dueCountdown = b.payment_status === 'awaiting_deposit' && b.deposit_due_at
    ? `<div class="form-hint" id="deposit-countdown" data-due="${b.deposit_due_at}" style="margin-top:6px;"></div>`
    : '';
  return `
    <div class="field" style="margin-top:24px;">
      <label>付款狀態</label>
      <div class="field-row" style="margin-top:6px;">
        <div><div class="form-hint">拍攝總額</div><div>${money(b.quote_amount)}</div></div>
        <div><div class="form-hint">預約金 30%</div><div>${money(b.deposit_amount)}</div></div>
      </div>
      <div class="field-row">
        <div><div class="form-hint">尾款</div><div>${money(b.balance_amount)}</div></div>
        <div><div class="form-hint">狀態</div><div><span class="badge badge--pending">${PAYMENT_LABELS[b.payment_status] || b.payment_status}</span></div></div>
      </div>
      ${dueCountdown}
      ${b.deposit_paid_at ? `<div class="form-hint">收款時間：${b.deposit_paid_at}</div>` : ''}
      ${b.balance_paid_at ? `<div class="form-hint">尾款支付時間：${b.balance_paid_at}</div>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        ${b.status === 'accepted' && b.payment_status === 'awaiting_deposit' ? `<button class="btn btn--sm" id="confirm-deposit-btn">確認收到預約金</button>` : ''}
        ${b.payment_status === 'payment_expired' ? `<button class="btn btn--outline btn--sm" id="reopen-payment-btn">重新開放付款</button>` : ''}
        ${b.payment_status === 'deposit_paid' ? `<button class="btn btn--outline btn--sm" id="balance-paid-btn" ${b.balance_paid_at ? 'disabled' : ''}>標記尾款已支付</button>` : ''}
      </div>
    </div>
  `;
}

function renderCancellationSection(b) {
  const canCancel = b.status === 'accepted' && b.cancellation_status === 'none';
  if (!canCancel && b.cancellation_status === 'none') return '';
  return `
    <div class="field" style="margin-top:24px;">
      <label>取消 / 退款</label>
      ${b.cancellation_status === 'none' ? `
        <div style="display:flex; gap:8px;">
          <button class="btn btn--danger btn--sm" id="cancel-by-model-btn">本人取消（全額退還）</button>
          <button class="btn btn--danger btn--sm" id="cancel-by-photographer-btn">攝影師取消</button>
        </div>
      ` : `
        <div><span class="badge badge--rejected">${CANCELLATION_LABELS[b.cancellation_status] || b.cancellation_status}</span></div>
        <div class="form-hint" style="margin-top:6px;">應退金額：${money(b.refund_amount)}${b.cancellation_reason ? ` ・ ${b.cancellation_reason}` : ''}</div>
        ${b.cancellation_status === 'refund_pending' ? `<button class="btn btn--outline btn--sm" id="mark-refunded-btn" style="margin-top:8px;">標記已退款</button>` : ''}
      `}
    </div>
  `;
}

function renderRescheduleSection(b) {
  if (!b.reschedule_requested_slot_id) return '';
  const s = b.reschedule_requested_slot;
  return `
    <div class="field" style="margin-top:24px; padding:14px; border:1px solid var(--gold); border-radius:8px;">
      <label>${b.reschedule_count > 0 ? '再次改期申請' : '改期申請'}</label>
      <div style="margin:6px 0;">申請新時段：${s ? `${s.date} ${s.start_time}–${s.end_time}` : '—'}</div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn--sm" id="approve-reschedule-btn">接受改期</button>
        <button class="btn btn--outline btn--sm" id="reject-reschedule-btn">拒絕改期</button>
      </div>
    </div>
  `;
}

function renderDetail(b) {
  const pipelineSteps = PIPELINE_ORDER.map((stage) => `
    <button type="button" class="pipeline-chip ${stage === b.pipeline_stage ? 'is-current' : ''}" data-stage="${stage}">${PIPELINE_LABELS[stage]}</button>
  `).join('');

  return `
    <div class="field-row">
      <div class="field"><label>攝影師</label><div>${b.photographer_name}${b.photographer_contact ? ` · ${b.photographer_contact}` : ''}</div></div>
      <div class="field"><label>類型</label><div><span class="badge badge--${b.type}">${typeLabel(b.type)}</span></div></div>
    </div>
    <div class="field-row">
      <div class="field"><label>拍攝日期／時段</label><div>${b.shoot_date} ${b.start_time ?? ''}${b.start_time ? '–' + b.end_time : ''}</div></div>
      <div class="field"><label>地點</label><div>${b.location || '—'}</div></div>
    </div>
    <div class="field-row">
      <div class="field"><label>拍攝風格</label><div>${b.style_category || '—'}</div></div>
      <div class="field"><label>指定服裝</label><div>${b.wardrobe_item_name ? `${b.wardrobe_item_no} · ${b.wardrobe_item_name}` : '—'}</div></div>
    </div>
    <div class="field"><label>拍攝用途</label><div>${b.purpose || '—'}</div></div>

    <div class="field-row">
      <div class="field"><label>報價</label><input id="edit-quote" type="number" value="${b.quote_amount ?? ''}" ${b.type === 'mutual' ? 'disabled' : ''}></div>
      <div class="field"><label>拍攝時數</label><input id="edit-hours" type="number" step="0.5" value="${b.shoot_hours ?? ''}"></div>
    </div>
    <div class="field"><label>後台備註</label><textarea id="edit-notes">${b.admin_notes ?? ''}</textarea></div>
    <label class="checkbox-row"><input type="checkbox" id="edit-public" ${b.is_public_experience ? 'checked' : ''}> 顯示在前台「資歷」頁</label>
    <button class="btn btn--outline btn--sm" id="save-fields-btn" style="margin-top:12px;">儲存變更</button>

    <div class="field" style="margin-top:24px;">
      <label>狀態</label>
      <div style="display:flex; gap:8px;">
        <button class="btn ${b.status === 'accepted' ? '' : 'btn--outline'}" id="accept-btn" ${b.status !== 'pending' ? 'disabled' : ''}>接受</button>
        <button class="btn btn--danger" id="reject-btn" ${b.status !== 'pending' ? 'disabled' : ''}>拒絕</button>
        <span class="badge badge--${b.status}" style="align-self:center;">${statusLabel(b.status)}</span>
      </div>
    </div>

    <div class="field">
      <label>拍攝進度</label>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">${pipelineSteps}</div>
    </div>

    ${b.attachments?.length ? `<div class="field"><label>附件</label><div style="font-size:12px; color:var(--ink-faint);">${b.attachments.length} 個檔案</div></div>` : ''}

    ${renderPaymentSection(b)}
    ${renderRescheduleSection(b)}
    ${renderCancellationSection(b)}
  `;
}

function wireDetail(b) {
  document.getElementById('accept-btn').addEventListener('click', async () => {
    const result = await api.patch(`/bookings/${b.id}/status`, { status: 'accepted' });
    if (result.calendarSync && !result.calendarSync.synced && result.calendarSync.reason !== 'not_configured') {
      alert(`邀約已接受，但寫入行事曆失敗：${result.calendarSync.reason}`);
    }
    closeDetail(); loadBookings();
  });
  document.getElementById('reject-btn').addEventListener('click', async () => {
    await api.patch(`/bookings/${b.id}/status`, { status: 'rejected' });
    closeDetail(); loadBookings();
  });
  document.querySelectorAll('#detail-body [data-stage]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.patch(`/bookings/${b.id}/pipeline`, { pipeline_stage: btn.dataset.stage });
      openDetail(b.id); loadBookings();
    });
  });
  document.getElementById('save-fields-btn').addEventListener('click', async () => {
    const quote = document.getElementById('edit-quote').value;
    const hours = document.getElementById('edit-hours').value;
    const notes = document.getElementById('edit-notes').value;
    const isPublic = document.getElementById('edit-public').checked;
    await api.patch(`/bookings/${b.id}`, {
      quote_amount: quote === '' ? null : Number(quote),
      shoot_hours: hours === '' ? null : Number(hours),
      admin_notes: notes,
      is_public_experience: isPublic
    });
    loadBookings();
  });

  document.getElementById('confirm-deposit-btn')?.addEventListener('click', async () => {
    try {
      const result = await api.post(`/bookings/${b.id}/confirm-deposit`, {});
      if (result.calendarSync && !result.calendarSync.synced && result.calendarSync.reason !== 'not_configured') {
        alert(`已確認收款，但寫入行事曆失敗：${result.calendarSync.reason}`);
      }
    } catch (err) {
      alert('確認失敗：這個時段可能已被其他預約鎖定');
    }
    openDetail(b.id); loadBookings();
  });
  document.getElementById('reopen-payment-btn')?.addEventListener('click', async () => {
    await api.post(`/bookings/${b.id}/reopen-payment`, {});
    openDetail(b.id); loadBookings();
  });
  document.getElementById('balance-paid-btn')?.addEventListener('click', async () => {
    await api.post(`/bookings/${b.id}/balance-paid`, {});
    openDetail(b.id); loadBookings();
  });

  document.getElementById('cancel-by-model-btn')?.addEventListener('click', async () => {
    if (!confirm('確定要以「本人取消」處理嗎？預約金將全額退還。')) return;
    const reason = prompt('取消原因（選填）') || '';
    const result = await api.post(`/bookings/${b.id}/cancel`, { cancelled_by: 'model', reason });
    if (result.calendarSync?.deleted === false && result.calendarSync?.reason !== 'not_found' && result.calendarSync?.reason !== 'not_configured') {
      alert(`已取消，但行事曆事件移除失敗：${result.calendarSync.reason}`);
    }
    openDetail(b.id); loadBookings();
  });
  document.getElementById('cancel-by-photographer-btn')?.addEventListener('click', async () => {
    if (!confirm('確定要以「攝影師取消」處理嗎？退款金額將依取消政策自動計算。')) return;
    const reason = prompt('取消原因（選填）') || '';
    const result = await api.post(`/bookings/${b.id}/cancel`, { cancelled_by: 'photographer', reason });
    if (result.calendarSync?.deleted === false && result.calendarSync?.reason !== 'not_found' && result.calendarSync?.reason !== 'not_configured') {
      alert(`已取消，但行事曆事件移除失敗：${result.calendarSync.reason}`);
    }
    openDetail(b.id); loadBookings();
  });
  document.getElementById('mark-refunded-btn')?.addEventListener('click', async () => {
    await api.post(`/bookings/${b.id}/mark-refunded`, {});
    openDetail(b.id); loadBookings();
  });

  document.getElementById('approve-reschedule-btn')?.addEventListener('click', async () => {
    try {
      const result = await api.post(`/bookings/${b.id}/reschedule/approve`, {});
      if (result.calendarSync && !result.calendarSync.synced && result.calendarSync.reason !== 'not_configured') {
        alert(`改期已核准，但行事曆更新失敗：${result.calendarSync.reason}`);
      }
    } catch (err) {
      alert('核准失敗：新時段可能已被其他預約鎖定');
    }
    openDetail(b.id); loadBookings();
  });
  document.getElementById('reject-reschedule-btn')?.addEventListener('click', async () => {
    await api.post(`/bookings/${b.id}/reschedule/reject`, {});
    openDetail(b.id); loadBookings();
  });

  const countdownEl = document.getElementById('deposit-countdown');
  if (countdownEl) {
    const tick = () => {
      const diff = new Date(countdownEl.dataset.due).getTime() - Date.now();
      if (diff <= 0) { countdownEl.textContent = '已超過付款期限（重新整理以更新狀態）'; return; }
      const h = String(Math.floor(diff / 3.6e6)).padStart(2, '0');
      const m = String(Math.floor((diff % 3.6e6) / 6e4)).padStart(2, '0');
      const s = String(Math.floor((diff % 6e4) / 1000)).padStart(2, '0');
      countdownEl.textContent = `剩餘付款時間 ${h}:${m}:${s}`;
    };
    tick();
    setInterval(tick, 1000);
  }
}

function closeDetail() { detailModal.classList.remove('is-open'); }
document.getElementById('detail-close').addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetail(); });

// NEW BOOKING MODAL
const newModal = document.getElementById('new-modal');
document.getElementById('new-booking-btn').addEventListener('click', async () => {
  const slots = await api.get('/availability');
  const select = document.getElementById('new-slot-select');
  const openSlots = slots.filter((s) => s.is_open && s.lock_status === 'open');
  select.innerHTML = openSlots.length
    ? openSlots.map((s) => `<option value="${s.id}">${s.date} ${s.start_time}–${s.end_time}</option>`).join('')
    : '<option value="">目前沒有開放中的時段</option>';
  newModal.classList.add('is-open');
});
document.getElementById('new-close').addEventListener('click', () => newModal.classList.remove('is-open'));
newModal.addEventListener('click', (e) => { if (e.target === newModal) newModal.classList.remove('is-open'); });

document.getElementById('new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorBox = document.getElementById('new-form-error');
  errorBox.style.display = 'none';
  try {
    await api.post('/bookings', {
      type: form.get('type'),
      slot_id: Number(form.get('slot_id')),
      photographer_name: form.get('photographer_name'),
      photographer_contact: form.get('photographer_contact') || null,
      quote_amount: form.get('quote_amount') ? Number(form.get('quote_amount')) : null,
      shoot_hours: form.get('shoot_hours') ? Number(form.get('shoot_hours')) : null,
      admin_notes: form.get('admin_notes') || null
    });
    newModal.classList.remove('is-open');
    e.target.reset();
    loadBookings();
  } catch (err) {
    errorBox.textContent = err.data?.error === 'slot_locked' ? '這個時段已被鎖定，無法新增邀約' : '建立失敗，請確認欄位';
    errorBox.style.display = 'block';
  }
});

// deep-link from dashboard: bookings.html?id=3
const params = new URLSearchParams(window.location.search);
if (params.get('id')) openDetail(params.get('id'));

loadBookings();
