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
    VIEW_MODE: 'extension_view_mode',
    MASS_CAPTURE_MODE: 'extension_mass_capture_mode'
  };
  if (typeof window !== 'undefined') window.STATE_KEYS = STATE_KEYS;
}

// Snipping session state - make it globally accessible
window.snipSession = window.snipSession || {
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
      STATE_KEYS.VIEW_MODE,
      STATE_KEYS.MASS_CAPTURE_MODE,
      // Legacy/fallback keys
      'activeRunsheet',
      'active_runsheet',
      'supabase_session'
    ], (result) => {
      console.log('🔧 RunsheetPro Extension: Restoring state:', result);
      
      // Active runsheet (prefer new key, fallback to legacy keys)
      if (result[STATE_KEYS.ACTIVE_RUNSHEET]) {
        activeRunsheet = result[STATE_KEYS.ACTIVE_RUNSHEET];
      } else if (result.activeRunsheet) {
        activeRunsheet = result.activeRunsheet;
      } else if (result.active_runsheet) {
        activeRunsheet = result.active_runsheet;
      }
      if (activeRunsheet) {
        console.log('🔧 RunsheetPro Extension: Restored active runsheet:', activeRunsheet.name);
      }
      
      // User session (prefer new key, fallback to supabase_session)
      if (result[STATE_KEYS.USER_SESSION]) {
        userSession = result[STATE_KEYS.USER_SESSION];
      } else if (result.supabase_session) {
        userSession = result.supabase_session;
      }
      if (userSession) {
        console.log('🔧 RunsheetPro Extension: Restored user session');
      }
      
      if (result[STATE_KEYS.CURRENT_ROW_INDEX] !== undefined) {
        currentRowIndex = result[STATE_KEYS.CURRENT_ROW_INDEX];
        console.log('🔧 RunsheetPro Extension: Restored row index:', currentRowIndex);
      }
      
      if (result[STATE_KEYS.SNIP_SESSION]) {
        window.snipSession = result[STATE_KEYS.SNIP_SESSION];
        console.log('🔧 RunsheetPro Extension: Restored snip session:', window.snipSession);
        
        // Update global currentSnipSession to match the restored state
        if (typeof window.currentSnipSession !== 'undefined') {
          window.currentSnipSession.isActive = window.snipSession.active;
          window.currentSnipSession.captures = window.snipSession.captures || [];
        }
      }
      
      if (result[STATE_KEYS.VIEW_MODE]) {
        currentViewMode = result[STATE_KEYS.VIEW_MODE];
        console.log('🔧 RunsheetPro Extension: Restored view mode:', currentViewMode);
      }
      
      // Restore mass capture mode state
      if (result[STATE_KEYS.MASS_CAPTURE_MODE]) {
        const massCaptureState = result[STATE_KEYS.MASS_CAPTURE_MODE];
        isMassCaptureMode = massCaptureState.active || false;
        massCaptureCount = massCaptureState.count || 0;
        massCaptureStartRow = massCaptureState.startRow || 0;
        console.log('🔧 RunsheetPro Extension: Restored mass capture mode:', {
          active: isMassCaptureMode,
          count: massCaptureCount,
          startRow: massCaptureStartRow
        });
      }
      
      resolve();
    });
  });
}

