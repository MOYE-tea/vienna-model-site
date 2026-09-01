async function loadStyleGallery() {
  const items = await api.get('/style-gallery');
  const grid = document.getElementById('style-grid');
  const empty = document.getElementById('style-empty');
  grid.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card__media"><img src="/uploads/${item.file_path}" style="width:100%;height:100%;object-fit:cover;"></div>
      <div class="item-card__body">
        <div class="item-card__title">${item.style_name}</div>
        <div class="item-card__meta">${item.description || '—'}</div>
      </div>
      <div class="item-card__actions">
        <button class="btn btn--danger btn--sm delete-btn" style="width:100%; justify-content:center;">刪除</button>
      </div>
    `;
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`刪除「${item.style_name}」？`)) { await api.del(`/style-gallery/${item.id}`); loadStyleGallery(); }
    });
    grid.appendChild(card);
  }
}

const modal = document.getElementById('item-modal');
document.getElementById('new-item-btn').addEventListener('click', () => modal.classList.add('is-open'));
document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('is-open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });

document.getElementById('item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api.post('/style-gallery', fd);
  modal.classList.remove('is-open');
  e.target.reset();
  loadStyleGallery();
});

loadStyleGallery();
