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

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "runsheetpro-next-snip") {
    // Send message to content script to trigger next snip
    chrome.tabs.sendMessage(tab.id, { action: 'contextMenuNextSnip' });
  }
});

// Handle messages to update context menu visibility
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateContextMenu') {
    chrome.contextMenus.update("runsheetpro-next-snip", {
      visible: message.visible
    });
    sendResponse({ success: true });
    return;
  }
  
  // ... existing message handling continues below
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

  // Create context menu item
  chrome.contextMenus.create({
    id: "runsheetpro-next-snip",
    title: "RunsheetPro: Next Snip",
    contexts: ["page", "selection", "image", "link"],
    visible: false // Initially hidden, will be shown during navigate mode
  });
  
  console.log('RunsheetPro context menu created');
});

// Handle tab updates: no-op (manifest handles injection to avoid duplicates)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Intentionally left blank
});