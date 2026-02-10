(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Mobile nav
  const toggle = $('[data-nav-toggle]');
  const panel = $('[data-nav-panel]');
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const isOpen = panel.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close after clicking
    $$('a', panel).forEach(a => a.addEventListener('click', () => {
      panel.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // Footer year
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  // Reveal on scroll (lightweight)
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });

    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }
})();
