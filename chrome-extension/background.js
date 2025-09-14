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
    try {
      if (sender.tab && sender.tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: () => {
            try {
              // @ts-ignore - markers set by IIFEs in scripts
              return {
                contentLoaded: !!window.runsheetProContentScriptLoaded,
                stateLoaded: !!window.runsheetProPersistentStateLoaded,
              };
            } catch {
              return { contentLoaded: false, stateLoaded: false };
            }
          }
        }).then((results) => {
          const res = results && results[0] ? results[0].result : { contentLoaded: false, stateLoaded: false };
          const files = [];
          if (!res.stateLoaded) files.push('persistent-state.js', 'error-handler.js');
          if (!res.contentLoaded) files.push('content.js');

          if (files.length === 0) {
            sendResponse({ success: true, skipped: true });
            return;
          }

          chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            files
          }).then(() => sendResponse({ success: true, injected: files }))
            .catch(err => {
              console.warn('ensureContentScript failed:', err);
              sendResponse({ success: false, error: err.message });
            });
        }).catch(err => {
          // Detection failed – inject content as fallback
          chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            files: ['content.js']
          }).then(() => sendResponse({ success: true, fallback: true }))
            .catch(e => {
              console.warn('ensureContentScript fallback failed:', e);
              sendResponse({ success: false, error: e.message });
            });
        });
        return true; // async
      }
    } catch (e) {
      console.warn('ensureContentScript error:', e);
    }
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

// Handle tab updates to inject content script if needed, but avoid duplicates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            // @ts-ignore - checking marker set by content.js IIFE
            return !!window.runsheetProContentScriptLoaded;
          } catch {
            return false;
          }
        }
      }).then((results) => {
        const alreadyLoaded = Array.isArray(results) && results[0] && results[0].result === true;
        if (!alreadyLoaded) {
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          }).catch(err => {
            // Ignore errors for pages where we can't inject (like chrome:// pages)
            console.log('Could not inject content script:', err.message);
          });
        } else {
          console.log('Content script already loaded, skipping inject for tab', tabId);
        }
      }).catch(err => {
        // If detection fails, try to inject once
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }).catch(e => console.log('Could not inject content script:', e.message));
      });
    } catch (e) {
      console.log('onUpdated injection check failed:', e);
    }
  }
});