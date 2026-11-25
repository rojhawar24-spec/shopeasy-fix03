(() => {
  const toggle = document.querySelector('[data-password-toggle]');
  if (toggle) {
    const password = document.getElementById(toggle.getAttribute('aria-controls'));
    if (password) {
      const labels = JSON.parse(toggle.dataset.labels);
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const visible = password.type === 'password';
        password.type = visible ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(visible));
        toggle.textContent = visible ? labels.hide : labels.show;
      });
      // Restore the private view when returning to this page from browser history.
      window.addEventListener('pagehide', () => {
        password.type = 'password';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.textContent = labels.show;
      });
    }
  }
  document.querySelector('[data-auth-error]')?.focus();
})();
