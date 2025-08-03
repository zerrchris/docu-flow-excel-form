// RunsheetPro Extension - Persistent State Management
// Handles state persistence across page navigations

// Persistent state keys
const STATE_KEYS = {
  ACTIVE_RUNSHEET: 'extension_active_runsheet',
  USER_SESSION: 'extension_user_session', 
  CURRENT_ROW_INDEX: 'extension_current_row_index',
  SNIP_SESSION: 'extension_snip_session',
  FORM_DATA: 'extension_form_data',
  VIEW_MODE: 'extension_view_mode'
};

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
function restoreSnipSession() {
  if (!snipSession.active) return;
  
  console.log('🔧 RunsheetPro Extension: Restoring snip session');
  
  // Show appropriate controls based on mode
  if (snipSession.mode === 'navigate') {
    showNavigateSnipControls();
    updateSnipCounter();
    
    // Show preview if there are captures
    if (snipSession.captures.length > 0) {
      showSnipPreview();
    }
    
    showNotification(`Snip session restored! ${snipSession.captures.length} captures so far. Continue snipping or finish when done.`, 'info');
  } else if (snipSession.mode === 'scroll') {
    showScrollSnipControls();
    updateSnipCounter();
    
    if (snipSession.captures.length > 0) {
      showSnipPreview();
    }
    
    showNotification(`Scroll snip session restored! ${snipSession.captures.length} captures so far.`, 'info');
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
    
    // If we had an active snip session, restore it
    if (snipSession.active) {
      console.log('🔧 RunsheetPro Extension: Restoring active snip session');
      setTimeout(() => {
        restoreSnipSession();
      }, 500); // Give UI time to initialize
    }
    
  } catch (error) {
    console.error('🔧 RunsheetPro Extension: Error initializing with state restore:', error);
    // Fall back to normal initialization
    initializeExtension();
  }
}