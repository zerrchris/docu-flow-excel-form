// RunsheetPro Extension - Persistent State Management
// Handles state persistence across page navigations

// Persistent state keys - ensure global singleton
var STATE_KEYS = (typeof window !== 'undefined' ? (window.STATE_KEYS || null) : null);
if (!STATE_KEYS) {
  STATE_KEYS = {
    ACTIVE_RUNSHEET: 'extension_active_runsheet',
    USER_SESSION: 'extension_user_session',
    CURRENT_ROW_INDEX: 'extension_current_row_index',
    SNIP_SESSION: 'extension_snip_session',
    FORM_DATA: 'extension_form_data',
    VIEW_MODE: 'extension_view_mode'
  };
  if (typeof window !== 'undefined') window.STATE_KEYS = STATE_KEYS;
}

// Snipping session state
let snipSession = {
  active: false,
  mode: null,
  captures: [],
  currentFormData: {},
  startTime: null
};

// Restore extension state from storage
async function restoreExtensionState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      STATE_KEYS.ACTIVE_RUNSHEET,
      STATE_KEYS.USER_SESSION,
      STATE_KEYS.CURRENT_ROW_INDEX,
      STATE_KEYS.SNIP_SESSION,
      STATE_KEYS.FORM_DATA,
      STATE_KEYS.VIEW_MODE
    ], (result) => {
      console.log('🔧 RunsheetPro Extension: Restoring state:', result);
      
      if (result[STATE_KEYS.ACTIVE_RUNSHEET]) {
        activeRunsheet = result[STATE_KEYS.ACTIVE_RUNSHEET];
        console.log('🔧 RunsheetPro Extension: Restored active runsheet:', activeRunsheet.name);
      }
      
      if (result[STATE_KEYS.USER_SESSION]) {
        userSession = result[STATE_KEYS.USER_SESSION];
        console.log('🔧 RunsheetPro Extension: Restored user session');
      }
      
      if (result[STATE_KEYS.CURRENT_ROW_INDEX] !== undefined) {
        currentRowIndex = result[STATE_KEYS.CURRENT_ROW_INDEX];
        console.log('🔧 RunsheetPro Extension: Restored row index:', currentRowIndex);
      }
      
      if (result[STATE_KEYS.SNIP_SESSION]) {
        snipSession = result[STATE_KEYS.SNIP_SESSION];
        console.log('🔧 RunsheetPro Extension: Restored snip session:', snipSession);
      }
      
      if (result[STATE_KEYS.VIEW_MODE]) {
        currentViewMode = result[STATE_KEYS.VIEW_MODE];
        console.log('🔧 RunsheetPro Extension: Restored view mode:', currentViewMode);
      }
      
      resolve();
    });
  });
}

// Save extension state to storage
function saveExtensionState() {
  // Add domain tracking to snip session
  if (snipSession.active) {
    snipSession.domain = window.location.hostname;
    snipSession.timestamp = Date.now();
  }
  
  const stateToSave = {
    [STATE_KEYS.ACTIVE_RUNSHEET]: activeRunsheet,
    [STATE_KEYS.USER_SESSION]: userSession,
    [STATE_KEYS.CURRENT_ROW_INDEX]: currentRowIndex,
    [STATE_KEYS.SNIP_SESSION]: snipSession,
    [STATE_KEYS.VIEW_MODE]: currentViewMode
  };
  
  chrome.storage.local.set(stateToSave, () => {
    console.log('🔧 RunsheetPro Extension: State saved');
  });
}

