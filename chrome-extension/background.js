// Background script for RunsheetPro Runsheet Assistant
console.log('RunsheetPro extension background script loaded');

// Add error handling for service worker
self.addEventListener('error', (event) => {
  console.error('Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service worker unhandled rejection:', event.reason);
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.action === 'captureTab') {
    // Capture visible tab for screenshot functionality
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Screenshot capture error:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'startScreenCapture') {
    // Start screen capture session for snip functionality
    chrome.desktopCapture.chooseDesktopMedia(['tab'], sender.tab, (streamId) => {
      if (chrome.runtime.lastError) {
        console.error('Desktop capture error:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else if (streamId) {
        sendResponse({ streamId });
      } else {
        sendResponse({ error: 'User cancelled screen capture' });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'openPopup') {
    // Handle popup opening requests
    chrome.action.openPopup();
    sendResponse({ success: true });
  }

  if (message.action === 'openRunsheet') {
    // Handle runsheet opening requests from the floating button
    // Forward this to the content script or trigger the runsheet UI
    console.log('Opening runsheet from floating button');
    sendResponse({ success: true });
  }

  if (message.action === 'updateSnipContextMenu') {
    // Handle different snip workflow states
    chrome.contextMenus.removeAll(() => {
      if (message.enabled && message.state) {
        let menuTitle = '';
        let menuId = '';
        
        switch (message.state) {
          case 'begin':
            menuTitle = 'Begin Snip Session';
            menuId = 'runsheetpro-begin-snip';
            break;
          case 'next':
            menuTitle = 'Next Snip';
            menuId = 'runsheetpro-next-snip';
            break;
          case 'finish':
            menuTitle = 'Finish Snipping';
            menuId = 'runsheetpro-finish-snip';
            break;
          default:
            menuTitle = 'next snip';
            menuId = 'runsheetpro-next-snip';
        }
        
        chrome.contextMenus.create({
          id: menuId,
          title: menuTitle,
          contexts: ['all']
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Context menu creation error:', chrome.runtime.lastError);
          } else {
            console.log(`Context menu "${menuTitle}" created`);
          }
        });
      }
    });
    sendResponse({ success: true });
  }

  if (message.action === 'ensureContentScript') {
    // Verify content script marker and inject if missing
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) {
          sendResponse({ success: false, error: 'No tabId available' });
          return;
        }

        // Check if content script marker exists in the page DOM (main world)
        const [checkResult] = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => Boolean(document.getElementById('runsheetpro-content-loaded')),
        });
        const alreadyLoaded = Boolean(checkResult?.result);
        if (alreadyLoaded) {
          sendResponse({ success: true, alreadyLoaded: true, skipped: true });
          return;
        }

        // Inject only the main content script (others are already declared in manifest)
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });

        // Re-check for marker
        const [postInjectCheck] = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => Boolean(document.getElementById('runsheetpro-content-loaded')),
        });

        sendResponse({ success: true, injected: true, markerFound: Boolean(postInjectCheck?.result) });
      } catch (e) {
        console.warn('ensureContentScript error:', e);
        sendResponse({ success: false, error: e?.message || String(e) });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('RunsheetPro extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on first install - ensure extension is enabled by default
    chrome.storage.local.set({
      extensionEnabled: true,
      extension_enabled: true,
      extension_disabled: false,
      autoCapture: false,
      syncInterval: 5000
    });
    console.log('RunsheetPro extension: Default settings applied - extension enabled');
  }

  // Context menu will be created dynamically when snipping mode starts
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('RunsheetPro extension: Context menu clicked:', info.menuItemId);
  
  let action = '';
  switch (info.menuItemId) {
    case 'runsheetpro-begin-snip':
      action = 'beginSnipSession';
      break;
    case 'runsheetpro-next-snip':
      action = 'nextSnip';
      break;
    case 'runsheetpro-finish-snip':
      action = 'finishSnipSession';
      break;
    default:
      action = 'nextSnip'; // fallback for old menu items
  }
  
  if (action) {
    chrome.tabs.sendMessage(tab.id, {
      action: action
    }).catch((error) => {
      console.error(`RunsheetPro extension: Error sending ${action} message:`, error);
    });
  }
});

// Handle tab updates: no-op (manifest handles injection to avoid duplicates)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Intentionally left blank
});