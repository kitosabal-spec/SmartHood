'use strict';

const FAQ_OFFICER_CATEGORY = 'Administrator and HOA Officers';

function getFAQItems(location, user) {
  // Public visitors can read all general guidance, including officer responsibilities.
  if (location === 'public') return FAQ_ITEMS;
  const staff = user && (user.role === 'admin' ||
    (user.permissions || []).some(permission => permission !== 'resident'));
  return FAQ_ITEMS.filter(item => item.category !== FAQ_OFFICER_CATEGORY ||
    (location === 'portal' && staff));
}

function filterFAQItems(items, query, category) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(item => (!category || item.category === category) &&
    `${item.question} ${item.answer}`.toLocaleLowerCase().includes(search));
}

function renderFAQ(container, location, user = null, onContact = null) {
  const items = getFAQItems(location, user);
  const prefix = `faq-${location}`;
  const root = document.createElement('div');
  root.className = 'faq-component';
  // Only static markup is interpolated; all FAQ and search text uses textContent.
  root.innerHTML = `
    <header class="faq-heading">
      <h2 id="${prefix}-heading"></h2>
      <p id="${prefix}-description"></p>
    </header>
    <label class="faq-search-label" for="${prefix}-search">Search frequently asked questions</label>
    <div class="faq-search-row">
      <input type="search" id="${prefix}-search" placeholder="Search frequently asked questions"
        aria-describedby="${prefix}-count" autocomplete="off">
      <button type="button" class="btn btn-secondary faq-clear">Clear search</button>
    </div>
    <div class="faq-categories" role="group" aria-label="FAQ categories"></div>
    <p class="faq-count" id="${prefix}-count" role="status" aria-live="polite" aria-atomic="true"></p>
    <div class="faq-list"></div>
    <aside class="faq-contact">
      <svg width="28" height="28" aria-hidden="true"><use href="#ico-mail"/></svg>
      <div><h3>Still need help?</h3><p></p></div>
    </aside>`;
  root.querySelector('h2').textContent = location === 'public'
    ? 'Frequently Asked Questions' : 'How can we help?';
  root.querySelector('.faq-heading p').textContent = location === 'public'
    ? 'Find answers to common questions about SmartHood and the services available to San Alfonso Homes residents.'
    : 'Find answers about your account, payments, bookings, complaints, and other SmartHood services.';
  const contact = root.querySelector('.faq-contact');
  contact.querySelector('p').textContent = location === 'public'
    ? 'If your concern is not answered here, contact the San Alfonso Homes Association office for assistance.'
    : 'Visit the HOA office at San Alfonso Homes, Pacol, Naga City for account assistance or official record corrections. Have your registered email and any relevant transaction reference ready. Never share your password.';
  if (location === 'public') {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'btn btn-primary';
    link.textContent = 'Contact HOA';
    link.addEventListener('click', event => {
      if (onContact) onContact();
      else pubScrollTo(event, 'contact');
    });
    contact.appendChild(link);
  }

  const input = root.querySelector('input');
  const categories = root.querySelector('.faq-categories');
  const list = root.querySelector('.faq-list');
  let category = '';
  const expanded = new Set();

  function updateResults() {
    const matches = filterFAQItems(items, input.value, category);
    root.querySelector('.faq-count').textContent =
      `${matches.length} matching ${matches.length === 1 ? 'question' : 'questions'}`;
    list.replaceChildren();
    for (const item of matches) {
      const article = document.createElement('article');
      article.className = 'faq-item';
      const heading = document.createElement('h3');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'faq-question';
      button.id = `${prefix}-${item.id}-button`;
      button.setAttribute('aria-controls', `${prefix}-${item.id}-answer`);
      button.setAttribute('aria-expanded', String(expanded.has(item.id)));
      button.dataset.question = item.id;
      button.textContent = item.question;
      const panel = document.createElement('div');
      panel.id = `${prefix}-${item.id}-answer`;
      panel.className = 'faq-answer';
      panel.setAttribute('aria-labelledby', button.id);
      panel.setAttribute('aria-hidden', String(!expanded.has(item.id)));
      const inner = document.createElement('div');
      const answer = document.createElement('p');
      answer.textContent = item.answer;
      inner.appendChild(answer);
      panel.appendChild(inner);
      heading.appendChild(button);
      article.append(heading, panel);
      list.appendChild(article);
    }
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'faq-empty';
      empty.textContent = 'No questions match your search. Try a different keyword or choose All Questions. Clear search resets both filters.';
      list.appendChild(empty);
    }
    categories.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    });
  }

  for (const name of ['', ...new Set(items.map(item => item.category))]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = name;
    button.textContent = name || 'All Questions';
    categories.appendChild(button);
  }
  categories.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    category = button.dataset.category;
    updateResults();
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('.faq-question');
    if (!button) return;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.parentElement.nextElementSibling.setAttribute('aria-hidden', String(!open));
    if (open) expanded.add(button.dataset.question);
    else expanded.delete(button.dataset.question);
  });
  input.addEventListener('input', updateResults);
  root.querySelector('.faq-clear').addEventListener('click', () => {
    input.value = '';
    category = '';
    updateResults();
    input.focus();
  });
  updateResults();
  // Listeners belong to this fresh root and are discarded with it on rerender.
  container.replaceChildren(root);
}

