'use strict';

const LEGAL_POLICY_VERSION = '2026-10-06';
const LEGAL_EFFECTIVE_DATE = 'October 6, 2026';

const LEGAL_DOCUMENTS = {
  terms: {
    path: '/terms-and-conditions',
    title: 'Terms & Conditions',
    eyebrow: 'SmartHood Legal',
    intro: 'These Terms & Conditions explain the rules for using the SmartHood resident management system for San Alfonso Homes.',
    content: `
      <section><h2>1. Acceptance of Terms</h2><p>By accessing or using SmartHood, you agree to follow these Terms & Conditions and applicable laws, rules, and homeowners’ association policies. If you do not agree, do not use the system. Where an administrator creates an account for a homeowner, the administrator must confirm that the homeowner was given an opportunity to review and accept these terms.</p></section>
      <section><h2>2. Purpose of SmartHood</h2><p>SmartHood supports community administration for San Alfonso Homes. It provides tools for resident records, billing, payments, announcements, complaints, vehicle registration, lost and found reports, amenity reservations, notifications, and related association services. SmartHood does not replace official HOA resolutions, receipts, contracts, or legal notices when a separate official document is required.</p></section>
      <section><h2>3. User Accounts</h2><p>Accounts are intended for authorized homeowners, residents, HOA officers, administrators, and approved personnel. You may use only the account assigned to you. The HOA may require reasonable information to confirm your identity, residence, role, or authority before creating or maintaining an account.</p></section>
      <section><h2>4. Account Security and Password Responsibility</h2><p>You are responsible for keeping your password confidential and for activity performed through your account. Use a strong, unique password, do not share it, and sign out on shared devices. Notify the HOA promptly if you suspect unauthorized access. SmartHood uses reasonable safeguards, but no online system can guarantee absolute security.</p></section>
      <section><h2>5. Accuracy of User Information</h2><p>You must provide information that is accurate, complete, and current. Update your profile or contact the HOA when your contact, property, vehicle, or other relevant details change. The HOA may ask for supporting documents and may correct verified errors in association records.</p></section>
      <section><h2>6. Billing and Monthly Association Dues</h2><p>SmartHood may display monthly association dues, special assessments, reservation charges, vehicle-related fees, and other authorized charges. Amounts, due dates, penalties, and adjustments are based on applicable HOA rules and approved records. If a displayed balance appears incorrect, contact the HOA before relying on it.</p></section>
      <section><h2>7. Online and Administrator-Recorded Payments</h2><p>Residents may submit payment details and proof through available payment channels. Authorized administrators may also record payments received through approved offline or in-person methods. A submission or system entry is not, by itself, final confirmation that a payment was received, cleared, or correctly applied.</p></section>
      <section><h2>8. Payment Verification and Approval or Rejection</h2><p>Payments may remain pending while the HOA checks the amount, payer, reference number, receipt, billing period, and payment channel. The HOA may approve, reject, or request clarification for incomplete, duplicate, altered, unreadable, or inconsistent submissions. Residents remain responsible for resolving rejected or underpaid amounts. Keep the original receipt or transaction record until the payment is confirmed.</p></section>
      <section><h2>9. Announcements and Notifications</h2><p>SmartHood may show or send community announcements, billing reminders, status updates, emergency notices, and other service messages. Delivery may depend on internet access, device settings, email or SMS providers, and current contact information. Check official HOA channels when a matter is urgent or legally time-sensitive.</p></section>
      <section><h2>10. Complaints</h2><p>You may use SmartHood to submit community complaints and supporting files. Provide truthful, relevant, and respectful information. Do not include unnecessary personal information about other people. Submitting a complaint does not guarantee a particular decision, response time, or outcome. The HOA may contact involved persons and keep records needed to evaluate and resolve the matter.</p></section>
      <section><h2>11. Vehicle Registration</h2><p>Vehicle details submitted through SmartHood must be accurate and relate to a valid community access or registration request. Registration in the system does not automatically grant entry, parking rights, a sticker, or approval. HOA rules, document checks, fees, and security procedures still apply.</p></section>
      <section><h2>12. Lost & Found</h2><p>Lost and found posts are community reports. SmartHood and the HOA do not guarantee the accuracy of a post, recovery of an item, or ownership of an item. Do not publish sensitive personal information. Claimants may be required to provide proof of ownership or other verification.</p></section>
      <section><h2>13. Amenity Reservations</h2><p>Reservation requests are subject to availability, HOA approval, applicable fees, facility rules, and scheduling limits. A submitted request is not final until approved. The HOA may reject, reschedule, or cancel a reservation for maintenance, safety, emergencies, rule violations, or other legitimate community needs.</p></section>
      <section><h2>14. Prohibited Activities</h2><p>You must not:</p><ul><li>access another person’s account or data without authority;</li><li>submit false, misleading, unlawful, threatening, defamatory, discriminatory, or abusive content;</li><li>upload malware, harmful code, forged records, or files you have no right to share;</li><li>probe, disrupt, overload, bypass, reverse engineer, or interfere with the system or its security controls;</li><li>use information from SmartHood for harassment, unauthorized marketing, fraud, or an unrelated purpose; or</li><li>copy, alter, or disclose private resident, payment, complaint, or administrative records without authorization.</li></ul></section>
      <section><h2>15. Proper Use of the System</h2><p>Use SmartHood only for legitimate community and association purposes. Follow instructions, respect other users, upload only necessary files, and verify important information before acting on it. You are responsible for content you submit and for having the right to submit it.</p></section>
      <section><h2>16. Administrator Responsibilities</h2><p>Administrators must use their access only for authorized HOA duties, apply approvals and rejections fairly, protect confidential information, keep records reasonably accurate, and follow applicable HOA policies and privacy requirements. Administrative access may be monitored and recorded in audit logs.</p></section>
      <section><h2>17. System Availability and Maintenance</h2><p>SmartHood may be unavailable during maintenance, upgrades, internet or hosting interruptions, emergencies, or events outside reasonable control. Features may be changed, limited, or temporarily suspended. SmartHood does not guarantee uninterrupted, error-free, or always-available service.</p></section>
      <section><h2>18. Account Suspension or Deactivation</h2><p>The HOA may suspend, restrict, or deactivate an account when reasonably necessary for security, inactivity, loss of eligibility, misuse, a policy violation, an unresolved identity issue, or protection of the system and its users. Where appropriate, the user may contact the HOA to ask about the action or request correction of an error.</p></section>
      <section><h2>19. Changes to the Terms</h2><p>These terms may be updated to reflect legal, operational, security, or service changes. The updated version and date will be posted in SmartHood. Material changes may also be announced through available HOA channels. Continued use after an updated version takes effect means you agree to the revised terms, to the extent permitted by law.</p></section>
      <section><h2>20. Limitation of Liability</h2><p>To the extent permitted by Philippine law, the HOA, SmartHood operators, and authorized service providers are not liable for indirect, incidental, or consequential loss arising from system downtime, delayed notifications, third-party services, user error, unauthorized conduct, or inaccurate user-submitted information. Nothing in these terms excludes responsibility that cannot lawfully be excluded, including liability arising from fraud, willful misconduct, or obligations imposed by applicable law.</p></section>
      <section><h2>21. Contact Information</h2><p>Questions about these terms may be directed to the San Alfonso Homes HOA office.</p><div class="legal-contact-placeholder"><strong>Before production deployment, the HOA must complete:</strong><br>Official HOA email: [INSERT OFFICIAL HOA EMAIL]<br>Official HOA phone: [INSERT OFFICIAL HOA PHONE NUMBER]<br>Office address: San Alfonso Homes, Pacol, Naga City, Camarines Sur, Philippines</div></section>
      <section><h2>22. Effective Date and Last Updated</h2><p><strong>Effective date:</strong> ${LEGAL_EFFECTIVE_DATE}<br><strong>Last updated:</strong> ${LEGAL_EFFECTIVE_DATE}<br><strong>Version:</strong> ${LEGAL_POLICY_VERSION}</p></section>
    `,
  },
  privacy: {
    path: '/privacy-policy',
    title: 'Privacy Policy',
    eyebrow: 'SmartHood Privacy',
    intro: 'This Privacy Policy explains how personal information is collected, used, accessed, protected, retained, and handled in SmartHood.',
    content: `
      <section><h2>1. Scope and Privacy Principles</h2><p>This policy applies to SmartHood’s processing of personal information for San Alfonso Homes. SmartHood is intended to be operated in line with Republic Act No. 10173, the Data Privacy Act of 2012, its Implementing Rules and Regulations, and relevant issuances of the National Privacy Commission. Personal information should be processed transparently, for declared and legitimate purposes, and only to an extent that is adequate, relevant, suitable, necessary, and not excessive.</p></section>
      <section><h2>2. Information We Collect</h2><p>Depending on the services you use and your role, SmartHood may collect or store:</p><ul><li>full name, address or home information, block, lot, and homeowner or resident details;</li><li>phone number, email address, username, account role, and account status;</li><li>password credentials stored as one-way password hashes, not readable plain-text passwords;</li><li>profile photo;</li><li>vehicle information, such as owner, plate number, type, registration status, sticker details, and related remarks;</li><li>billing records, balances, dues, charges, dates, and account assignments;</li><li>payment records, amounts, status, dates, methods, reference numbers, administrator-recorded entries, and verification details;</li><li>payment screenshots, receipts, or other proof of payment;</li><li>complaints, descriptions, responses, status, dates, and uploaded attachments;</li><li>lost and found reports, contact details supplied for a report, images, status, and claim information;</li><li>amenity reservations, dates, times, purpose, status, and remarks;</li><li>announcements, comments, notifications, delivery-related information, and dismissed or read status; and</li><li>system activity and audit records, such as sign-ins, administrative actions, approvals, rejections, updates, and security events.</li></ul><p>Some information may be provided by you, by an authorized household representative, or by authorized HOA personnel performing official duties.</p></section>
      <section><h2>3. How We Use Personal Information</h2><p>Personal information may be used to:</p><ul><li>create, authenticate, secure, and manage resident and administrator accounts;</li><li>maintain homeowner, household, address, and contact records;</li><li>calculate, assign, display, and administer billing and monthly association dues;</li><li>record, match, verify, approve, reject, and audit online or administrator-recorded payments;</li><li>send important account, billing, service, community, and security notifications;</li><li>receive, assess, route, respond to, and document complaints;</li><li>manage vehicle registration, access, payment, and sticker records;</li><li>manage lost and found reports and appropriate contact between relevant parties;</li><li>receive, schedule, approve, reject, and administer amenity reservations;</li><li>respond to support, correction, access, and privacy requests;</li><li>maintain security, prevent misuse, investigate incidents, and preserve audit trails; and</li><li>meet lawful HOA governance, accounting, recordkeeping, dispute, and regulatory obligations.</li></ul><p>Processing will rely on an appropriate basis under applicable law, which may include consent where required, performance of HOA services or obligations, compliance with law, protection of lawful rights and interests, or other grounds permitted by the Data Privacy Act.</p></section>
      <section><h2>4. Payment Information</h2><p>SmartHood may store payment amounts, dates, methods, reference numbers, receipt images, billing links, review status, rejection reasons, and the identity of authorized personnel who recorded or verified a payment. SmartHood is not intended to collect card PINs, online banking passwords, e-wallet passwords, one-time passwords, or complete payment-account credentials. Never upload or send those secrets through SmartHood. Payment proof may be reviewed only by authorized personnel who need it for verification, accounting, dispute handling, or audit.</p></section>
      <section><h2>5. Uploaded Files</h2><p>Uploaded profile photos, payment receipts, complaint attachments, and other files may contain personal or sensitive information. Upload only what is relevant and necessary. Remove or cover unrelated account numbers, balances, identification numbers, faces, or third-party details when they are not needed. Private uploads are intended to be stored outside public web folders and delivered only through authorization-checked system routes. Public announcement, board, or approved lost and found media may be visible more broadly as part of community-facing features.</p></section>
      <section><h2>6. Email and SMS Notifications</h2><p>SmartHood may use your email address or phone number for account messages, password reset links, billing notices, payment or request status updates, community announcements, and security alerts. Messages may pass through configured email, SMS, telecommunications, or hosting providers. Delivery cannot be guaranteed and may be delayed or blocked by a provider, device, network, or incorrect contact information. Avoid replying with passwords, one-time passwords, or unnecessary personal information.</p></section>
      <section><h2>7. Information Sharing and Access</h2><p>Access is limited according to role and legitimate HOA duties. Residents generally access their own account and relevant community information. Authorized administrators and personnel may access records needed for billing, payment review, complaints, reservations, vehicle management, notifications, security, support, and audit. Information may also be disclosed:</p><ul><li>to contracted service providers that support hosting, database, email, SMS, storage, maintenance, or security, subject to appropriate safeguards and instructions;</li><li>to banks, e-wallet providers, auditors, accountants, insurers, counsel, or other parties when necessary for an authorized transaction or legitimate HOA function;</li><li>when required by law, court order, lawful government request, or regulatory obligation;</li><li>to investigate or respond to fraud, security incidents, threats, or legal claims; or</li><li>with the data subject’s authorization or another lawful basis.</li></ul><p>SmartHood does not authorize the sale of resident personal information or its use for unrelated advertising.</p></section>
      <section><h2>8. Data Security</h2><p>The HOA and system operators should use reasonable and appropriate organizational, physical, and technical safeguards based on the nature of the information and relevant risks. These may include role-based access, password hashing, protected sessions, private-file authorization, access logging, backups, software updates, staff confidentiality, and incident-response procedures. No system or transmission method is absolutely secure, and SmartHood does not promise absolute security. Users also help protect information by securing passwords and devices and promptly reporting suspected misuse.</p></section>
      <section><h2>9. Data Retention</h2><p>Personal information should be kept only as long as necessary for the declared purpose, legitimate HOA administration, accounting and audit requirements, dispute handling, security, backup recovery, or a period required or allowed by law. Retention periods may differ by record type. When information is no longer needed, it should be securely deleted, anonymized, or disposed of under the HOA’s approved retention schedule. Deactivating an account does not automatically erase records that the HOA must lawfully or reasonably retain.</p></section>
      <section><h2>10. User and Data Subject Rights</h2><p>Subject to the conditions and limits in the Data Privacy Act and other applicable law, a data subject may have the right to be informed, object to certain processing, access personal information, correct inaccurate or incomplete information, request erasure or blocking, obtain data portability where applicable, withdraw consent where processing depends on consent, and seek indemnification or file a complaint. Requests may require identity and authority verification. Some requests may be limited when information must be retained or processed under law or for the establishment, exercise, or defense of legal claims.</p></section>
      <section><h2>11. Account and Information Updates</h2><p>You may update available profile fields in SmartHood or ask authorized HOA personnel to correct information you cannot edit. Certain homeowner, property, billing, payment, audit, or verified transaction records may require supporting documents and administrative review. Notify the HOA promptly when your contact or account information changes.</p></section>
      <section><h2>12. Privacy Concerns and Contact</h2><p>For access, correction, deletion, objection, consent withdrawal, account, security, or other privacy concerns, contact the HOA through its official privacy contact. The HOA should verify the requester and respond in accordance with applicable requirements.</p><div class="legal-contact-placeholder"><strong>Required before production deployment:</strong><br>Personal Information Controller: San Alfonso Homes Homeowners’ Association [CONFIRM COMPLETE LEGAL NAME]<br>Privacy contact / Data Protection Officer: [INSERT OFFICIALLY DESIGNATED NAME OR ROLE]<br>Privacy email: [INSERT OFFICIAL PRIVACY EMAIL]<br>Privacy phone: [INSERT OFFICIAL PRIVACY PHONE NUMBER]<br>Office address: San Alfonso Homes, Pacol, Naga City, Camarines Sur, Philippines</div><p>If a concern is not resolved, a data subject may seek guidance or file a complaint with the Philippine National Privacy Commission through its official channels.</p></section>
      <section><h2>13. Changes to this Privacy Policy</h2><p>This policy may be updated when processing activities, system features, safeguards, laws, or regulatory guidance change. The current version and last-updated date will be posted in SmartHood. Material changes may also be announced through available HOA channels, and consent will be requested again when required by law.</p></section>
      <section><h2>14. Effective Date and Last Updated</h2><p><strong>Effective date:</strong> ${LEGAL_EFFECTIVE_DATE}<br><strong>Last updated:</strong> ${LEGAL_EFFECTIVE_DATE}<br><strong>Version:</strong> ${LEGAL_POLICY_VERSION}</p></section>
    `,
  },
};