// Save current form data
function saveCurrentFormData() {
  if (!runsheetFrame) return;
  
  const inputs = document.querySelectorAll('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
  const formData = {};
  
  inputs.forEach(input => {
    if (input.dataset.column && input.value.trim()) {
      formData[input.dataset.column] = input.value.trim();
    }
  });
  
  chrome.storage.local.set({
    [STATE_KEYS.FORM_DATA]: formData
  }, () => {
    console.log('🔧 RunsheetPro Extension: Form data saved:', formData);
  });
}

// Restore form data
function restoreFormData() {
  chrome.storage.local.get([STATE_KEYS.FORM_DATA], (result) => {
    if (result[STATE_KEYS.FORM_DATA]) {
      const formData = result[STATE_KEYS.FORM_DATA];
      console.log('🔧 RunsheetPro Extension: Restoring form data:', formData);
      
      Object.entries(formData).forEach(([column, value]) => {
        const input = document.querySelector(`input[data-column="${column}"], textarea[data-column="${column}"]`);
        if (input) {
          input.value = value;
          
          // Trigger auto-resize for textareas
          if (input.tagName === 'TEXTAREA') {
            input.style.height = 'auto';
            input.style.height = Math.max(32, input.scrollHeight) + 'px';
          }
        }
      });
    }
  });
}

// Process all captures from snip session
async function processSnipSessionCaptures() {
  if (snipSession.captures.length === 0) return;
  
  console.log(`🔧 RunsheetPro Extension: Processing ${snipSession.captures.length} session captures`);
  
  if (snipSession.captures.length === 1) {
    // Single capture - use directly
    window.currentCapturedSnip = snipSession.captures[0];
  } else {
    // Multiple captures - combine them
    try {
      const combinedImage = await combineImages(snipSession.captures);
      window.currentCapturedSnip = combinedImage;
    } catch (error) {
      console.error('Error combining session captures:', error);
      // Fall back to last capture
      window.currentCapturedSnip = snipSession.captures[snipSession.captures.length - 1];
    }
  }
  
  // Update UI
  updateScreenshotIndicator(true);
  showNotification(`${snipSession.captures.length} captures processed and ready for data entry!`, 'success');
}

// Clean up snip session
function cleanupSnipSession() {
  console.log('🔧 RunsheetPro Extension: Cleaning up snip session');
  
  // Reset session
  snipSession = {
    active: false,
    mode: null,
    captures: [],
    currentFormData: {},
    startTime: null
  };
  
  // Save cleared state
  saveExtensionState();
  
  // Clear form data backup
  chrome.storage.local.remove([STATE_KEYS.FORM_DATA]);
}

// Restore snip session after page navigation
function restoreSnipSession(retryCount = 0) {
  if (!snipSession.active) {
    console.log('🔧 RunsheetPro Extension: No active snip session to restore');
    return;
  }
  
  console.log('🔧 RunsheetPro Extension: Restoring snip session', snipSession);
  
  try {
    // Restore snip mode globally
    snipMode = snipSession.mode;
    console.log('🔧 RunsheetPro Extension: Restored snipMode to:', snipMode);
    
    // Show appropriate controls based on mode
    if (snipSession.mode === 'navigate') {
      // Restore captured snips to the current session
      if (snipSession.captures && snipSession.captures.length > 0) {
        capturedSnips = [...snipSession.captures];
        console.log('🔧 RunsheetPro Extension: Restored', capturedSnips.length, 'captured snips');
      }
      
      // Check if navigation panel already exists
      const existingPanel = document.getElementById('runsheetpro-nav-controls');
      if (existingPanel) {
        console.log('🔧 RunsheetPro Extension: Navigation panel already exists, removing old one');
        existingPanel.remove();
      }
      
      createNavigationControlPanel();
      updateSnipCounter();
      
      // No preview needed - session continues until finished
      console.log('🔧 RunsheetPro Extension: Snip session restored with', snipSession.captures.length, 'captures');
      
      showNotification(`Snip session restored! ${snipSession.captures.length} captures so far. Continue snipping or finish when done.`, 'info');
      console.log('🔧 RunsheetPro Extension: Navigate mode restoration complete');
      
    } else if (snipSession.mode === 'scroll') {
      // Restore captured snips to the current session
      if (snipSession.captures && snipSession.captures.length > 0) {
        capturedSnips = [...snipSession.captures];
        console.log('🔧 RunsheetPro Extension: Restored', capturedSnips.length, 'captured snips');
      }
      
      createSnipControlPanel();
      updateSnipCounter();
      
      // No preview needed - session continues until finished
      console.log('🔧 RunsheetPro Extension: Scroll snip session restored with', snipSession.captures.length, 'captures');
      
      showNotification(`Scroll snip session restored! ${snipSession.captures.length} captures so far.`, 'info');
      console.log('🔧 RunsheetPro Extension: Scroll mode restoration complete');
    }
  } catch (error) {
    console.error('🔧 RunsheetPro Extension: Error restoring snip session:', error);
    // Try again after a longer delay, but limit retries
    if (retryCount < 3) {
      setTimeout(() => {
        console.log('🔧 RunsheetPro Extension: Retrying snip session restoration, attempt', retryCount + 1);
        restoreSnipSession(retryCount + 1);
      }, 2000);
    } else {
      console.error('🔧 RunsheetPro Extension: Max retries reached, giving up on snip session restoration');
    }
  }
}

// Initialize extension with state restoration
async function initializeExtensionWithStateRestore() {
  console.log('🔧 RunsheetPro Extension: Initializing with state restoration');
  
  try {
    // Restore persistent state first
    await restoreExtensionState();
    
    // Check authentication - if we have stored session, we should be good
    if (userSession) {
      console.log('🔧 RunsheetPro Extension: Using restored user session');
    } else {
      // Try to check auth normally
      await checkAuth();
    }
    
    // Create the UI
    createRunsheetButton();
    
    // If we have an active runsheet, show the frame
    if (activeRunsheet && userSession) {
      createRunsheetFrame();
      if (runsheetFrame) {
        runsheetFrame.style.display = 'block';
        document.body.appendChild(runsheetFrame);
        setupFrameEventListeners();
        
        // Restore form data after a short delay
        setTimeout(() => {
          restoreFormData();
        }, 100);
      }
    }
    
    // Check if we should restore snip session based on context
    if (snipSession.active) {
      console.log('🔧 RunsheetPro Extension: Found active snip session', snipSession);
      
      // Only auto-restore on the same domain or for navigate/scroll modes that persist across domains
      const currentDomain = window.location.hostname;
      const sessionDomain = snipSession.domain || '';
      const sameOrigin = currentDomain === sessionDomain;
      
      // Auto-restore for navigate/scroll modes or same domain
      if ((snipSession.mode === 'navigate' || snipSession.mode === 'scroll') || sameOrigin) {
        console.log('🔧 RunsheetPro Extension: Auto-restoring snip session (mode:', snipSession.mode, ', same domain:', sameOrigin, ')');
        setTimeout(() => {
          restoreSnipSession();
        }, 1000);
      } else {
        // Different domain - ask user if they want to continue the session
        console.log('🔧 RunsheetPro Extension: Different domain detected, asking user about session continuation');
        setTimeout(() => {
          askUserAboutSessionContinuation();
        }, 2000);
      }
    } else {
      console.log('🔧 RunsheetPro Extension: No active snip session to restore');
    }
    
}

// Ask user about continuing snip session on different domain
function askUserAboutSessionContinuation() {
  if (!document.body) {
    setTimeout(askUserAboutSessionContinuation, 500);
    return;
  }
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0.8) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483647 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white !important;
    border-radius: 12px !important;
    padding: 24px !important;
    max-width: 400px !important;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
    text-align: center !important;
  `;
  
  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #1f2937; font-size: 18px;">Continue Snip Session?</h3>
    <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
      You have an active snip session from a different website. Would you like to continue it here?
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="continue-session" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 14px;">
        Continue Session
      </button>
      <button id="start-fresh" style="background: #6b7280; color: white; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 14px;">
        Start Fresh
      </button>
    </div>
  `;
  
  const continueBtn = dialog.querySelector('#continue-session');
  const startFreshBtn = dialog.querySelector('#start-fresh');
  
  continueBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
    restoreSnipSession();
  });
  
  startFreshBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
    clearSnipSession();
  });
  
  modal.appendChild(dialog);
  document.body.appendChild(modal);
}

// Clear snip session
function clearSnipSession() {
  snipSession = {
    active: false,
    mode: 'single',
    captures: []
  };
  saveExtensionState();
  console.log('🔧 RunsheetPro Extension: Snip session cleared');
}

// Initialize when content script loads
console.log('🔧 RunsheetPro Extension: Persistent state script loaded');

// Don't auto-initialize from here - let content.js handle it
// The content.js will call this when needed