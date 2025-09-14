// RunsheetPro Extension Content Script
(function() {
  'use strict';
  
  // Prevent multiple execution
  if (window.runsheetProContentScriptLoaded) {
    console.log('🔧 RunsheetPro Extension: Content script already loaded, skipping');
    return;
  }
  window.runsheetProContentScriptLoaded = true;
  
  console.log('🔧 RunsheetPro Extension: Content script loaded');

  // Global state
  let isExtensionEnabled = false;
  let currentViewMode = 'single';
  let floatingButton = null;
  let runsheetUI = null;
  let runsheetFrame = null;
  let activeRunsheet = null;
  let userSession = null;

// Initialize extension
const initializeExtension = async () => {
  try {
    // Get extension settings
    const result = await chrome.storage.local.get(['extensionEnabled', 'viewMode', 'extension_enabled', 'extension_disabled']);
    
    // Check multiple possible storage keys for compatibility
    isExtensionEnabled = (result.extensionEnabled !== false && result.extension_enabled !== false) && result.extension_disabled !== true;
    currentViewMode = result.viewMode || 'single';

    console.log('🔧 RunsheetPro Extension: Initialized', { 
      isExtensionEnabled, 
      currentViewMode,
      rawResult: result 
    });

    if (isExtensionEnabled) {
      showFloatingButton();
      console.log('🔧 RunsheetPro Extension: Floating button should be visible');
    } else {
      hideFloatingButton();
      console.log('🔧 RunsheetPro Extension: Extension disabled, hiding button');
    }
  } catch (error) {
    console.error('🔧 RunsheetPro Extension: Initialization error:', error);
  }
};

// Create floating button
const createFloatingButton = () => {
  if (floatingButton) return floatingButton;

  const button = document.createElement('div');
  button.id = 'runsheetpro-floating-btn';
  button.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: #3b82f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      z-index: 10000;
      transition: all 0.3s ease;
      color: white;
      font-weight: bold;
      font-size: 18px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      user-select: none;
    " title="Open RunsheetPro">
      RP
    </div>
  `;

  // Add hover effects
  const buttonElement = button.firstElementChild;
  buttonElement.addEventListener('mouseenter', () => {
    buttonElement.style.transform = 'scale(1.1)';
    buttonElement.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.6)';
  });

  buttonElement.addEventListener('mouseleave', () => {
    buttonElement.style.transform = 'scale(1)';
    buttonElement.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
  });

  // Click handler
  buttonElement.addEventListener('click', async () => {
    try {
      // Send message to background to open runsheet
      chrome.runtime.sendMessage({ action: 'openRunsheet' });
      
      // Try to trigger any existing runsheet UI
      if (typeof window.openRunsheetUI === 'function') {
        window.openRunsheetUI();
      } else {
        // Fallback: open the main app
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const isLocalDevelopment = window.location.href.includes('localhost') || window.location.href.includes('8080');
        
        let appUrl = isLocalDevelopment 
          ? 'http://localhost:8080/runsheet' 
          : 'https://preview--docu-flow-excel-form.lovable.app/runsheet';
        
        window.open(appUrl, '_blank');
      }
    } catch (error) {
      console.error('🔧 RunsheetPro Extension: Error opening runsheet:', error);
    }
  });

  document.body.appendChild(button);
  return button;
};

// Show floating button
const showFloatingButton = () => {
  if (!floatingButton) {
    floatingButton = createFloatingButton();
  }
  floatingButton.style.display = 'block';
};

// Hide floating button
const hideFloatingButton = () => {
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
};

// Screenshot functionality
const initializeScreenshot = () => {
  // Create screenshot overlay
  const overlay = document.createElement('div');
  overlay.id = 'runsheetpro-screenshot-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
    display: none;
  `;

  let isSelecting = false;
  let startX, startY, endX, endY;
  let selectionBox = null;

  overlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    if (selectionBox) {
      selectionBox.remove();
    }

    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      z-index: 1000000;
      pointer-events: none;
    `;
    document.body.appendChild(selectionBox);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    endX = e.clientX;
    endY = e.clientY;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });

  overlay.addEventListener('mouseup', async (e) => {
    if (!isSelecting) return;
    isSelecting = false;

    endX = e.clientX;
    endY = e.clientY;

    // Hide overlay and selection box
    overlay.style.display = 'none';
    if (selectionBox) {
      selectionBox.remove();
      selectionBox = null;
    }

    // Capture the selected area
    try {
      const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
      if (response.dataUrl) {
        // Process the captured image (crop to selection if needed)
        console.log('🔧 RunsheetPro Extension: Screenshot captured');
        // Here you would typically send this to your document processing system
      }
    } catch (error) {
      console.error('🔧 RunsheetPro Extension: Screenshot error:', error);
    }
  });

  // ESC to cancel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') {
      overlay.style.display = 'none';
      if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
      }
      isSelecting = false;
    }
  });

  document.body.appendChild(overlay);
  return overlay;
};

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('🔧 RunsheetPro Extension: Content script received message:', message);

  if (message.action === 'toggleExtension') {
    console.log('🔧 RunsheetPro Extension: Toggle message received, enabled:', message.enabled);
    isExtensionEnabled = message.enabled;
    if (isExtensionEnabled) {
      showFloatingButton();
      console.log('🔧 RunsheetPro Extension: Showing floating button');
    } else {
      hideFloatingButton();
      console.log('🔧 RunsheetPro Extension: Hiding floating button');
    }
    sendResponse({ success: true });
  }

  if (message.action === 'switchViewMode') {
    currentViewMode = message.viewMode;
    console.log('🔧 RunsheetPro Extension: Switched to view mode:', currentViewMode);
    sendResponse({ success: true });
  }

  if (message.action === 'showSnipModeSelector') {
    const overlay = initializeScreenshot();
    overlay.style.display = 'block';
    sendResponse({ success: true });
  }

  return false;
});

// Storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('🔧 RunsheetPro Extension: Storage changed:', changes, namespace);
  
  if (namespace === 'local') {
    if (changes.extensionEnabled || changes.extension_enabled || changes.extension_disabled) {
      const enabled = changes.extensionEnabled?.newValue !== false && 
                     changes.extension_enabled?.newValue !== false && 
                     changes.extension_disabled?.newValue !== true;
      
      console.log('🔧 RunsheetPro Extension: Extension enabled state changed to:', enabled);
      isExtensionEnabled = enabled;
      
      if (isExtensionEnabled) {
        showFloatingButton();
      } else {
        hideFloatingButton();
      }
    }

    if (changes.viewMode) {
      currentViewMode = changes.viewMode.newValue || 'single';
      console.log('🔧 RunsheetPro Extension: View mode changed to:', currentViewMode);
    }
  }
});

  // Helpers
  async function checkAuth() {
    try {
      console.log('🔧 RunsheetPro Extension: Checking authentication...');
      const authData = await chrome.storage.local.get(['supabase_session']);
      if (authData.supabase_session && authData.supabase_session.access_token) {
        userSession = authData.supabase_session;
        console.log('🔧 RunsheetPro Extension: User authenticated');
        return true;
      }
      console.log('🔧 RunsheetPro Extension: No authentication found');
      return false;
    } catch (error) {
      console.error('🔧 RunsheetPro Extension: Auth check failed:', error);
      return false;
    }
  }

  function ensureRunsheetFrame() {
    if (runsheetFrame) return runsheetFrame;
    const frame = document.createElement('div');
    frame.id = 'runsheetpro-runsheet-frame';
    frame.style.cssText = `
      position: fixed; left: 0; right: 0; bottom: 0; height: 260px; 
      background: #0f172a; color: white; z-index: 2147483646; 
      box-shadow: 0 -10px 30px rgba(0,0,0,0.3); border-top: 1px solid #1e293b;
      font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;
    frame.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #1e293b;">
        <div style="font-weight:600">RunsheetPro</div>
        <div>
          <button id="runsheetpro-close" style="background:#334155;color:white;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">Close</button>
        </div>
      </div>
      <div style="padding:12px; font-size:14px; color:#cbd5e1">
        Extension frame is ready. Select a runsheet or sign in from the popup.
      </div>
    `;
    frame.querySelector('#runsheetpro-close').addEventListener('click', () => {
      frame.style.display = 'none';
    });
    document.body.appendChild(frame);
    runsheetFrame = frame;
    return frame;
  }

  function toggleRunsheetFrame() {
    const frame = ensureRunsheetFrame();
    frame.style.display = (frame.style.display === 'none' || !frame.style.display) ? 'block' : 'none';
  }

  async function showRunsheetSelector() {
    console.log('🔧 RunsheetPro Extension: showRunsheetSelector called');
    const existingSelector = document.getElementById('runsheetpro-runsheet-selector');
    if (existingSelector) existingSelector.remove();

    const overlay = document.createElement('div');
    overlay.id = 'runsheetpro-runsheet-selector';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647;
      display:flex;align-items:center;justify-content:center; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background:white; border-radius:12px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.3);
      max-width:600px; width:90vw; color:#1f2937; max-height:80vh; overflow:auto;
    `;
    modal.innerHTML = `
      <div style="text-align:center; margin-bottom: 16px;">
        <h2 style="margin:0 0 8px; font-size:22px; font-weight:700;">Select Runsheet</h2>
        <p style="margin:0; color:#6b7280;">Choose from your saved runsheets</p>
      </div>
      <div id="runsheets-loading" style="text-align:center; padding: 24px;">
        <div style="display:inline-block;width:40px;height:40px;border:4px solid #f3f4f6;border-top:4px solid #3b82f6;border-radius:50%;animation:spin 1s linear infinite"></div>
        <p style="margin-top:12px;color:#6b7280">Loading runsheets...</p>
      </div>
      <div id="runsheets-list" style="display:none"></div>
      <div style="text-align:center;margin-top:16px;">
        <button id="cancel-runsheet-selector" style="background:transparent;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;padding:8px 16px;cursor:pointer;margin-right:12px">Cancel</button>
        <button id="create-new-runsheet" style="background:#3b82f6;color:white;border:none;border-radius:6px;padding:8px 16px;cursor:pointer">Create New</button>
      </div>
    `;

    overlay.appendChild(modal);
    const closeSelector = () => overlay.remove();
    modal.querySelector('#cancel-runsheet-selector').addEventListener('click', closeSelector);
    modal.querySelector('#create-new-runsheet').addEventListener('click', () => {
      closeSelector();
      console.log('🔧 RunsheetPro Extension: Create new runsheet clicked');
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSelector(); });
    document.body.appendChild(overlay);

    setTimeout(() => {
      modal.querySelector('#runsheets-loading').style.display = 'none';
      const listDiv = modal.querySelector('#runsheets-list');
      listDiv.style.display = 'block';
      listDiv.innerHTML = `<div style="text-align:center; padding: 24px; color:#6b7280;">
        <p style="margin:0; font-size:16px;">No saved runsheets found</p>
        <p style="margin:8px 0 0; font-size:14px;">Create your first runsheet to get started</p>
      </div>`;
    }, 800);
  }

  function showSignInPopup() {
    console.log('🔧 RunsheetPro Extension: showSignInPopup called');
    const existing = document.getElementById('runsheetpro-signin-popup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;`;
    const dialog = document.createElement('div');
    dialog.id = 'runsheetpro-signin-popup';
    dialog.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid #d1d5db;border-radius:8px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:2147483648;width:350px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;`;
    dialog.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:18px;font-weight:600;">Sign In to RunsheetPro</h3>
        <button id="close-signin" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">×</button>
      </div>
      <p style="color:#6b7280;margin-bottom:16px;">Please sign in to access your runsheets</p>
      <div style="text-align:center;">
        <button id="open-main-app" style="background:#3b82f6;color:white;border:none;border-radius:6px;padding:10px 16px;cursor:pointer;font-size:14px;font-weight:500;">Open Main App to Sign In</button>
      </div>`;

    const close = () => overlay.remove();
    dialog.querySelector('#close-signin').addEventListener('click', close);
    dialog.querySelector('#open-main-app').addEventListener('click', (e) => {
      e.preventDefault();
      window.open(window.location.origin, '_blank');
      close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // Global function for other scripts to trigger
  window.openRunsheetUI = async () => {
    console.log('🔧 RunsheetPro Extension: openRunsheetUI called');
    console.log('🔧 RunsheetPro Extension: Current state check:', {
      runsheetFrame: !!runsheetFrame,
      runsheetFrameDisplay: runsheetFrame ? runsheetFrame.style.display : 'none',
      activeRunsheet: !!activeRunsheet,
      userSession: !!userSession
    });

    try {
      if (runsheetFrame && runsheetFrame.style.display !== 'none') {
        console.log('🔧 RunsheetPro Extension: Toggling existing frame');
        toggleRunsheetFrame();
        return;
      } else {
        console.log('🔧 RunsheetPro Extension: Checking authentication...');
        const isAuthenticated = await checkAuth();
        console.log('🔧 RunsheetPro Extension: Authentication result:', isAuthenticated);
        if (isAuthenticated) {
          console.log('🔧 RunsheetPro Extension: User authenticated, showing runsheet selector');
          await showRunsheetSelector();
          ensureRunsheetFrame().style.display = 'block';
        } else {
          console.log('🔧 RunsheetPro Extension: User not authenticated, showing sign-in popup');
          await showSignInPopup();
        }
      }
    } catch (error) {
      console.error('🔧 RunsheetPro Extension: Error in openRunsheetUI:', error);
      throw error;
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    initializeExtension();
  }

  // Also initialize after a short delay to ensure everything is loaded
  setTimeout(initializeExtension, 1000);

})(); // End of IIFE