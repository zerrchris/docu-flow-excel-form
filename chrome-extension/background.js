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
    // Handle multi-step snipping context menu updates
    const menuItems = [
      { id: 'runsheetpro-begin-snip', title: 'Begin Snip Session' },
      { id: 'runsheetpro-next-snip', title: 'Next Snip' },
      { id: 'runsheetpro-finish-snip', title: 'Finish Snipping' },
      { id: 'runsheetpro-fullscreen-help', title: 'Fullscreen Snipping Help' }
    ];

    // Remove all existing menu items first (with promise handling for better reliability)
    const removePromises = menuItems.map(item => 
      new Promise(resolve => {
        chrome.contextMenus.remove(item.id, () => {
          // Ignore errors for non-existent items
          resolve();
        });
      })
    );
    
    Promise.all(removePromises).then(() => {
      if (message.enabled) {
        // Add menu items based on current state
        if (message.state === 'inactive') {
          // Only show "Begin Snip Session"
          chrome.contextMenus.create({
            id: 'runsheetpro-begin-snip',
            title: message.fullscreenMode ? '📸 Begin Snip Session (Fullscreen)' : '📸 Begin Snip Session',
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
          });
          
          // Add help option in fullscreen mode
          if (message.fullscreenMode) {
            chrome.contextMenus.create({
              id: 'runsheetpro-fullscreen-help',
              title: '❓ Keyboard Shortcuts',
              contexts: ['all'],
              documentUrlPatterns: ['<all_urls>']
            });
          }
        } else if (message.state === 'active') {
          // Show "Next Snip" and "Finish Snipping" - make them prominent
          chrome.contextMenus.create({
            id: 'runsheetpro-next-snip',
            title: message.fullscreenMode ? '🎯 Next Snip (Ctrl+Shift+S)' : '🎯 Next Snip',
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
          });
          chrome.contextMenus.create({
            id: 'runsheetpro-finish-snip',
            title: message.fullscreenMode ? '✅ Finish Snipping (Ctrl+Shift+F)' : '✅ Finish Snipping',
            contexts: ['all'],
            documentUrlPatterns: ['<all_urls>']
          });
          
          // Add help option in fullscreen mode
          if (message.fullscreenMode) {
            chrome.contextMenus.create({
              id: 'runsheetpro-fullscreen-help',
              title: '❓ Keyboard Shortcuts',
              contexts: ['all'],
              documentUrlPatterns: ['<all_urls>']
            });
          }
        }
      }
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
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
  
  if (info.menuItemId === 'runsheetpro-begin-snip') {
    chrome.tabs.sendMessage(tab.id, { action: 'beginSnipSession' });
  } else if (info.menuItemId === 'runsheetpro-next-snip') {
    chrome.tabs.sendMessage(tab.id, { action: 'nextSnip' });
  } else if (info.menuItemId === 'runsheetpro-finish-snip') {
    chrome.tabs.sendMessage(tab.id, { action: 'finishSnipping' });
  } else if (info.menuItemId === 'runsheetpro-fullscreen-help') {
    chrome.tabs.sendMessage(tab.id, { action: 'showFullscreenHelp' });
  }
});

// Handle tab updates: no-op (manifest handles injection to avoid duplicates)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Intentionally left blank
});