const slotsGrid = document.getElementById('slots-grid');
const slotsDateLabel = document.getElementById('slots-date-label');
const bookCta = document.getElementById('book-cta');

document.querySelectorAll('.cal-day.avail').forEach((day) => {
  day.style.cursor = 'pointer';
  day.addEventListener('click', () => {
    document.querySelectorAll('.cal-day').forEach((d) => d.style.outline = 'none');
    day.style.outline = '2px solid var(--gold)';
    slotsDateLabel.textContent = `${day.dataset.date} · 開放時段`;
    slotsGrid.style.display = 'grid';
    bookCta.style.display = 'none';
    slotsGrid.querySelectorAll('.slot-btn').forEach((btn) => btn.classList.remove('is-selected'));
  });
});

if (slotsGrid) {
  slotsGrid.querySelectorAll('.slot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      slotsGrid.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      bookCta.style.display = 'inline-flex';
    });
  });
}
