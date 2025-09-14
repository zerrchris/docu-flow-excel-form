// RunsheetPro Extension Content Script
console.log('🔧 RunsheetPro Extension: Content script loaded');

// Global state
let isExtensionEnabled = false;
let currentViewMode = 'single';
let floatingButton = null;
let runsheetUI = null;

// Initialize extension
const initializeExtension = async () => {
  try {
    // Get extension settings
    const result = await chrome.storage.local.get(['extensionEnabled', 'viewMode']);
    isExtensionEnabled = result.extensionEnabled !== false;
    currentViewMode = result.viewMode || 'single';

    console.log('🔧 RunsheetPro Extension: Initialized', { isExtensionEnabled, currentViewMode });

    if (isExtensionEnabled) {
      showFloatingButton();
    } else {
      hideFloatingButton();
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
    isExtensionEnabled = message.enabled;
    if (isExtensionEnabled) {
      showFloatingButton();
    } else {
      hideFloatingButton();
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
  if (namespace === 'local') {
    if (changes.extensionEnabled) {
      isExtensionEnabled = changes.extensionEnabled.newValue !== false;
      if (isExtensionEnabled) {
        showFloatingButton();
      } else {
        hideFloatingButton();
      }
    }

    if (changes.viewMode) {
      currentViewMode = changes.viewMode.newValue || 'single';
    }
  }
});

// Global function for other scripts to trigger
window.openRunsheetUI = () => {
  console.log('🔧 RunsheetPro Extension: openRunsheetUI called');
  // This would open your runsheet interface
  // For now, just log that it was called
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// Also initialize after a short delay to ensure everything is loaded
setTimeout(initializeExtension, 1000);