async function loadPortfolio() {
  const items = await api.get('/portfolio');
  const grid = document.getElementById('portfolio-grid');
  const empty = document.getElementById('portfolio-empty');
  grid.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card__media">
        <img src="/uploads/${item.file_path}" style="width:100%;height:100%;object-fit:cover;">
        ${item.is_public ? '<span class="item-card__public-flag">前台顯示中</span>' : ''}
      </div>
      <div class="item-card__body">
        <div class="item-card__title">${item.category || '未分類'}</div>
        <div class="item-card__meta">${item.caption || '—'}</div>
      </div>
      <div class="item-card__actions">
        <button class="btn btn--outline btn--sm toggle-btn">${item.is_public ? '從前台移除' : '加入前台'}</button>
        <button class="btn btn--danger btn--sm delete-btn">刪除</button>
      </div>
    `;
    card.querySelector('.toggle-btn').addEventListener('click', async () => {
      await api.patch(`/portfolio/${item.id}/toggle-public`, {});
      loadPortfolio();
    });
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('刪除這張作品？')) { await api.del(`/portfolio/${item.id}`); loadPortfolio(); }
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
  if (!fd.get('is_public')) fd.set('is_public', '0'); else fd.set('is_public', '1');
  await api.post('/portfolio', fd);
  modal.classList.remove('is-open');
  e.target.reset();
  loadPortfolio();
});

loadPortfolio();
