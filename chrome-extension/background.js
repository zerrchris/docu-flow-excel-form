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
    // Avoid reinjecting scripts; content scripts are declared in the manifest
    try {
      sendResponse({ success: true, skipped: true });
    } catch (e) {
      console.warn('ensureContentScript error:', e);
      sendResponse({ success: false, error: e.message });
    }
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
});

// Handle tab updates: no-op (manifest handles injection to avoid duplicates)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Intentionally left blank
});