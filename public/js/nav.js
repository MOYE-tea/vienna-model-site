const siteNav = document.querySelector('.site-nav');
if (siteNav) {
  const onScroll = () => siteNav.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const menuToggle = document.querySelector('.site-nav__mobile-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
if (menuToggle && mobileMenu) {
  const menuClose = mobileMenu.querySelector('.mobile-menu__close');
  menuToggle.addEventListener('click', () => mobileMenu.classList.add('is-open'));
  if (menuClose) menuClose.addEventListener('click', () => mobileMenu.classList.remove('is-open'));
  mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => mobileMenu.classList.remove('is-open')));
}
