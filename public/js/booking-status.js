const params = new URLSearchParams(window.location.search);
const token = params.get('ref');
const root = document.getElementById('status-root');

function money(n) { return n === null || n === undefined ? '—' : `NT$${Number(n).toLocaleString()}`; }

function countdownText(dueAtIso) {
  const diff = new Date(dueAtIso).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const h = String(Math.floor(diff / 3.6e6)).padStart(2, '0');
  const m = String(Math.floor((diff % 3.6e6) / 6e4)).padStart(2, '0');
  const s = String(Math.floor((diff % 6e4) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function rescheduleFormHtml() {
  return `
    <div class="policy-block" style="margin-top:24px;">
      <span class="section-label">申請改期</span>
      <p class="form-hint" style="margin:8px 0 14px;">允許一次免費改期；拍攝日前 72 小時以上提出，原預約金直接轉移至新日期。送出後需經本人確認。</p>
      <div class="form-field" style="margin-bottom:12px;"><select id="reschedule-slot"><option value="">載入可約時段中…</option></select></div>
      <button class="btn btn--outline" id="reschedule-submit">送出改期申請</button>
      <div class="placeholder" id="reschedule-msg" style="margin-top:10px;"></div>
    </div>
  `;
}

async function wireRescheduleForm(data) {
  const select = document.getElementById('reschedule-slot');
  if (!select) return;
  const slots = await (await fetch('/api/public/availability')).json();
  const open = slots.filter((s) => s.available);
  select.innerHTML = open.length
    ? open.map((s) => `<option value="${s.id}">${s.date}　${s.start_time}–${s.end_time}</option>`).join('')
    : '<option value="">目前沒有其他開放時段</option>';

  document.getElementById('reschedule-submit').addEventListener('click', async () => {
    const msg = document.getElementById('reschedule-msg');
    const slotId = select.value;
    if (!slotId) { msg.textContent = '請先選擇新時段'; return; }
    const res = await fetch(`/api/public/booking-status/${token}/reschedule-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_slot_id: Number(slotId) })
    });
    if (res.ok) { render(); } else { msg.textContent = '送出失敗，請稍後再試'; }
  });
}

function render(data) {
  if (!data) return;

  let html = '';

  if (data.reschedule_requested) {
    html += `<div class="disclaimer" style="margin-bottom:24px;">改期申請已送出，待本人確認新時段。</div>`;
  }

  if (data.cancellation_status !== 'none') {
    const labels = {
      cancelled_by_model: '本人取消', cancelled_by_photographer: '已取消',
      refund_pending: '取消・退款處理中', refunded: '取消・已完成退款'
    };
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">${labels[data.cancellation_status] || '已取消'}</h1>
        ${data.refund_amount ? `<p class="status-hero__sub">應退預約金 ${money(data.refund_amount)}${data.cancellation_status === 'refunded' ? '（已退款）' : '，將由本人盡快處理退款'}</p>` : '<p class="status-hero__sub">此預約無應退金額。</p>'}
      </div>`;
    root.innerHTML = html;
    return;
  }

  if (data.status === 'pending') {
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">待確認</h1>
        <p class="status-hero__sub">預約申請已送出，需經本人確認後才會進入${data.type === 'commission' ? '預約金付款程序' : '正式成立'}，目前尚未正式成立。</p>
      </div>`;
    root.innerHTML = html;
    return;
  }

  if (data.status === 'rejected') {
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">邀約未成立</h1>
        <p class="status-hero__sub">很抱歉，這次邀約未能成立。歡迎查看可約時段重新提出申請。</p>
      </div>`;
    root.innerHTML = html;
    return;
  }

  // status === 'accepted' from here on
  if (data.type === 'mutual' || data.payment_status === 'deposit_paid' || data.payment_status === 'balance_paid') {
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">預約成立</h1>
        <p class="status-hero__sub">${data.type === 'commission' ? '已完成預約金付款，此拍攝時段已為您保留。' : '邀約已接受，此拍攝時段已為您保留。'}</p>
      </div>
      <dl class="summary-list">
        <div class="summary-list__row"><dt>日期</dt><dd>${data.shoot_date}</dd></div>
        <div class="summary-list__row"><dt>時間</dt><dd>${data.start_time || ''}${data.start_time ? '–' + data.end_time : '—'}</dd></div>
        <div class="summary-list__row"><dt>地點</dt><dd>${data.location || '—'}</dd></div>
        <div class="summary-list__row"><dt>拍攝風格</dt><dd>${data.style_category || '—'}</dd></div>
        <div class="summary-list__row"><dt>服裝</dt><dd>${data.wardrobe_item_name || '—'}</dd></div>
        <div class="summary-list__row"><dt>攝影師</dt><dd>${data.photographer_name}</dd></div>
        ${data.type === 'commission' ? `
        <div class="summary-list__row"><dt>拍攝總額</dt><dd>${money(data.quote_amount)}</dd></div>
        <div class="summary-list__row"><dt>已支付預約金</dt><dd>${money(data.deposit_amount)}</dd></div>
        <div class="summary-list__row"><dt>拍攝當日尾款</dt><dd>${money(data.balance_amount)}</dd></div>` : ''}
      </dl>
      ${data.type === 'commission' && !data.reschedule_requested ? rescheduleFormHtml() : ''}
    `;
    root.innerHTML = html;
    if (data.type === 'commission' && !data.reschedule_requested) wireRescheduleForm(data);
    return;
  }

  if (data.payment_status === 'awaiting_deposit') {
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">邀約已接受・等待預約金</h1>
        <p class="status-hero__sub">請於期限內完成預約金付款，時段才會正式為您保留。</p>
      </div>
      <div class="countdown-box" style="justify-content:center;">
        <span class="countdown-box__value" id="countdown">${countdownText(data.deposit_due_at)}</span>
        <span class="countdown-box__label">內完成付款</span>
      </div>
      <div class="payment-summary" style="display:flex;">
        <span class="section-label">付款摘要</span>
        <div class="payment-summary__row"><span class="payment-summary__label">拍攝費用</span><span class="payment-summary__value">${money(data.quote_amount)}</span></div>
        <div class="payment-summary__row"><span class="payment-summary__label">預約金 30%</span><span class="payment-summary__value is-accent">${money(data.deposit_amount)}</span></div>
        <div class="payment-summary__row is-total"><span class="payment-summary__label">拍攝當日尾款</span><span class="payment-summary__value">${money(data.balance_amount)}</span></div>
        <p class="payment-summary__note">預約金將計入拍攝總費用，並非額外收費。付款方式請見下方，完成轉帳後本人確認收款即完成預約。</p>
      </div>
      <div class="policy-block">
        <span class="section-label">付款方式</span>
        <p class="policy-block__text">[銀行轉帳資訊待補 — 戶名 / 銀行 / 帳號]\n轉帳後請截圖聯絡本人 Instagram 或 Email 告知，待確認收款後即完成預約。</p>
      </div>
    `;
    root.innerHTML = html;
    setInterval(() => {
      const el = document.getElementById('countdown');
      if (el) el.textContent = countdownText(data.deposit_due_at);
    }, 1000);
    return;
  }

  if (data.payment_status === 'payment_expired') {
    html += `
      <div class="status-hero">
        <span class="status-hero__label">BOOKING STATUS</span>
        <h1 class="status-hero__title">付款逾期</h1>
        <p class="status-hero__sub">很抱歉，預約金付款已超過 24 小時期限，此時段已重新開放。如仍想預約，請重新送出申請，或聯絡本人重新開放付款。</p>
      </div>`;
    root.innerHTML = html;
    return;
  }

  root.innerHTML = `<p class="placeholder" style="text-align:center;">狀態載入異常，請重新整理或聯絡本人。</p>`;
}

async function load() {
  if (!token) {
    root.innerHTML = '<p class="placeholder" style="text-align:center;">找不到預約參考編號，請確認連結是否完整。</p>';
    return;
  }
  try {
    const res = await fetch(`/api/public/booking-status/${token}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    render(data);
  } catch {
    root.innerHTML = '<p class="placeholder" style="text-align:center;">找不到這筆預約，請確認連結是否正確。</p>';
  }
}

load();
