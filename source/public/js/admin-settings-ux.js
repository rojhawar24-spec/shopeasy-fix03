/* ShopEasy 2.8.71: reliable, accessible feedback for the settings form. */
(() => {
  'use strict';
  const form = document.querySelector('[data-settings-form]');
  if (!form) return;
  const state = form.querySelector('[data-save-state]');
  const help = form.querySelector('[data-save-help]');
  const button = form.querySelector('[data-save-button]');
  if (!state || !help || !button) return;

  let submitting = false;
  const signature = () => {
    const parts = [];
    for (const [key, value] of new FormData(form).entries()) {
      if (key === '_csrf') continue;
      // Keep field boundaries explicit: a literal '&field=' inside a policy or
      // business name must not hide a real change to a different field.
      parts.push([key, typeof value === 'string' ? value : value.name]);
    }
    return JSON.stringify(parts);
  };
  const initialSignature = signature();
  const hasServerError = Boolean(document.querySelector('.form-page [role="alert"]'));
  const savedBanner = document.querySelector('.form-page .success-alert');
  const update = () => {
    if (submitting) return;
    const dirty = signature() !== initialSignature;
    state.textContent = dirty ? 'Unsaved changes' : (hasServerError ? 'Save needs attention' : 'All changes saved');
    help.textContent = dirty ? 'Select Save settings to store your updates.' : 'You can save a draft before checkout is ready.';
    button.textContent = 'Save settings';
    form.dataset.dirty = dirty ? 'true' : 'false';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    if (submitting) { event.preventDefault(); return; }
    if (!form.reportValidity()) { event.preventDefault(); return; }
    submitting = true;
    button.disabled = true;
    button.textContent = 'Saving…';
    state.textContent = 'Saving settings…';
    help.textContent = 'Saving your settings now. Keep this page open until the save finishes.';
    form.setAttribute('aria-busy', 'true');
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    // Back/Forward can restore the exact submitted document without rerunning
    // this script. Restore controls while retaining its unsaved-change baseline.
    submitting = false;
    button.disabled = false;
    form.removeAttribute('aria-busy');
    update();
  });
  window.addEventListener('beforeunload', event => {
    if (form.dataset.dirty === 'true' && !submitting) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  if (savedBanner) {
    savedBanner.setAttribute('tabindex', '-1');
    // Do not steal focus from a user who is navigating with assistive technology.
  }
  update();
})();
