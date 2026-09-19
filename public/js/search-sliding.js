/**
 * SmartHood - Search Bar Sliding Text Controller
 * Automatically detects any search bar where the letters / placeholder text
 * does not fit the visible area, and applies a smooth sliding animation
 * so that the user can read the entire text.
 */
(function() {
  'use strict';

  const SELECTOR = [
    '.search-box input',
    '.billing-search input',
    'input[type="search"]',
    'input[id*="search" i]',
    'input[placeholder*="search" i]'
  ].join(', ');

  const trackedInputs = new WeakSet();
  let resizeObserver = null;

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target;
        if (target.matches && target.matches(SELECTOR)) {
          updateSearchInput(target);
        } else if (target.querySelector) {
          const inputs = target.querySelectorAll(SELECTOR);
          inputs.forEach(input => updateSearchInput(input));
        }
      }
    });
  }

  // Intercept programmatic value changes so placeholder overlay hides/shows correctly
  try {
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (valueDescriptor && valueDescriptor.set) {
      const originalSet = valueDescriptor.set;
      valueDescriptor.set = function(val) {
        originalSet.call(this, val);
        if (this._slidingOverlay) {
          if (this.value && this.value.trim().length > 0) {
            this._slidingOverlay.style.display = 'none';
          } else {
            this._slidingOverlay.style.display = 'flex';
            updateSearchInput(this);
          }
        }
      };
      Object.defineProperty(HTMLInputElement.prototype, 'value', valueDescriptor);
    }
  } catch (err) {
    // Fallback gracefully if property cannot be redefined
  }

  function getSearchContainer(input) {
    let container = input.closest('.search-box, .billing-search');
    if (!container) {
      container = input.parentElement;
      if (container && window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
    }
    return container;
  }

  function attachSlidingPlaceholder(input) {
    if (!input || trackedInputs.has(input)) return;

    const placeholder = (input.getAttribute('placeholder') || '').trim();
    if (!placeholder) return;

    const container = getSearchContainer(input);
    if (!container) return;

    const compPos = window.getComputedStyle(container).position;
    if (compPos === 'static') {
      container.style.position = 'relative';
    }

    // Check if an overlay already exists in container for this input
    let overlay = container.querySelector(':scope > .search-sliding-placeholder');
    let textSpan = overlay ? overlay.querySelector('.search-sliding-text') : null;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'search-sliding-placeholder';
      overlay.setAttribute('aria-hidden', 'true');

      textSpan = document.createElement('span');
      textSpan.className = 'search-sliding-text';
      textSpan.textContent = placeholder;

      overlay.appendChild(textSpan);
      container.appendChild(overlay);
    }

    input._slidingOverlay = overlay;
    input._slidingText = textSpan;
    input.classList.add('has-sliding-placeholder');
    trackedInputs.add(input);

    if (resizeObserver) {
      try {
        resizeObserver.observe(input);
        resizeObserver.observe(container);
      } catch (e) {}
    }

    const syncVisibility = () => {
      if (input.value && input.value.trim().length > 0) {
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        updateSearchInput(input);
      }
    };

    input.addEventListener('input', syncVisibility);
    input.addEventListener('change', syncVisibility);
    input.addEventListener('focus', () => {
      if (!input.value) {
        overlay.style.display = 'flex';
      }
    });
    input.addEventListener('blur', syncVisibility);

    // Initial position & animation calculation
    updateSearchInput(input);
  }

  function updateSearchInput(input) {
    if (!input || !input.isConnected) return;
    const overlay = input._slidingOverlay;
    const textSpan = input._slidingText;
    if (!overlay || !textSpan) return;

    const placeholder = (input.getAttribute('placeholder') || '').trim();
    if (!placeholder) {
      overlay.style.display = 'none';
      return;
    }

    if (textSpan.textContent !== placeholder) {
      textSpan.textContent = placeholder;
    }

    if (input.value && input.value.trim().length > 0) {
      overlay.style.display = 'none';
      return;
    } else {
      overlay.style.display = 'flex';
    }

    const container = overlay.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();

    // If input has zero dimensions (hidden modal, inactive view), defer measurement
    if (inputRect.width === 0 || inputRect.height === 0) return;

    const computed = window.getComputedStyle(input);
    const pl = parseFloat(computed.paddingLeft) || 0;
    const pr = parseFloat(computed.paddingRight) || 0;

    const left = (inputRect.left - containerRect.left) + pl;
    const availableWidth = inputRect.width - pl - pr;

    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.width = `${Math.max(0, Math.round(availableWidth))}px`;
    overlay.style.top = `${Math.round(inputRect.top - containerRect.top)}px`;
    overlay.style.height = `${Math.round(inputRect.height)}px`;
    overlay.style.fontFamily = computed.fontFamily;
    overlay.style.fontSize = computed.fontSize;

    // Remove sliding class temporarily to measure natural scrollWidth accurately
    const wasSliding = textSpan.classList.contains('is-sliding');
    textSpan.classList.remove('is-sliding');
    textSpan.style.transform = '';

    const textWidth = textSpan.scrollWidth;
    const overflow = textWidth - availableWidth;

    if (overflow > 3) {
      // Letters DO NOT FIT -> Activate smooth sliding effect!
      const extraGap = 10;
      const dist = Math.ceil(overflow + extraGap);
      const duration = Math.max(4.8, Math.min(8.5, 3.8 + overflow * 0.035));

      overlay.style.setProperty('--slide-dist', `-${dist}px`);
      overlay.style.setProperty('--slide-duration', `${duration.toFixed(2)}s`);

      // Trigger reflow to restart animation smoothly
      void textSpan.offsetWidth;
      textSpan.classList.add('is-sliding');
    } else {
      // Letters FIT -> Keep static, do not slide
      textSpan.classList.remove('is-sliding');
      textSpan.style.transform = '';
    }
  }

  function scanAndInit() {
    const inputs = document.querySelectorAll(SELECTOR);
    inputs.forEach(input => {
      if (!trackedInputs.has(input)) {
        attachSlidingPlaceholder(input);
      } else {
        updateSearchInput(input);
      }
    });
  }

  let rafId = null;
  function scheduleScan() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      scanAndInit();
    });
  }

  const mutationObserver = new MutationObserver(() => {
    scheduleScan();
  });

  function start() {
    scanAndInit();

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['placeholder']
    });

    window.addEventListener('resize', scheduleScan);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleScan);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Global helper for explicit view refreshes
  window.refreshSearchSlidingPlaceholders = scheduleScan;
})();
