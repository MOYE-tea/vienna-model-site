const trackCommissionBtn = document.getElementById('track-commission');
const trackMutualBtn = document.getElementById('track-mutual');
const trackHint = document.getElementById('track-hint');
const quoteField = document.getElementById('quote-field');
const portfolioHint = document.getElementById('portfolio-hint');
const portfolioInput = document.getElementById('portfolio_samples');
const paymentSummary = document.getElementById('payment-summary');
const cancellationBlock = document.getElementById('cancellation-policy-block');
const agreePolicyField = document.getElementById('agree-policy-field');
const agreePolicyInput = document.getElementById('agree_policy');
const quoteInput = document.getElementById('quote_amount');

const hints = {
  commission: '委託拍攝：符合下方拍攝規範並議定報價即可送出。',
  mutual: '互惠合作：需先提供作品集與拍攝企劃，經審核通過後才會確認。'
};

let currentTrack = 'commission';

function calcDeposit(total) {
  if (!total || total <= 0) return { deposit: null, balance: null };
  const raw = total * 0.3;
  const rounded = Math.round(raw / 100) * 100;
  const deposit = Math.max(rounded, 500);
  return { deposit: Math.min(deposit, total), balance: total - Math.min(deposit, total) };
}

function updatePaymentSummary() {
  if (currentTrack !== 'commission') { paymentSummary.style.display = 'none'; return; }
  const total = Number(quoteInput.value);
  if (!total) { paymentSummary.style.display = 'none'; return; }
  const { deposit, balance } = calcDeposit(total);
  document.getElementById('ps-total').textContent = `NT$${total.toLocaleString()}`;
  document.getElementById('ps-deposit').textContent = `NT$${deposit.toLocaleString()}`;
  document.getElementById('ps-balance').textContent = `NT$${balance.toLocaleString()}`;
  const opt = document.getElementById('slot_id').selectedOptions[0];
  document.getElementById('ps-hours').textContent = opt?.dataset.range || '—';
  paymentSummary.style.display = 'flex';
}
quoteInput.addEventListener('input', updatePaymentSummary);

function setTrack(track) {
  currentTrack = track;
  const isCommission = track === 'commission';
  trackCommissionBtn.classList.toggle('is-active', isCommission);
  trackMutualBtn.classList.toggle('is-active', !isCommission);
  trackHint.textContent = hints[track];
  quoteField.style.display = isCommission ? '' : 'none';
  cancellationBlock.style.display = isCommission ? 'block' : 'none';
  agreePolicyField.style.display = isCommission ? 'flex' : 'none';
  agreePolicyInput.required = isCommission;
  portfolioInput.required = !isCommission;
  portfolioHint.textContent = isCommission
    ? '委託拍攝為選填，互惠合作為必填（將由本人審核作品與企劃）'
    : '互惠合作必填，將由本人審核作品與企劃後決定是否接受';
  updatePaymentSummary();
}

trackCommissionBtn.addEventListener('click', () => setTrack('commission'));
trackMutualBtn.addEventListener('click', () => setTrack('mutual'));

// load real open slots, style options, wardrobe options, and cancellation/reschedule policy text
async function loadFormData() {
  const slotSelect = document.getElementById('slot_id');
  try {
    const slots = await (await fetch('/api/public/availability')).json();
    const open = slots.filter((s) => s.available);
    slotSelect.innerHTML = open.length
      ? open.map((s) => `<option value="${s.id}" data-range="${s.start_time}–${s.end_time}">${s.date}　${s.start_time}–${s.end_time}</option>`).join('')
      : '<option value="">目前沒有開放中的時段，請洽詢本人</option>';
  } catch {
    slotSelect.innerHTML = '<option value="">載入時段失敗，請重新整理</option>';
  }

  try {
    const styles = await (await fetch('/api/public/style-gallery')).json();
    const styleSelect = document.getElementById('style_category');
    for (const s of styles) {
      const opt = document.createElement('option');
      opt.value = s.style_name;
      opt.textContent = `${s.style_name}${s.description ? ' · ' + s.description : ''}`;
      styleSelect.appendChild(opt);
    }
  } catch { /* style list is a nicety, ignore failure */ }

  try {
    const items = await (await fetch('/api/public/wardrobe')).json();
    const wardrobeSelect = document.getElementById('wardrobe_item_id');
    for (const w of items) {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `${w.item_no} · ${w.name}`;
      wardrobeSelect.appendChild(opt);
    }
  } catch { /* wardrobe list is a nicety, ignore failure */ }

  try {
    const rules = await (await fetch('/api/public/rules')).json();
    document.getElementById('cancellation-policy-text').textContent = rules.cancellation_policy_text || '';
  } catch { /* keep block empty if this fails */ }

  // arriving from Availability / Style Gallery / Wardrobe with a pre-selected choice
  const params = new URLSearchParams(window.location.search);
  if (params.get('slot')) document.getElementById('slot_id').value = params.get('slot');
  if (params.get('style')) document.getElementById('style_category').value = params.get('style');
  if (params.get('wardrobe')) document.getElementById('wardrobe_item_id').value = params.get('wardrobe');
  updatePaymentSummary();
}
document.getElementById('slot_id').addEventListener('change', updatePaymentSummary);
loadFormData();

document.getElementById('booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('submit-error');
  const submitBtn = document.getElementById('submit-btn');
  errorBox.style.display = 'none';

  const form = document.getElementById('booking-form');
  const fd = new FormData(form);
  fd.set('type', currentTrack);

  submitBtn.disabled = true;
  submitBtn.textContent = '送出中…';
  try {
    const res = await fetch('/api/public/bookings', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      const messages = {
        slot_locked: '這個時段已經被預約，請重新選擇時段',
        slot_unavailable: '這個時段目前無法預約，請重新選擇時段',
        portfolio_required_for_mutual: '互惠合作需要提供作品集（上傳檔案或填寫連結）',
        missing_fields: '請確認必填欄位都已填寫'
      };
      throw new Error(messages[data.error] || '送出失敗，請稍後再試');
    }
    form.style.display = 'none';
    document.getElementById('status-link').href = `booking-status.html?ref=${data.access_token}`;
    document.getElementById('confirm-box').style.display = 'block';
    document.getElementById('confirm-box').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '送出邀約';
  }
});