let legalReturnUrl = null;

function legalPageFromPath(pathname = window.location.pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === LEGAL_DOCUMENTS.terms.path) return 'terms';
  if (normalized === LEGAL_DOCUMENTS.privacy.path) return 'privacy';
  return null;
}

function renderLegalDocument(type) {
  const definition = LEGAL_DOCUMENTS[type];
  const target = document.getElementById('legalDocument');
  if (!definition || !target) return false;
  target.innerHTML = `
    <div class="legal-document-heading">
      <span class="legal-eyebrow">${definition.eyebrow}</span>
      <h1>${definition.title}</h1>
      <p>${definition.intro}</p>
      <div class="legal-document-meta"><span>Effective ${LEGAL_EFFECTIVE_DATE}</span><span>Version ${LEGAL_POLICY_VERSION}</span></div>
    </div>
    <div class="legal-document-body">${definition.content}</div>
    <div class="legal-document-switch">
      ${type === 'terms'
        ? '<span>Also review how SmartHood handles personal information.</span><a href="/privacy-policy" onclick="openLegalPage(\'privacy\', event)">Read the Privacy Policy</a>'
        : '<span>Also review the rules for using SmartHood.</span><a href="/terms-and-conditions" onclick="openLegalPage(\'terms\', event)">Read the Terms & Conditions</a>'}
    </div>`;
  return true;
}

