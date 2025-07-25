// Background script for RunsheetPro Runsheet Assistant
console.log('RunsheetPro extension background script loaded');

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
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('RunsheetPro extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.local.set({
      extensionEnabled: true,
      autoCapture: false,
      syncInterval: 5000
    });
  }
});

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    // Ensure content script is injected
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => {
      // Ignore errors for pages where we can't inject (like chrome:// pages)
      console.log('Could not inject content script:', err.message);
    });
  }
});