function renderFAQView() {
  openPortalFAQ();
}

document.addEventListener('DOMContentLoaded', () => {
  initializePublicFAQ();
  initializePortalFAQ();
  document.getElementById('sidebarFAQ')?.addEventListener('click', event => openPortalFAQ(event.currentTarget));
});

let portalFAQController = null;

function initializePortalFAQ() {
  const modal = document.getElementById('portalFAQModal');
  const content = document.getElementById('portalFAQ');
  if (!modal || !content || portalFAQController) return;
  const closeButton = modal.querySelector('.faq-modal-close');
  let returnFocus = null;
  let bodyStyles = null;

  function restorePage() {
    if (bodyStyles) {
      for (const [property, value, priority] of bodyStyles) {
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      }
      bodyStyles = null;
    }
    if (returnFocus?.getClientRects().length) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function close() {
    if (modal.open) modal.close();
    restorePage();
  }

  function open(trigger = null) {
    if (modal.open || !currentUser || !restoreSession()) return;
    returnFocus = trigger || document.activeElement;
    renderFAQ(content, 'portal', currentUser);
    const properties = ['overflow', 'padding-right'];
    bodyStyles = properties.map(property => [property, document.body.style.getPropertyValue(property),
      document.body.style.getPropertyPriority(property)]);
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${padding + scrollbar}px`;
    modal.showModal();
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  closeButton.addEventListener('click', close);
  modal.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  modal.addEventListener('close', () => {
    if (!modal.open) restorePage();
  });
  let backdropPress = false;
  modal.addEventListener('pointerdown', event => { backdropPress = event.target === modal; });
  modal.addEventListener('click', event => {
    if (event.target === modal && backdropPress) close();
    backdropPress = false;
  });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
      event.preventDefault();
      first.focus();
    }
  });
  new MutationObserver(() => {
    if (modal.open && document.getElementById('appShell')?.classList.contains('hidden')) close();
  }).observe(document.getElementById('appShell'), { attributes: true, attributeFilter: ['class'] });
  portalFAQController = { open, close };
}

function openPortalFAQ(trigger = null) {
  initializePortalFAQ();
  portalFAQController?.open(trigger);
}

function closePortalFAQ() {
  portalFAQController?.close();
}

function initializePublicFAQ() {
  const landing = document.getElementById('landingPage');
  const trigger = document.getElementById('publicFAQButton');
  const modal = document.getElementById('publicFAQModal');
  const content = document.getElementById('publicFAQ');
  if (!landing || !trigger || !modal || !content || modal.dataset.initialized) return;
  modal.dataset.initialized = 'true';
  const closeButton = modal.querySelector('.faq-modal-close');
  let scrollState = null;

  function restorePage() {
    if (!scrollState) return;
    const { x, y, styles } = scrollState;
    scrollState = null;
    for (const [property, value, priority] of styles) {
      if (value) document.body.style.setProperty(property, value, priority);
      else document.body.style.removeProperty(property);
    }
    // Explicit instant scrolling overrides the site's smooth-scroll preference.
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    if (trigger.getClientRects().length) trigger.focus({ preventScroll: true });
  }

  function closeFAQ() {
    if (modal.open) modal.close();
    restorePage();
  }

  function openFAQ() {
    if (modal.open || !trigger.getClientRects().length) return;
    const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'];
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    scrollState = {
      x: window.scrollX,
      y: window.scrollY,
      styles: properties.map(property => [property, document.body.style.getPropertyValue(property),
        document.body.style.getPropertyPriority(property)]),
    };
    const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    Object.assign(document.body.style, {
      position: 'fixed', top: `${-scrollState.y}px`, left: `${-scrollState.x}px`,
      width: '100%', overflow: 'hidden', paddingRight: `${padding + scrollbar}px`,
    });
    modal.showModal(); // Native top layer also makes the rest of the page inert.
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  renderFAQ(content, 'public', null, () => {
    closeFAQ();
    pubScrollTo(null, 'contact');
  });
  // Register once for the lifetime of the page, never on each opening.
  trigger.addEventListener('click', openFAQ);
  closeButton.addEventListener('click', closeFAQ);
  modal.addEventListener('cancel', event => {
    event.preventDefault();
    closeFAQ();
  });
  modal.addEventListener('close', () => {
    // A queued close event from an earlier opening must not unlock a reopened modal.
    if (!modal.open) restorePage();
  });
  let backdropPress = false;
  modal.addEventListener('pointerdown', event => { backdropPress = event.target === modal; });
  modal.addEventListener('click', event => {
    if (event.target === modal && backdropPress) closeFAQ();
    backdropPress = false;
  });
  modal.addEventListener('keydown', event => {
    // Search inputs otherwise consume the first Escape to clear their value.
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFAQ();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
      event.preventDefault();
      first.focus();
    }
  });
  // Authentication and legal-page transitions must never leave the page locked.
  new MutationObserver(() => {
    if (modal.open && !trigger.getClientRects().length) closeFAQ();
  }).observe(landing, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
}

// Shared static content for the public and authenticated FAQ views.
const FAQ_ITEMS = [
  {
    "id": "question-1",
    "category": "General",
    "question": "What is SmartHood?",
    "answer": "SmartHood is the official web-based resident management system of San Alfonso Homes. It allows homeowners to view bills, submit payment proof, receive announcements, file complaints, book amenities, register vehicles, report lost or found items, and access other HOA services online."
  },
  {
    "id": "question-2",
    "category": "General",
    "question": "Who can use SmartHood?",
    "answer": "SmartHood can be used by registered homeowners, the system administrator, and authorized HOA officers. Available functions depend on the user’s account role and assigned permissions."
  },
  {
    "id": "question-3",
    "category": "General",
    "question": "Can I view information without signing in?",
    "answer": "Yes. Public announcements, approved lost-and-found posts, Board of Directors information, and HOA contact details can be viewed from the public landing page. Personal records and transactions require a registered account."
  },
  {
    "id": "question-4",
    "category": "Account and Login",
    "question": "How do I create a SmartHood account?",
    "answer": "Homeowners cannot register themselves directly. The HOA administrator must verify the official homeowner record and register the account using the homeowner’s email address and other required information."
  },
  {
    "id": "question-5",
    "category": "Account and Login",
    "question": "What should I use to sign in?",
    "answer": "Use the email address registered by the HOA administrator together with your SmartHood password."
  },
  {
    "id": "question-6",
    "category": "Account and Login",
    "question": "What should I do if I forget my password?",
    "answer": "Select Forgot password? on the login page and enter your registered email address. SmartHood will send a password-reset link if the email belongs to an active account."
  },
  {
    "id": "question-7",
    "category": "Account and Login",
    "question": "How long is the password-reset link valid?",
    "answer": "The password-reset link expires 15 minutes after it is requested. If it expires, request a new link."
  },
  {
    "id": "question-8",
    "category": "Account and Login",
    "question": "What should I do if I do not receive the reset email?",
    "answer": "Check the spam or junk folder and confirm that the registered email address was entered correctly. If the message still does not arrive, contact the HOA office to verify the account."
  },
  {
    "id": "question-9",
    "category": "Billing and Payments",
    "question": "Where can I see my bills?",
    "answer": "Sign in and select My Bills. This section displays assigned bills, original amounts, approved payments, remaining balances, due dates, and payment statuses."
  },
  {
    "id": "question-10",
    "category": "Billing and Payments",
    "question": "How do I submit a payment?",
    "answer": "Open Pay Now, select the applicable billing period, enter the payment amount, follow the displayed GCash instructions, and submit the GCash reference number and a clear receipt image."
  },
  {
    "id": "question-11",
    "category": "Billing and Payments",
    "question": "Can I make a partial payment?",
    "answer": "Yes. A homeowner may enter an amount lower than the remaining balance. The balance is reduced only after the payment is reviewed and approved."
  },
  {
    "id": "question-12",
    "category": "Billing and Payments",
    "question": "Why has my balance not changed after submitting a payment?",
    "answer": "A submitted payment remains pending while it is being verified. Pending payments do not reduce the balance. The balance changes only after approval."
  },
  {
    "id": "question-13",
    "category": "Billing and Payments",
    "question": "Why was my payment rejected?",
    "answer": "A payment may be rejected because of an incorrect amount, invalid or duplicate reference number, unreadable receipt, or transaction information that does not match. Review the rejection reason before submitting again."
  },
  {
    "id": "question-14",
    "category": "Billing and Payments",
    "question": "Can I pay more than my remaining balance?",
    "answer": "No. SmartHood prevents a submitted payment from exceeding the remaining balance."
  },
  {
    "id": "question-15",
    "category": "Billing and Payments",
    "question": "Where can I view my previous payments?",
    "answer": "Select Payment History to review submitted amounts, reference numbers, payment dates, and approval or rejection statuses."
  },
  {
    "id": "question-16",
    "category": "Amenity Bookings",
    "question": "How do I book an HOA amenity?",
    "answer": "Select Book Amenities, choose the amenity and preferred date, provide the required information, and submit the request."
  },
  {
    "id": "question-17",
    "category": "Amenity Bookings",
    "question": "Is a submitted booking automatically approved?",
    "answer": "No. A submitted booking remains pending until the administrator or an authorized HOA officer approves or rejects it."
  },
  {
    "id": "question-18",
    "category": "Amenity Bookings",
    "question": "How will I know if my booking was approved or rejected?",
    "answer": "Check the current status in the amenity-booking section. SmartHood can also send booking status updates to your registered email when email delivery is configured."
  },
  {
    "id": "question-19",
    "category": "Community Services",
    "question": "How do I file a complaint?",
    "answer": "Select File a Complaint, choose a category, provide the date and description, attach supporting files when necessary, and submit the form."
  },
  {
    "id": "question-20",
    "category": "Community Services",
    "question": "Can I track my complaint?",
    "answer": "Yes. The homeowner can view whether the complaint is reviewed, in progress, resolved, or rejected and can read the HOA response."
  },
  {
    "id": "question-21",
    "category": "Community Services",
    "question": "Are complaints anonymous?",
    "answer": "No. Complaints are connected to the homeowner’s account so authorized HOA personnel can review the concern and respond appropriately."
  },
  {
    "id": "question-22",
    "category": "Community Services",
    "question": "How do I register a vehicle?",
    "answer": "Open My Vehicles, enter the required vehicle and ownership information, and submit the registration. The HOA will review and update its registration, payment, and sticker-release status."
  },
  {
    "id": "question-23",
    "category": "Community Services",
    "question": "How do I report a lost or found item?",
    "answer": "Open Lost & Found, select whether the item was lost or found, provide its description, location, date, contact information, and an image when available. The report may require HOA approval before becoming publicly visible."
  },
  {
    "id": "question-24",
    "category": "Notifications and Profile",
    "question": "Where can I see my notifications?",
    "answer": "Select the bell icon in the top navigation bar. Notifications may include new bills, payment decisions, complaint responses, announcements, and other account activity. Check the amenity-booking section for booking status."
  },
  {
    "id": "question-25",
    "category": "Notifications and Profile",
    "question": "How do I update my personal information?",
    "answer": "Open My Profile to view or update the information permitted by the system. Contact the HOA office if an official homeowner record requires correction."
  },
  {
    "id": "question-26",
    "category": "Administrator and HOA Officers",
    "question": "What is the difference between an administrator and an authorized HOA officer?",
    "answer": "The administrator has full system access. An authorized HOA officer can access only the modules and functions assigned by the administrator."
  },
  {
    "id": "question-27",
    "category": "Administrator and HOA Officers",
    "question": "Can an HOA officer access every module?",
    "answer": "No. Officer access is permission-based. For example, an officer may be permitted to verify payments without receiving access to account management or system settings."
  },
  {
    "id": "question-28",
    "category": "Administrator and HOA Officers",
    "question": "Who can approve payments, bookings, complaints, and other requests?",
    "answer": "The administrator can manage all supported transactions. Authorized HOA officers may process transactions only when the required module permission is assigned to their accounts."
  }
];
