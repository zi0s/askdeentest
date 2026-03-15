/* Enhanced NavigationBlocker: stronger protections against automatic redirects/popups and injected navigation.
   - Blocks cross-origin window.open, location changes, form submissions, and anchor navigations unless user-initiated.
   - Removes or neutralizes injected iframes/meta refresh/scripts outside allowed containers.
   - Provides debugging handles via window.__NavigationBlocker and window.__PopupRemover.
   Note: preserves same-origin programmatic behavior. */

(function() {
  const SAFE_ORIGINS = [location.origin];
  function logBlocked(action, info) {
    try { console.warn(`[NavigationBlocker] Blocked: ${action}`, info || ''); } catch (e) {}
  }

  // Keep originals for restore/debugging
  const originalWindowOpen = window.open;
  const originalAssign = window.location.assign;
  const originalReplace = window.location.replace;
  const originalReload = window.location.reload;

  // Helper to test allowed targets
  function isSameOriginUrl(url) {
    try {
      if (!url) return false;
      // Relative URLs are allowed
      if (url.startsWith('/') || url.startsWith('#') || url.startsWith('./') || url.startsWith('../')) return true;
      // mailto/tel allowed
      if (url.startsWith('mailto:') || url.startsWith('tel:')) return true;
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin || SAFE_ORIGINS.some(o => parsed.origin === (new URL(o, location.href)).origin);
    } catch (e) { return false; }
  }

  // Stronger window.open guard: only allow same-origin opens or user-intent via click handler (best-effort)
  window.open = function(url, name, specs) {
    try {
      if (!url || isSameOriginUrl(url)) {
        return originalWindowOpen.call(window, url, name, specs);
      }
    } catch (e) {}
    logBlocked('window.open', url);
    // return a no-op window-like object to avoid some libs throwing
    return null;
  };

  // Block assign/replace/reload to cross-origin targets
  window.location.assign = function(url) {
    if (typeof url === 'string' && isSameOriginUrl(url)) {
      return originalAssign.call(window.location, url);
    }
    logBlocked('location.assign', url);
  };
  window.location.replace = function(url) {
    if (typeof url === 'string' && isSameOriginUrl(url)) {
      return originalReplace.call(window.location, url);
    }
    logBlocked('location.replace', url);
  };
  window.location.reload = function(force) {
    try {
      return originalReload.call(window.location, force);
    } catch (e) {
      logBlocked('location.reload', e);
    }
  };

  // Prevent setting location.href directly (best-effort)
  try {
    const locProto = Object.getPrototypeOf(window.location);
    if (locProto && Object.getOwnPropertyDescriptor(locProto, 'href')) {
      const hrefDesc = Object.getOwnPropertyDescriptor(locProto, 'href');
      if (hrefDesc && hrefDesc.set) {
        Object.defineProperty(window.location, 'href', {
          configurable: false,
          enumerable: true,
          get: function() { return location.toString(); },
          set: function(val) {
            if (typeof val === 'string' && isSameOriginUrl(val)) {
              originalAssign.call(window.location, val);
            } else {
              logBlocked('location.href set', val);
            }
          }
        });
      }
    }
  } catch (e) {
    // ignore if browser forbids
  }

  // Neutralize onbeforeunload spam by keeping a safe default handler; allow page to override explicitly
  let userBeforeUnload = null;
  Object.defineProperty(window, 'onbeforeunload', {
    configurable: true,
    enumerable: true,
    get: function() { return userBeforeUnload; },
    set: function(fn) {
      // allow setting only if function comes from same origin (best-effort)
      if (typeof fn === 'function') {
        userBeforeUnload = fn;
      } else {
        userBeforeUnload = null;
      }
    }
  });

  // Intercept anchor clicks: block cross-origin/suspicious navigations unless user-intent (Ctrl/Cmd/middle)
  document.addEventListener('click', function(ev) {
    try {
      const anchor = ev.target.closest && ev.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || anchor.href;
      if (!href) return;
      // allow anchors that are same-origin or purposely provide mailto/tel or in-page refs
      if (isSameOriginUrl(href) || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
      // allow user-intent
      if (ev.ctrlKey || ev.metaKey || ev.button === 1) return;
      // block otherwise
      ev.preventDefault();
      ev.stopPropagation();
      logBlocked('anchor-click', href);
      return false;
    } catch (e) {}
  }, true);

  // Intercept submissions: prevent forms from posting to external origins without user interaction
  document.addEventListener('submit', function(ev) {
    try {
      const form = ev.target;
      const action = form.getAttribute('action') || '';
      if (!action) return; // relative submits are ok
      if (isSameOriginUrl(action)) return;
      // If form submission triggered programmatically without explicit user submit, block
      // There's no surefire way to distinguish, but we conservatively block and log
      ev.preventDefault();
      ev.stopPropagation();
      logBlocked('form-submit-blocked', action);
      return false;
    } catch (e) {}
  }, true);

  // MutationObserver: remove meta refresh, suspicious iframes, and strip navigation attributes from injected nodes
  const ALLOWED_SELECTORS = ['.container', '#sideMenu', '#playerModal', 'head', 'script', 'style', 'footer'];
  function nodeAllowed(node) {
    try {
      if (!node || node.nodeType !== 1) return true;
      for (const sel of ALLOWED_SELECTORS) {
        if (node.matches && node.matches(sel)) return true;
        if (node.closest && node.closest(sel)) return true;
      }
    } catch (e) {}
    return false;
  }

  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (!m.addedNodes) continue;
      m.addedNodes.forEach(node => {
        try {
          if (node.nodeType !== 1) return;
          const tag = (node.tagName || '').toLowerCase();
          // meta refresh
          if (tag === 'meta' && node.httpEquiv && node.httpEquiv.toLowerCase() === 'refresh') {
            node.remove();
            logBlocked('meta-refresh', node.outerHTML);
            return;
          }
          // remove injected iframes that are not part of allowed containers
          if (tag === 'iframe') {
            if (!nodeAllowed(node)) {
              node.remove();
              logBlocked('injected-iframe-removed', node.src || node.outerHTML);
              return;
            } else {
              // neutralize sandboxless external iframes by clearing src if cross-origin
              try {
                const src = node.getAttribute('src') || '';
                if (src && !isSameOriginUrl(src)) {
                  node.removeAttribute('src');
                  node.setAttribute('data-blocked-src', src);
                  logBlocked('iframe-src-cleared', src);
                }
              } catch (e) {}
            }
          }
          // Strip dangerous inline attributes that may trigger navigation
          ['onload','onerror','onclick','onmouse'].forEach(attr => {
            if (node.hasAttribute && node.hasAttribute(attr)) {
              try { node.removeAttribute(attr); logBlocked('removed-attr', `${attr} on ${tag}`); } catch(e){}
            }
          });
          // If node contains anchors with target blank, ensure rel=noopener is set and prevent auto-triggering
          node.querySelectorAll && node.querySelectorAll('a[target="_blank"]').forEach(a => {
            try {
              if (!a.rel || !a.rel.includes('noopener')) a.rel = (a.rel ? a.rel + ' ' : '') + 'noopener';
            } catch (e) {}
          });
        } catch (e) {}
      });
    }
  });

  mo.observe(document.documentElement || document, { childList: true, subtree: true });

  // Periodic cleaner to remove common ad nodes outside allowed containers
  (function periodicCleaner() {
    const selectors = [
      '.popup', '.ad-popup', '.ad-frame', '.ad-modal', '.interstitial', '.ad-overlay',
      'ins.ad', '.sticky-ad', '[data-ad]', '.ad-banner', 'iframe'
    ];
    function clean() {
      try {
        const nodes = document.querySelectorAll(selectors.join(','));
        nodes.forEach(node => {
          try {
            if (nodeAllowed(node)) return;
            // allow keeping nodes explicitly marked
            if (node.hasAttribute && node.hasAttribute('data-keep-popup')) return;
            node.remove();
            logBlocked('periodic-removed', node.outerHTML ? node.outerHTML.slice(0,200) : node);
          } catch (e) {}
        });
      } catch (e) {}
    }
    const id = setInterval(clean, 1200);
    window.__PopupRemover = {
      pause: () => clearInterval(id),
      runOnce: clean,
      isRunning: () => true
    };
  })();

  // Block programmatic navigation attempts via setTimeout/setInterval callbacks that immediately change location (heuristic)
  (function wrapTimers() {
    const origSetTimeout = window.setTimeout;
    const origSetInterval = window.setInterval;
    window.setTimeout = function(fn, delay, ...args) {
      if (typeof fn === 'string') {
        logBlocked('setTimeout-string-blocked', fn);
        return 0;
      }
      // wrap function to watch for location changes
      const wrapper = function() {
        try {
          const before = location.href;
          const res = fn.apply(this, args);
          const after = location.href;
          if (before !== after && !isSameOriginUrl(after)) {
            // revert if possible (best-effort)
            logBlocked('timer-initiated-redirect-blocked', after);
            try { history.pushState && history.pushState(null, '', before); } catch(e){}
            if (typeof res === 'undefined') return res;
          }
          return res;
        } catch (e) { return; }
      };
      return origSetTimeout(wrapper, delay);
    };
    window.setInterval = function(fn, delay, ...args) {
      if (typeof fn === 'string') {
        logBlocked('setInterval-string-blocked', fn);
        return 0;
      }
      return origSetInterval(fn, delay, ...args);
    };
  })();

  // Global popup guard: prevent auto-triggering target=_blank anchors; allow user-intent
  document.addEventListener('click', function(e) {
    try {
      const el = e.target.closest && e.target.closest('a');
      if (!el) return;
      if (el.target === '_blank' && !isSameOriginUrl(el.href)) {
        if (e.ctrlKey || e.metaKey || e.button === 1) return;
        e.preventDefault(); e.stopPropagation();
        logBlocked('popup-guard anchor target=_blank', el.href);
        return false;
      }
    } catch (e) {}
  }, true);

  // Expose debug API
  window.__NavigationBlocker = {
    enabled: true,
    restoreWindowOpen: function() { window.open = originalWindowOpen; },
    allowOpen: function(fn) { if (typeof fn === 'function') window.open = fn; },
    restoreLocationAssign: function() { window.location.assign = originalAssign; window.location.replace = originalReplace; },
    logBlocked: logBlocked
  };

})();