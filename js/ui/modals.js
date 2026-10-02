import { escapeHtml } from './safeHtml.js';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  `[tabindex]:not([tabindex='-1'])`
].join(',');

let cleanupActiveModal = null;
let returnFocusTo = null;

export function openModal({ title, body, actions = [] }) {
  closeModal({ restoreFocus: false });
  const root = document.querySelector('#modal-root');
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.innerHTML = `<div class='modal-backdrop'><section class='modal panel' role='dialog' aria-modal='true' aria-labelledby='modal-title' tabindex='-1'>
    <h2 id='modal-title'></h2><div class='modal__body'></div>
    <div class='button-row'>
      ${actions.map((action, index) => `<button class='button ${action.primary ? 'primary' : ''}' data-action='${index}'>${escapeHtml(action.label)}</button>`).join('')}
      <button class='button' data-close>CLOSE</button>
    </div>
  </section></div>`;

  const dialog = root.querySelector('.modal');
  root.querySelector('#modal-title').textContent = String(title ?? '');
  root.querySelector('.modal__body').innerHTML = String(body ?? '');
  root.querySelector('[data-close]').onclick = () => closeModal();
  root.querySelector('.modal-backdrop').onclick = event => {
    if (event.target.classList.contains('modal-backdrop')) closeModal();
  };
  actions.forEach((action, index) => {
    root.querySelector(`[data-action='${index}']`).onclick = () => action.handler?.(dialog);
  });

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(element => element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  cleanupActiveModal = () => document.removeEventListener('keydown', onKeyDown);
  dialog.querySelector(focusableSelector)?.focus() || dialog.focus();
}

export function closeModal(options = {}) {
  cleanupActiveModal?.();
  cleanupActiveModal = null;
  document.querySelector('#modal-root').innerHTML = '';
  if (options.restoreFocus !== false && returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}
