// Lightweight bootstrap to ensure the floating button appears even if the heavy content.js fails to parse
(function () {
  try {
    const LOG_PREFIX = '🟦 RunsheetPro Bootstrap:';
    console.log(LOG_PREFIX, 'loaded');

    const getEnabled = async () => {
      try {
        const s = await chrome.storage.local.get(['extensionEnabled', 'extension_enabled', 'extension_disabled']);
        const enabled = (s.extensionEnabled !== false && s.extension_enabled !== false) && s.extension_disabled !== true;
        return enabled;
      } catch (e) {
        console.warn(LOG_PREFIX, 'storage get failed, assuming enabled', e);
        return true;
      }
    };

    const ensureButton = async () => {
      if (!document || !document.body) return;
      let btn = document.getElementById('runsheetpro-runsheet-button');
      if (!btn) {
        btn = document.createElement('div');
        btn.id = 'runsheetpro-runsheet-button';
        btn.style.cssText = [
          'position: fixed',
          'bottom: 20px',
          'right: 20px',
          'width: 60px',
          'height: 60px',
          'border-radius: 9999px',
          'background: linear-gradient(135deg, hsl(215 80% 40%), hsl(230 60% 60%))',
          'box-shadow: 0 4px 20px rgba(0,0,0,0.3)',
          'color: #fff',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'cursor: pointer',
          'z-index: 2147483646',
          'font-size: 24px',
          'user-select: none',
        ].join(' !important; ') + ' !important;';
        btn.title = 'RunsheetPro Assistant';
        btn.textContent = '📋';
        btn.addEventListener('mouseenter', () => btn && (btn.style.transform = 'scale(1.1)'));
        btn.addEventListener('mouseleave', () => btn && (btn.style.transform = 'scale(1)'));
        btn.addEventListener('click', async () => {
          // Try to open the popup first
          try { chrome.runtime.sendMessage({ action: 'openPopup' }); } catch {}
          // Also attempt to ask background to ensure full content script is injected
          try { chrome.runtime.sendMessage({ action: 'ensureContentScript' }); } catch {}
        });
        document.body.appendChild(btn);
        console.log(LOG_PREFIX, 'button created');
      }
      btn.style.display = 'block';
    };

    const hideButton = () => {
      const btn = document.getElementById('runsheetpro-runsheet-button');
      if (btn) btn.style.display = 'none';
    };

    // React to storage changes
    try {
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        if (changes.extensionEnabled || changes.extension_enabled || changes.extension_disabled) {
          const enabled = await getEnabled();
          if (enabled) ensureButton(); else hideButton();
        }
      });
    } catch (e) {
      console.warn(LOG_PREFIX, 'onChanged hook failed', e);
    }

    // Initialize after load
    const start = async () => {
      const enabled = await getEnabled();
      if (enabled) await ensureButton();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  } catch (e) {
    console.error('Bootstrap fatal error', e);
  }
})();