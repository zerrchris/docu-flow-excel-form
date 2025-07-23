// Content script - injected into every webpage
(function() {
  'use strict';

  // Avoid injecting multiple times
  if (window.docuflowInjected) return;
  window.docuflowInjected = true;

  let isVisible = false;
  let panelContainer = null;
  let currentRunsheet = null;

  // Create the bottom panel
  function createPanel() {
    panelContainer = document.createElement('div');
    panelContainer.id = 'docuflow-panel-container';
    panelContainer.style.cssText = `
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 0px !important;
      background: white !important;
      border-top: 2px solid #e2e8f0 !important;
      box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1) !important;
      z-index: 999999 !important;
      transition: height 0.3s ease !important;
      overflow: hidden !important;
      font-family: system-ui, -apple-system, sans-serif !important;
    `;

    // Toggle button
    const toggleButton = document.createElement('button');
    toggleButton.id = 'docuflow-toggle-btn';
    toggleButton.innerHTML = '📋 Runsheet';
    toggleButton.style.cssText = `
      position: fixed !important;
      bottom: 10px !important;
      right: 20px !important;
      background: #3b82f6 !important;
      color: white !important;
      border: none !important;
      padding: 8px 16px !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      z-index: 1000000 !important;
      font-size: 14px !important;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    `;

    toggleButton.addEventListener('click', togglePanel);

    // Panel content
    const panelContent = document.createElement('div');
    panelContent.id = 'docuflow-panel-content';
    panelContent.style.cssText = `
      padding: 16px !important;
      height: 200px !important;
      overflow-y: auto !important;
    `;

    panelContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; color: #1f2937; font-size: 16px;">Current Runsheet Row</h3>
        <div>
          <button id="capture-area-btn" style="background: #10b981; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-right: 8px; cursor: pointer;">📸 Capture Area</button>
          <button id="close-panel-btn" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">✕</button>
        </div>
      </div>
      <div id="runsheet-data" style="background: #f9fafb; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
        <p style="margin: 0; color: #6b7280;">No active runsheet. Open the extension popup to start.</p>
      </div>
      <div id="quick-actions" style="display: flex; gap: 8px;">
        <button id="add-text-btn" style="background: #6366f1; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Add Text</button>
        <button id="save-row-btn" style="background: #059669; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Save Row</button>
      </div>
    `;

    panelContainer.appendChild(panelContent);
    document.body.appendChild(panelContainer);
    document.body.appendChild(toggleButton);

    // Add event listeners
    document.getElementById('close-panel-btn').addEventListener('click', hidePanel);
    document.getElementById('capture-area-btn').addEventListener('click', captureScreenArea);
    document.getElementById('add-text-btn').addEventListener('click', addSelectedText);
    document.getElementById('save-row-btn').addEventListener('click', saveCurrentRow);

    loadCurrentRunsheet();
  }

  function togglePanel() {
    if (isVisible) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function showPanel() {
    if (panelContainer) {
      panelContainer.style.height = '220px';
      isVisible = true;
      // Adjust page content
      document.body.style.paddingBottom = '220px';
    }
  }

  function hidePanel() {
    if (panelContainer) {
      panelContainer.style.height = '0px';
      isVisible = false;
      // Reset page content
      document.body.style.paddingBottom = '0px';
    }
  }

  function loadCurrentRunsheet() {
    // Get current runsheet from storage
    browser.storage.local.get(['currentRunsheet']).then(result => {
      currentRunsheet = result.currentRunsheet;
      updatePanelDisplay();
    });
  }

  function updatePanelDisplay() {
    const dataDiv = document.getElementById('runsheet-data');
    if (currentRunsheet && dataDiv) {
      dataDiv.innerHTML = `
        <div style="margin-bottom: 8px;">
          <strong>Runsheet:</strong> ${currentRunsheet.name}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Current Row:</strong> ${currentRunsheet.currentRowIndex || 0}
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          ${currentRunsheet.columns?.length || 0} columns configured
        </div>
      `;
    }
  }

  function captureScreenArea() {
    // Send message to background script to capture
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
    } else {
      alert('Please select some text first');
    }
  }

  function saveCurrentRow() {
    if (currentRunsheet) {
      browser.runtime.sendMessage({
        action: 'saveRow',
        runsheet: currentRunsheet
      });
    }
  }

  // Listen for messages from background/popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'updateRunsheet':
        currentRunsheet = message.runsheet;
        updatePanelDisplay();
        break;
      case 'showPanel':
        showPanel();
        break;
      case 'hidePanel':
        hidePanel();
        break;
      case 'getAuthStatus':
        // Check if we're on the web app domain and can access auth status
        if (window.location.hostname.includes('lovableproject.com')) {
          getWebAppAuthStatus().then(authData => {
            sendResponse(authData);
          });
          return true; // Keep the message channel open for async response
        } else {
          sendResponse({ authenticated: false });
        }
        break;
      case 'togglePanel':
        togglePanel();
        break;
    }
  });

  // Function to get auth status from the web app
  async function getWebAppAuthStatus() {
    try {
      // Try to access the Supabase client from the web app
      if (window.supabase || (window as any).supabase) {
        const supabase = window.supabase || (window as any).supabase;
        const { data: { session } } = await supabase.auth.getSession();
        
        return {
          authenticated: !!session,
          token: session?.access_token || null
        };
      }
      
      // Fallback: try to access localStorage directly
      const supabaseSession = localStorage.getItem('sb-xnpmrafjjqsissbtempj-auth-token');
      if (supabaseSession) {
        const sessionData = JSON.parse(supabaseSession);
        return {
          authenticated: !!sessionData.access_token,
          token: sessionData.access_token
        };
      }
      
      return { authenticated: false };
    } catch (error) {
      console.log('Error getting auth status:', error);
      return { authenticated: false };
    }
  }

  // Initialize panel
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();