// Save extension state to storage
function saveExtensionState() {
  // Add domain tracking to snip session
  if (window.snipSession.active) {
    window.snipSession.domain = window.location.hostname;
    window.snipSession.timestamp = Date.now();
  }
  
  const stateToSave = {
    [STATE_KEYS.ACTIVE_RUNSHEET]: activeRunsheet,
    [STATE_KEYS.USER_SESSION]: userSession,
    [STATE_KEYS.CURRENT_ROW_INDEX]: currentRowIndex,
    [STATE_KEYS.SNIP_SESSION]: window.snipSession,
    [STATE_KEYS.VIEW_MODE]: currentViewMode,
    [STATE_KEYS.MASS_CAPTURE_MODE]: {
      active: isMassCaptureMode,
      count: massCaptureCount,
      startRow: massCaptureStartRow
    },
    // Mirror to legacy keys for compatibility
    activeRunsheet: activeRunsheet,
    active_runsheet: activeRunsheet,
    supabase_session: userSession
  };
  
  chrome.storage.local.set(stateToSave, () => {
    console.log('🔧 RunsheetPro Extension: State saved (with legacy mirrors)');
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
  if (window.snipSession.captures.length === 0) return;
  
  console.log(`🔧 RunsheetPro Extension: Processing ${window.snipSession.captures.length} session captures`);
  
  if (window.snipSession.captures.length === 1) {
    // Single capture - use directly
    window.currentCapturedSnip = window.snipSession.captures[0];
  } else {
    // Multiple captures - combine them
    try {
      const combinedImage = await combineImages(window.snipSession.captures);
      window.currentCapturedSnip = combinedImage;
    } catch (error) {
      console.error('Error combining session captures:', error);
      // Fall back to last capture
      window.currentCapturedSnip = window.snipSession.captures[window.snipSession.captures.length - 1];
    }
  }
  
  // Update UI
  updateScreenshotIndicator(true);
  showNotification(`${window.snipSession.captures.length} captures processed and ready for data entry!`, 'success');
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

// Clean up snip session but preserve captured snip data for viewing
function cleanupSnipSessionPreserveData() {
  console.log('🔧 RunsheetPro Extension: Cleaning up snip session but preserving captured snip data');
  
  // Reset session but preserve any processed snip data
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
  
  // Note: window.currentCapturedSnip and window.currentSnipFilename are preserved
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
      
      // Hide main UI and create the modern navigate control panel
      const runsheetFrame = document.getElementById('runsheetpro-runsheet-frame');
      const runsheetButton = document.getElementById('runsheetpro-runsheet-button');
      
      if (runsheetFrame) {
        runsheetFrame.style.setProperty('display', 'none', 'important');
        runsheetFrame.style.setProperty('visibility', 'hidden', 'important');
      }
      if (runsheetButton) {
        runsheetButton.style.display = 'none';
      }
      
      // Remove any existing panels (old and new)
      const existingOldPanel = document.getElementById('runsheetpro-nav-controls');
      const existingNewPanel = document.getElementById('runsheetpro-snip-control-panel');
      if (existingOldPanel) existingOldPanel.remove();
      if (existingNewPanel) existingNewPanel.remove();
      
      // Set the global snip mode properly  
      window.snipMode = 'navigate';
      window.isSnipMode = false; // We're between snips during navigation
      
      // Create the modern navigate control panel (dark panel with counter) using a delayed approach
      // to ensure the content script functions are available
      setTimeout(() => {
        // Remove any legacy panels just in case
        const legacy = document.getElementById('runsheetpro-snip-controls');
        if (legacy) legacy.remove();

        if (typeof window.createSnipControlPanel === 'function') {
          window.createSnipControlPanel();
          if (typeof window.updateSnipControlPanel === 'function') {
            window.updateSnipControlPanel();
          }
        } else {
          // Minimal fallback panel
          let panel = document.getElementById('runsheetpro-snip-control-panel');
          if (!panel) {
            panel = document.createElement('div');
            panel.id = 'runsheetpro-snip-control-panel';
            panel.style.cssText = 'position: fixed !important; bottom: 20px !important; right: 20px !important; background: rgba(0,0,0,.8) !important; color:#fff !important; border-radius:8px !important; padding:12px !important; z-index:2147483647 !important; display:flex !important; gap:8px !important; align-items:center !important;';
            panel.innerHTML = '<div style="font-weight:600;">Snip Session</div><button id="snip-fallback-next" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:6px 10px;cursor:pointer;">Next Snip</button><button id="snip-fallback-finish" style="background:#22c55e;color:#fff;border:none;border-radius:4px;padding:6px 10px;cursor:pointer;">Finish</button>';
            document.body.appendChild(panel);
            const nextBtn = panel.querySelector('#snip-fallback-next');
            const finBtn = panel.querySelector('#snip-fallback-finish');
            if (nextBtn) nextBtn.addEventListener('click', () => {
              if (typeof window.resumeSnipMode === 'function') window.resumeSnipMode();
            });
            if (finBtn) finBtn.addEventListener('click', () => {
              if (typeof window.finishSnipping === 'function') window.finishSnipping();
            });
          }
        }
      }, 100);
      
      
      // No preview needed - session continues until finished
      console.log('🔧 RunsheetPro Extension: Snip session restored with', window.snipSession.captures.length, 'captures');
      
      showNotification(`Snip session restored! ${window.snipSession.captures.length} captures so far. Continue snipping or finish when done.`, 'info');
      console.log('🔧 RunsheetPro Extension: Navigate mode restoration complete');
      
    } else if (window.snipSession.mode === 'scroll') {
      // Restore captured snips to the current session
      if (window.snipSession.captures && window.snipSession.captures.length > 0) {
        capturedSnips = [...window.snipSession.captures];
        console.log('🔧 RunsheetPro Extension: Restored', capturedSnips.length, 'captured snips');
      }
      
      createSnipControlPanel();
      if (typeof window.updateSnipControlPanel === 'function') { window.updateSnipControlPanel(); }
      
      // No preview needed - session continues until finished
      console.log('🔧 RunsheetPro Extension: Scroll snip session restored with', window.snipSession.captures.length, 'captures');
      
      showNotification(`Scroll snip session restored! ${window.snipSession.captures.length} captures so far.`, 'info');
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
    
    // Check if we're in navigate snip mode - if so, skip regular UI creation but restore the panel
    if (window.snipSession && window.snipSession.active && window.snipSession.mode === 'navigate') {
      console.log('🔧 RunsheetPro Extension: Navigate mode active, skipping regular UI initialization and restoring snip panel');
      console.log('🔧 RunsheetPro Extension: Snip session has', window.snipSession.captures?.length || 0, 'captures');

      // Update global currentSnipSession to match the restored state
      if (typeof window.currentSnipSession !== 'undefined') {
        window.currentSnipSession.isActive = window.snipSession.active;
        window.currentSnipSession.captures = window.snipSession.captures || [];
      }

      // Hide main UI
      const runsheetFrameEl = document.getElementById('runsheetpro-runsheet-frame');
      const runsheetButtonEl = document.getElementById('runsheetpro-runsheet-button');
      if (runsheetFrameEl) {
        runsheetFrameEl.style.setProperty('display', 'none', 'important');
        runsheetFrameEl.style.setProperty('visibility', 'hidden', 'important');
      }
      if (runsheetButtonEl) {
        runsheetButtonEl.style.display = 'none';
      }

      // Remove any existing panels (old and new)
      ['runsheetpro-nav-controls','runsheetpro-snip-controls','runsheetpro-snip-control-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });

      // Ensure mode globals
      window.snipMode = 'navigate';

      // Update context menu to show proper options
      const snipCount = window.snipSession.captures?.length || 0;
      chrome.runtime.sendMessage({
        action: 'updateContextMenu',
        mode: 'snip_navigate',
        snipCount: snipCount
      });

      // Recreate the modern control panel shortly (after content.js functions are ready)
      setTimeout(() => {
        if (typeof window.createSnipControlPanel === 'function') {
          window.createSnipControlPanel();
          if (typeof window.updateSnipControlPanel === 'function') {
            window.updateSnipControlPanel();
          }
        } else {
          // Create snip panel directly with fallback
          createNavigateSnipPanel(snipCount);
        }
      }, 100);

      return;
    }
    
    // Create the UI
    createRunsheetButton();
    
    // If we have an active runsheet, show the frame
    if (activeRunsheet && userSession) {
      await createRunsheetFrame();
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
    
    // Restore mass capture mode if it was active
    if (isMassCaptureMode && activeRunsheet) {
      console.log('🔧 RunsheetPro Extension: Restoring mass capture mode');
      // Hide the button and frame since we're in mass capture mode
      if (runsheetButton) {
        runsheetButton.style.display = 'none';
      }
      if (runsheetFrame) {
        runsheetFrame.style.display = 'none';
      }
      // Recreate the mass capture panel
      createMassCapturePanel();
      // Disable context menu initially (will be enabled when user starts a document session)
      chrome.runtime.sendMessage({ action: 'updateSnipContextMenu', enabled: false });
    }
    
    // Check if we should restore snip session based on context
    if (window.snipSession.active) {
      console.log('🔧 RunsheetPro Extension: Found active snip session', window.snipSession);
      console.log('🔧 RunsheetPro Extension: Current context - isMassCaptureMode:', isMassCaptureMode, 'currentViewMode:', currentViewMode);
      
      // Don't restore snip sessions if we're in mass capture mode
      if (isMassCaptureMode) {
        console.log('🔧 RunsheetPro Extension: Skipping snip session restoration - mass capture mode is active');
        return;
      }
      
      // Don't restore snip sessions if we're in quick view mode (full screen view)
      if (currentViewMode === 'full') {
        console.log('🔧 RunsheetPro Extension: Skipping snip session restoration - quick view mode is active');
        return;
      }
      
      // For navigate/scroll modes, always restore regardless of existing UI since these modes 
      // are designed to persist across navigation and the UI will be recreated
      const isNavigateOrScrollMode = (window.snipSession.mode === 'navigate' || window.snipSession.mode === 'scroll');
      
      if (!isNavigateOrScrollMode) {
        // For single mode, check if there's existing UI before restoring
        const hasActiveSnipUI = document.querySelector('.snip-context-menu') || 
                                document.querySelector('.snip-overlay') ||
                                document.querySelector('.crosshair-cursor');
        
        if (!hasActiveSnipUI) {
          console.log('🔧 RunsheetPro Extension: No active snip UI detected for single mode - clearing stale session');
          clearSnipSession();
          return;
        }
      }
      
      // Navigate/scroll modes persist across navigation - recreate the UI
      
      // Additional check: if runsheet frame is visible and NOT in navigate/scroll mode, we're likely in quick view
      if (runsheetFrame && runsheetFrame.style.display !== 'none' && !isNavigateOrScrollMode) {
        console.log('🔧 RunsheetPro Extension: Skipping snip session restoration - runsheet frame is visible (likely quick view) and not in navigate/scroll mode');
        return;
      }
      
      // Only auto-restore on the same domain or for navigate/scroll modes that persist across domains
      const currentDomain = window.location.hostname;
      const sessionDomain = window.snipSession.domain || '';
      const sameOrigin = currentDomain === sessionDomain;
      
      // Auto-restore for navigate/scroll modes or same domain
      const shouldAutoRestore = (window.snipSession.mode === 'navigate' || window.snipSession.mode === 'scroll') || sameOrigin;
      
      if (shouldAutoRestore) {
        console.log('🔧 RunsheetPro Extension: Auto-restoring snip session (mode:', window.snipSession.mode, ', same domain:', sameOrigin, ')');
        setTimeout(() => {
          restoreSnipSession();
        }, 1000);
      } else {
        // Different domain - ask user if they want to continue the session, but only if no quickview is already shown
        console.log('🔧 RunsheetPro Extension: Different domain detected, checking if quickview is active');
        if (!runsheetFrame || runsheetFrame.style.display === 'none') {
          console.log('🔧 RunsheetPro Extension: No quickview active, asking user about session continuation');
          setTimeout(() => {
            askUserAboutSessionContinuation();
          }, 2000);
        } else {
          console.log('🔧 RunsheetPro Extension: Quickview is active, not showing session dialog');
          // Silently clear the session since user is already working on something else
          clearSnipSession();
        }
      }
    } else {
      console.log('🔧 RunsheetPro Extension: No active snip session to restore');
    }
  } catch (error) {
    console.error('🔧 RunsheetPro Extension: Error during initialization with state restore:', error);
  }
}

// Ask user about continuing snip session on different domain
function askUserAboutSessionContinuation() {
  if (!document.body) {
    setTimeout(askUserAboutSessionContinuation, 500);
    return;
  }
  
  // Check if there are any existing extension modals or UI elements
  const existingModal = document.querySelector('[id*="runsheetpro"]');
  if (existingModal) {
    console.log('🔧 RunsheetPro Extension: Extension UI already active, clearing snip session silently');
    clearSnipSession();
    return;
  }
  
  const modal = document.createElement('div');
  modal.id = 'runsheetpro-session-modal';
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
    z-index: 1000000 !important;
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

// Create fallback snip panel for navigate mode
function createNavigateSnipPanel(snipCount = 0) {
  console.log('🔧 RunsheetPro Extension: Creating navigate snip panel with count:', snipCount);
  
  // Remove any existing panels first
  ['runsheetpro-nav-controls','runsheetpro-snip-controls','runsheetpro-snip-control-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  
  // Create the modern snip control panel
  const panel = document.createElement('div');
  panel.id = 'runsheetpro-snip-control-panel';
  panel.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    background: #1a1f2e !important;
    border: 1px solid #333 !important;
    border-radius: 8px !important;
    padding: 12px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
    z-index: 2147483647 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    color: white !important;
    min-width: 200px !important;
  `;
  
  panel.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="font-size: 14px; font-weight: 500;">📸 Snip & Navigate</span>
      <span style="background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${snipCount}</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="nextSnipBtn" style="
        background: #4f46e5;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        flex: 1;
      ">Next Snip</button>
      <button id="finishSnipBtn" style="
        background: #059669;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        flex: 1;
      ">Finish</button>
    </div>
  `;
  
  // Add event listeners with fallbacks
  const nextBtn = panel.querySelector('#nextSnipBtn');
  const finishBtn = panel.querySelector('#finishSnipBtn');
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (typeof performNextSnip === 'function') {
        performNextSnip();
      } else if (typeof window.performNextSnip === 'function') {
        window.performNextSnip();
      } else {
        chrome.runtime.sendMessage({ action: 'performNextSnip' });
      }
    });
  }
  
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (typeof finishSnipping === 'function') {
        finishSnipping();
      } else if (typeof window.finishSnipping === 'function') {
        window.finishSnipping();
      } else {
        chrome.runtime.sendMessage({ action: 'finishSnipping' });
      }
    });
  }
  
  document.body.appendChild(panel);
  console.log('🔧 RunsheetPro Extension: Navigate snip panel created with', snipCount, 'captures');
}

// Don't auto-initialize from here - let content.js handle it
// The content.js will call this when needed