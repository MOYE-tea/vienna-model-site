async function loadWardrobe() {
  const items = await api.get('/wardrobe');
  const grid = document.getElementById('wardrobe-grid');
  const empty = document.getElementById('wardrobe-empty');
  grid.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const thumb = item.images?.[0] ? `<img src="/uploads/${item.images[0].file_path}" style="width:100%;height:100%;object-fit:cover;">` : '[無照片]';
    card.innerHTML = `
      <div class="item-card__media">${thumb}</div>
      <div class="item-card__body">
        <div class="item-card__title">${item.item_no} · ${item.name}</div>
        <div class="item-card__meta">${item.category || '—'} ・ ${item.is_available ? '可用' : '不可用'}</div>
      </div>
      <div class="item-card__actions">
        <button class="btn btn--outline btn--sm edit-btn">編輯</button>
        <button class="btn btn--danger btn--sm delete-btn">刪除</button>
      </div>
    `;
    card.querySelector('.edit-btn').addEventListener('click', () => openModal(item));
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`刪除 ${item.item_no}？`)) { await api.del(`/wardrobe/${item.id}`); loadWardrobe(); }
    });
    grid.appendChild(card);
  }
}

const modal = document.getElementById('item-modal');
const form = document.getElementById('item-form');

function openModal(item) {
  document.getElementById('modal-title').textContent = item ? '編輯衣服' : '新增衣服';
  form.reset();
  form.id.value = item?.id || '';
  if (item) {
    form.item_no.value = item.item_no;
    form.name.value = item.name;
    form.category.value = item.category || '';
    form.is_available.value = item.is_available ? '1' : '0';
    form.notes.value = item.notes || '';
  }
  modal.classList.add('is-open');
}

document.getElementById('new-item-btn').addEventListener('click', () => openModal(null));
document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('is-open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = form.id.value;
  const payload = {
    item_no: form.item_no.value,
    name: form.name.value,
    category: form.category.value || null,
    is_available: form.is_available.value === '1',
    notes: form.notes.value || null
  };
  try {
    const saved = id ? await api.patch(`/wardrobe/${id}`, payload) : await api.post('/wardrobe', payload);
    const files = document.getElementById('item-images').files;
    if (files.length) {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      await api.post(`/wardrobe/${saved.id}/images`, fd);
    }
    modal.classList.remove('is-open');
    loadWardrobe();
  } catch (err) {
    alert(err.data?.error === 'item_no_exists' ? '這個編號已經存在' : '儲存失敗');
  }
});

loadWardrobe();