function openLegalPage(type, event = null, options = {}) {
  if (event && event.preventDefault) event.preventDefault();
  const definition = LEGAL_DOCUMENTS[type];
  const page = document.getElementById('legalPage');
  if (!definition || !page || !renderLegalDocument(type)) return false;

  const isSwitchingLegalDocuments = Boolean(legalPageFromPath());
  if (!isSwitchingLegalDocuments && !legalReturnUrl) {
    legalReturnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  page.classList.remove('hidden');
  page.setAttribute('aria-hidden', 'false');
  page.dataset.document = type;
  document.body.classList.add('legal-open');
  document.title = `${definition.title} | SmartHood`;

  if (options.pushHistory !== false && window.location.pathname !== definition.path) {
    window.history.pushState({ legal: type }, '', definition.path);
  }

  page.scrollTop = 0;
  document.querySelector('.legal-page-main')?.scrollTo(0, 0);
  window.setTimeout(() => document.getElementById('legalDocument')?.focus({ preventScroll: true }), 0);
  return true;
}

function hideLegalPage() {
  const page = document.getElementById('legalPage');
  if (!page || page.classList.contains('hidden')) return;
  page.classList.add('hidden');
  page.setAttribute('aria-hidden', 'true');
  delete page.dataset.document;
  document.body.classList.remove('legal-open');
  document.title = 'SmartHood';
}

function closeLegalPage(event = null) {
  if (event && event.preventDefault) event.preventDefault();
  const wasLegalPath = Boolean(legalPageFromPath());
  const returnUrl = legalReturnUrl;
  legalReturnUrl = null;
  hideLegalPage();

  if (wasLegalPath) {
    if (returnUrl) {
      window.history.pushState({ auth: typeof currentUser !== 'undefined' && Boolean(currentUser) }, '', returnUrl);
    } else {
      const fallback = (typeof currentUser !== 'undefined' && currentUser && typeof currentView !== 'undefined')
        ? `/#${currentView}`
        : '/';
      window.history.replaceState({ auth: typeof currentUser !== 'undefined' && Boolean(currentUser) }, '', fallback);
    }
  }
}

window.LEGAL_POLICY_VERSION = LEGAL_POLICY_VERSION;
window.legalPageFromPath = legalPageFromPath;
window.openLegalPage = openLegalPage;
window.hideLegalPage = hideLegalPage;
window.closeLegalPage = closeLegalPage;

