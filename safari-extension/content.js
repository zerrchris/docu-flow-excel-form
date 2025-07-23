// Safari Web Extension Content Script
// Cross-browser compatible version of the Firefox content script

// Prevent multiple injections
if (window.docuflowExtensionLoaded) {
  console.log('DocuFlow extension already loaded');
} else {
  window.docuflowExtensionLoaded = true;

  // Create the extension panel
  function createExtensionPanel() {
    // Create container
    const panelContainer = document.createElement('div');
    panelContainer.id = 'docuflow-extension-panel';
    panelContainer.style.cssText = `
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 0 !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.3) !important;
      overflow: hidden !important;
      transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      border-top: 3px solid rgba(255,255,255,0.3) !important;
    `;

    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.innerHTML = '📋';
    toggleButton.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      border: none !important;
      font-size: 24px !important;
      cursor: pointer !important;
      z-index: 2147483648 !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
      transition: all 0.3s ease !important;
    `;

    // Panel content
    panelContainer.innerHTML = `
      <div style="padding: 20px; height: 200px; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600;">DocuFlow Runsheet</h3>
          <button id="docuflow-close-panel" style="background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 4px; padding: 5px 10px; cursor: pointer;">×</button>
        </div>
        
        <div id="docuflow-runsheet-info" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 6px;">
          <div style="font-size: 14px; opacity: 0.9;">Current Runsheet: <span id="docuflow-runsheet-name">None</span></div>
        </div>
        
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="docuflow-capture-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 Capture Area</button>
          <button id="docuflow-add-text-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">📝 Add Text</button>
          <button id="docuflow-save-row-btn" style="background: rgba(76, 175, 80, 0.8); border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">💾 Save Row</button>
        </div>
      </div>
    `;

    // Add event listeners
    toggleButton.addEventListener('click', togglePanel);
    
    // Append to body
    document.body.appendChild(panelContainer);
    document.body.appendChild(toggleButton);

    // Add panel event listeners
    setupPanelEvents();
    
    // Load current runsheet data
    loadCurrentRunsheet();
  }

  // Panel visibility control
  function togglePanel() {
    const panel = document.getElementById('docuflow-extension-panel');
    if (panel.style.height === '0px' || panel.style.height === '') {
      showPanel();
    } else {
      hidePanel();
    }
  }

  function showPanel() {
    const panel = document.getElementById('docuflow-extension-panel');
    panel.style.height = '200px';
    document.body.style.paddingBottom = '200px';
  }

  function hidePanel() {
    const panel = document.getElementById('docuflow-extension-panel');
    panel.style.height = '0px';
    document.body.style.paddingBottom = '0px';
  }

  // Setup panel event listeners
  function setupPanelEvents() {
    // Close button
    document.getElementById('docuflow-close-panel')?.addEventListener('click', hidePanel);
    
    // Capture button
    document.getElementById('docuflow-capture-btn')?.addEventListener('click', captureScreenArea);
    
    // Add text button
    document.getElementById('docuflow-add-text-btn')?.addEventListener('click', addSelectedText);
    
    // Save row button
    document.getElementById('docuflow-save-row-btn')?.addEventListener('click', saveCurrentRow);
  }

  // Load and display current runsheet
  async function loadCurrentRunsheet() {
    try {
      const result = await browser.storage.local.get(['currentRunsheet']);
      updatePanelDisplay(result.currentRunsheet);
    } catch (error) {
      console.error('Failed to load runsheet:', error);
    }
  }

  function updatePanelDisplay(runsheet) {
    const nameElement = document.getElementById('docuflow-runsheet-name');
    if (nameElement) {
      nameElement.textContent = runsheet ? runsheet.name || 'Unnamed Runsheet' : 'None';
    }
  }

  // User interaction functions
  function captureScreenArea() {
    browser.runtime.sendMessage({
      action: 'captureArea',
      url: window.location.href
    });
  }

  function addSelectedText() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      browser.runtime.sendMessage({
        action: 'addText',
        text: selectedText,
        url: window.location.href
      });
      
      // Visual feedback
      showNotification('Text added to runsheet');
    } else {
      showNotification('No text selected. Please select some text first.');
    }
  }

  async function saveCurrentRow() {
    try {
      const result = await browser.storage.local.get(['currentRunsheet']);
      if (result.currentRunsheet) {
        browser.runtime.sendMessage({
          action: 'saveRow',
          runsheet: result.currentRunsheet
        });
        showNotification('Row saved to runsheet');
      } else {
        showNotification('No active runsheet. Please open DocuFlow to start a runsheet.');
      }
    } catch (error) {
      console.error('Failed to save row:', error);
      showNotification('Failed to save row');
    }
  }

  // Show notification
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: rgba(0,0,0,0.8) !important;
      color: white !important;
      padding: 12px 20px !important;
      border-radius: 6px !important;
      z-index: 2147483649 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  }

  // Message listener for updates from background script
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'updateRunsheet':
        updatePanelDisplay(request.runsheet);
        break;
      case 'showPanel':
        showPanel();
        break;
      case 'hidePanel':
        hidePanel();
        break;
      case 'captureComplete':
        showNotification('Screen captured successfully');
        break;
      case 'captureError':
        showNotification(request.error);
        break;
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createExtensionPanel);
  } else {
    createExtensionPanel();
  }
}