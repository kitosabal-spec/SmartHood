'use strict';
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
let contactCalls = 0;
function pubScrollTo(event, section) {
  contactCalls++;
  if (document.body.style.position === 'fixed') throw new Error('contact called before unlock');
  document.getElementById(section).scrollIntoView({ behavior: 'smooth' });
}
document.addEventListener('DOMContentLoaded', async () => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const landing = document.getElementById('landingPage');
    const modal = document.getElementById('publicFAQModal');
    const trigger = document.getElementById('publicFAQButton');
    const root = document.getElementById('publicFAQ');
    const close = modal.querySelector('.faq-modal-close');
    const contact = root.querySelector('.faq-contact button');
    const portal = document.getElementById('contentArea');
    initializePublicFAQ(); // Initialization must be idempotent.
    const beforeStyle = document.body.getAttribute('style') || '';
    window.scrollTo({ top: 500, behavior: 'instant' });
    await settle();
    const rect = trigger.getBoundingClientRect();
    const spacing = innerWidth <= 560 ? 16 : 24;
    check(Math.abs(rect.left - spacing) < 1 && Math.abs(innerHeight - rect.bottom - spacing) < 1, 'fixed lower-left position');
    check(getComputedStyle(trigger).position === 'fixed', 'fixed positioning');
    trigger.click();
    check(modal.open && document.body.style.position === 'fixed', 'opens and locks page');
    check(document.activeElement === close, 'initial keyboard focus');
    check(root.querySelectorAll('.faq-question').length === 28, 'public question count');
    check(root.querySelectorAll('.faq-categories button').length === 8, 'all eight filters');
    const input = root.querySelector('input');
    input.value = '  15 MINUTES ';
    input.dispatchEvent(new Event('input'));
    check(root.querySelectorAll('.faq-question').length === 1, 'case-insensitive answer search');
    root.querySelector('[data-category="Billing and Payments"]').click();
    check(root.querySelector('.faq-empty') && root.querySelector('.faq-count').textContent === '0 matching questions', 'combined filter and count');
    root.querySelector('.faq-clear').click();
    check(root.querySelectorAll('.faq-question').length === 28 && input.value === '', 'clear both filters');
    check(root.querySelector('[data-category=""]').getAttribute('aria-pressed') === 'true', 'category selection');
    input.value = '<img src=x onerror=alert(1)>';
    input.dispatchEvent(new Event('input'));
    check(!root.querySelector('img'), 'safe search text');
    root.querySelector('.faq-clear').click();
    const first = root.querySelector('.faq-question');
    first.click();
    check(first.getAttribute('aria-expanded') === 'true', 'accordion opens');
    check(document.getElementById(first.getAttribute('aria-controls')).getAttribute('aria-hidden') === 'false', 'answer accessible');
    first.click();
    check(first.getAttribute('aria-expanded') === 'false', 'accordion closes');
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    check(document.activeElement === contact, 'reverse focus trap');
    contact.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    check(document.activeElement === close, 'forward focus trap');
    await document.fonts.ready;
    await settle();
    const bounds = modal.getBoundingClientRect();
    check(bounds.left >= 15 && bounds.right <= innerWidth - 15 && bounds.top >= 0 && bounds.bottom <= innerHeight, 'modal fits viewport');
    check(root.scrollHeight > root.clientHeight, 'content scrolls internally');
    check(root.scrollWidth <= root.clientWidth, 'no modal horizontal overflow');
    check(document.documentElement.scrollWidth <= innerWidth, 'no page horizontal overflow');
    close.click();
    check(!modal.open && document.activeElement === trigger, 'close button returns focus');
    check(window.scrollY === 500, 'restores exact previous scroll position');
    check((document.body.getAttribute('style') || '') === beforeStyle, 'restores original body styles');
    for (let i = 0; i < 3; i++) {
      trigger.click();
      input.value = 'payment';
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      check(!modal.open && document.activeElement === trigger && window.scrollY === 500, 'Escape cancel and repeated openings');
    }
    trigger.click();
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    check(!modal.open, 'native cancel dismissal');
    input.value = '';
    trigger.click();
    modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    modal.click();
    check(!modal.open && window.scrollY === 500, 'backdrop dismissal');
    trigger.click();
    await settle();
    check(document.body.style.position === 'fixed', 'rapid reopen remains locked');
    check(root.scrollTop === 0, 'reopening starts at the title');
    contact.click();
    check(!modal.open && document.body.style.position !== 'fixed' && contactCalls === 1, 'contact closes once and scrolls');
    await new Promise(resolve => setTimeout(resolve, 1100));
    check(Math.abs(document.getElementById('contact').getBoundingClientRect().top) < 2, 'contact smooth scroll completes');
    trigger.click();
    landing.classList.add('hidden');
    await settle();
    check(!modal.open && document.body.style.position !== 'fixed' && !trigger.getClientRects().length, 'auth transition hides trigger and unlocks');
    portal.classList.remove('hidden');
    for (let i = 0; i < 3; i++) renderFAQ(portal, 'portal', { role: 'admin' });
    check(portal.querySelectorAll('.faq-question').length === 28, 'staff portal unchanged');
    const portalFirst = portal.querySelector('.faq-question');
    portalFirst.click();
    check(portalFirst.getAttribute('aria-expanded') === 'true', 'no duplicated portal handlers');
    check(first.getAttribute('aria-expanded') === 'false', 'independent public state');
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    check(new Set(ids).size === ids.length, 'unique public and portal IDs');
    for (const button of document.querySelectorAll('.faq-question')) {
      check(document.getElementById(button.getAttribute('aria-controls')), 'matching answer ID');
    }
    check(errors.length === 0, `JavaScript errors: ${errors.join('; ')}`);
    parent.postMessage({ type: 'faq-check', result: `PASS ${document.body.dataset.testLabel}: search, categories, accordion, focus, dismissal, scroll restore, contact, auth, rerenders, layout, no JS errors` }, parent.location.origin);
  } catch (error) {
    parent.postMessage({ type: 'faq-check', result: `FAIL ${document.body.dataset.testLabel}: ${error.message}` }, parent.location.origin);
  }
});
