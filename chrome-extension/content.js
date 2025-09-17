// RunsheetPro Runsheet Assistant - Content Script

// Suppress external script errors (jQuery, Bootstrap, etc.)
const originalError = window.onerror;
window.onerror = function(message, source, lineno, colno, error) {
  // Suppress jQuery/Bootstrap syntax errors from external scripts
  if (message && message.includes && (
    message.includes('Syntax error, unrecognized expression') ||
    message.includes('jquery') ||
    message.includes('bootstrap')
  )) {
    console.warn('🔧 RunsheetPro Extension: Suppressed external script error');
    return true; // Prevent default error handling
  }
  
  // Call original error handler for other errors
  if (originalError) {
    return originalError.apply(this, arguments);
  }
  return false;
};

// IMMEDIATE TEST - This should appear in console if script loads
console.log('🔧 RUNSHEETPRO EXTENSION LOADED 🔧');

// Load enhanced snip workflow
const enhancedSnipScript = document.createElement('script');
enhancedSnipScript.src = chrome.runtime.getURL('enhanced-snip-workflow.js');
document.head.appendChild(enhancedSnipScript);
console.log('🔧 RunsheetPro Extension: Content script loading started');
console.log('🔧 RunsheetPro Extension: Document ready state:', document.readyState);

// Global variables
let runsheetButton = null;
let runsheetFrame = null;
let activeRunsheet = null;
let captures = [];
let isCapturing = false;
let userSession = null;
let currentViewMode = 'single'; // 'single' or 'full'
let currentRowIndex = 0; // Track current row being edited
let screenshotAddedToSheet = false; // Track if current screenshot has been added to sheet

// Snip mode variables
let isSnipMode = false;
let snipMode = 'single'; // 'single', 'scroll', 'navigate'
let snipOverlay = null;
let snipSelection = null;
let capturedSnips = [];
let snipControlPanel = null;

// Check authentication status
async function checkAuth() {
  try {
    console.log('🔧 Checking auth - requesting storage');
    const authData = await chrome.storage.local.get(['supabase_session']);
    console.log('🔧 Auth data retrieved:', !!authData.supabase_session);
    
    if (authData.supabase_session && authData.supabase_session.access_token) {
      userSession = authData.supabase_session;
      console.log('🔧 User authenticated');
      return true;
    }
    console.log('🔧 No authentication found');
    return false;
  } catch (error) {
    console.error('🔧 Auth check failed:', error);
    // Show error and allow fallback
    showNotification('Authentication check failed. Try refreshing the page.', 'error');
    return false;
  }
}

// Create the floating runsheet button
function createRunsheetButton() {
  console.log('🔧 RunsheetPro Extension: createRunsheetButton() called');
  console.log('🔧 RunsheetPro Extension: Current button element:', runsheetButton);
  
  if (runsheetButton) {
    console.log('🔧 RunsheetPro Extension: Button already exists, checking if attached to DOM');
    if (document.body && document.body.contains(runsheetButton)) {
      console.log('🔧 RunsheetPro Extension: Button exists and is in DOM, skipping creation');
      return;
    } else {
      console.log('🔧 RunsheetPro Extension: Button exists but not in DOM, recreating');
      runsheetButton = null;
    }
  }
  
  console.log('🔧 RunsheetPro Extension: Creating new runsheet button');
  
  runsheetButton = document.createElement('div');
  runsheetButton.id = 'runsheetpro-runsheet-button';
  runsheetButton.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    width: 60px !important;
    height: 60px !important;
    background: linear-gradient(135deg, hsl(215 80% 40%), hsl(230 60% 60%)) !important;
    border-radius: 50% !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
    cursor: pointer !important;
    z-index: 2147483646 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 24px !important;
    color: white !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    transition: all 0.3s ease !important;
    user-select: none !important;
  `;
  runsheetButton.innerHTML = '⚡';
  runsheetButton.title = 'RunsheetPro Runsheet Assistant';
  console.log('🔧 RunsheetPro Extension: Button HTML and styles set, about to add event listeners');
  
  // Hover effects
  console.log('🔧 RunsheetPro Extension: Adding mouseenter event listener');
  runsheetButton.addEventListener('mouseenter', () => {
    runsheetButton.style.transform = 'scale(1.1)';
    runsheetButton.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
  });
  console.log('🔧 RunsheetPro Extension: Adding mouseleave event listener');
  
  runsheetButton.addEventListener('mouseleave', () => {
    runsheetButton.style.transform = 'scale(1)';
    runsheetButton.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
  });
  console.log('🔧 RunsheetPro Extension: Adding click event listener');
  
  // Click handler
  runsheetButton.addEventListener('click', async () => {
    console.log('🔧 Button clicked - checking state');
    
    if (runsheetFrame && runsheetFrame.style.display !== 'none') {
      console.log('🔧 Toggling existing frame');
      toggleRunsheetFrame();
    } else {
      console.log('🔧 Checking authentication...');
      const isAuthenticated = await checkAuth();
      console.log('🔧 Auth result:', isAuthenticated);
      
      if (isAuthenticated) {
        console.log('🔧 Showing runsheet selector');
        showRunsheetSelector();
      } else {
        console.log('🔧 Showing sign-in popup');
        showSignInPopup();
      }
    }
  });
  console.log('🔧 RunsheetPro Extension: All event listeners added, proceeding to DOM append');
  
  console.log('🔧 RunsheetPro Extension: About to append button to document.body');
  console.log('🔧 RunsheetPro Extension: document.body exists:', !!document.body);
  console.log('🔧 RunsheetPro Extension: document.readyState:', document.readyState);
  
  if (!document.body) {
    console.error('🔧 RunsheetPro Extension: document.body is not available, cannot append button');
    return;
  }
  
  document.body.appendChild(runsheetButton);
  console.log('🔧 RunsheetPro Extension: Runsheet button created and added to DOM');
  console.log('🔧 RunsheetPro Extension: Button is in DOM:', document.body.contains(runsheetButton));
  
  // Add debug button for testing
  const debugButton = document.createElement('div');
  debugButton.style.cssText = runsheetButton.style.cssText;
  debugButton.style.right = '90px !important';
  debugButton.innerHTML = '🔧';
  debugButton.title = 'Debug Extension';
  debugButton.addEventListener('click', () => {
    console.log('🔧 Debug clicked');
    // Force show sign-in popup
    showSignInPopup();
  });
  document.body.appendChild(debugButton);
}

// Show sign-in popup
function showSignInPopup() {
  console.log('🔧 RunsheetPro Extension: Showing sign-in popup');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'runsheetpro-signin-popup';
  dialog.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: hsl(var(--background, 0 0% 100%)) !important;
    border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
    border-radius: 8px !important;
    padding: 24px !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483647 !important;
    width: 350px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    color: hsl(var(--foreground, 222 47% 11%)) !important;
  `;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483646 !important;
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Sign In to RunsheetPro</h3>
      <button id="close-signin" style="background: none; border: none; font-size: 20px; cursor: pointer; color: hsl(var(--muted-foreground, 215 16% 47%));">×</button>
    </div>
    <form id="signin-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Email</label>
        <input type="email" id="signin-email" required style="width: 100%; padding: 8px 12px; border: 1px solid hsl(var(--border, 214 32% 91%)); border-radius: 6px; font-size: 14px;">
      </div>
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Password</label>
        <input type="password" id="signin-password" required style="width: 100%; padding: 8px 12px; border: 1px solid hsl(var(--border, 214 32% 91%)); border-radius: 6px; font-size: 14px;">
      </div>
      <button type="submit" id="signin-submit" style="padding: 10px; background: hsl(var(--primary, 215 80% 40%)); color: hsl(var(--primary-foreground, 210 40% 98%)); border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
        Sign In
      </button>
      <div id="signin-error" style="display: none; color: hsl(var(--destructive, 0 84% 60%)); font-size: 12px; text-align: center;"></div>
    </form>
    <div style="text-align: center; margin-top: 16px; font-size: 12px; color: hsl(var(--muted-foreground, 215 16% 47%));">
      Don't have an account? <a href="#" id="open-main-app" style="color: hsl(var(--primary, 215 80% 40%)); text-decoration: none;">Open main app to sign up</a>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  function closeSignIn() {
    document.body.removeChild(overlay);
    document.body.removeChild(dialog);
  }

  // Event listeners
  document.getElementById('close-signin').addEventListener('click', closeSignIn);
  overlay.addEventListener('click', closeSignIn);
  
  document.getElementById('open-main-app').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(window.location.origin, '_blank');
    closeSignIn();
  });

  // Handle form submission
  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    const submitBtn = document.getElementById('signin-submit');
    const errorDiv = document.getElementById('signin-error');
    
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;
    errorDiv.style.display = 'none';
    
    try {
      const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.access_token) {
        // Store session
        await chrome.storage.local.set({
          'supabase_session': {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: data.user
          }
        });
        
        userSession = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user
        };
        
        // Persist full extension state (mirrors legacy keys)
        if (typeof saveExtensionState !== 'undefined') {
          saveExtensionState();
        }
        
        closeSignIn();
        showNotification('Signed in successfully!', 'success');
        
        // Show runsheet selector
        setTimeout(() => showRunsheetSelector(), 500);
        
      } else {
        throw new Error(data.error_description || data.message || 'Sign in failed');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      errorDiv.textContent = error.message || 'Sign in failed. Please try again.';
      errorDiv.style.display = 'block';
    } finally {
      submitBtn.textContent = 'Sign In';
      submitBtn.disabled = false;
    }
  });
}

// Show quick create dialog
function showQuickCreateDialog() {
  console.log('🔧 RunsheetPro Extension: Showing quick create dialog');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'runsheetpro-quick-create';
  dialog.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: hsl(var(--background, 0 0% 100%)) !important;
    border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
    border-radius: 8px !important;
    padding: 24px !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483647 !important;
    width: 400px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    color: hsl(var(--foreground, 222 47% 11%)) !important;
  `;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483646 !important;
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Quick Create Runsheet</h3>
      <button id="close-quick-create" style="background: none; border: none; font-size: 20px; cursor: pointer; color: hsl(var(--muted-foreground, 215 16% 47%));">×</button>
    </div>
    <div style="background: hsl(var(--muted, 210 40% 96%)); padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 3px solid hsl(var(--primary, 215 80% 40%));">
      <p style="margin: 0; font-size: 13px; color: hsl(var(--foreground, 222 47% 11%));">
        ⚡ <strong>Quick Create</strong> sets up a runsheet with your default column preferences.<br>
        For custom columns and advanced settings, create a new runsheet in the main app.
      </p>
    </div>
    <form id="quick-create-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Runsheet Name</label>
        <input type="text" id="runsheet-name" required placeholder="e.g., Property Research - January 2025" style="width: 100%; padding: 8px 12px; border: 1px solid hsl(var(--border, 214 32% 91%)); border-radius: 6px; font-size: 14px;">
      </div>
      <div style="font-size: 12px; color: hsl(var(--muted-foreground, 215 16% 47%));">
        <strong>Uses your default column preferences</strong><br>
        If no preferences are set, default document processing columns will be used.
      </div>
      <button type="submit" id="create-submit" style="padding: 10px; background: hsl(var(--primary, 215 80% 40%)); color: hsl(var(--primary-foreground, 210 40% 98%)); border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
        Create Runsheet
      </button>
      <div id="create-error" style="display: none; color: hsl(var(--destructive, 0 84% 60%)); font-size: 12px; text-align: center;"></div>
    </form>
    <div style="text-align: center; margin-top: 16px; font-size: 12px; color: hsl(var(--muted-foreground, 215 16% 47%));">
      Need custom setup? <a href="#" id="open-main-app-create" style="color: hsl(var(--primary, 215 80% 40%)); text-decoration: none;">Open main app</a>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  function closeQuickCreate() {
    document.body.removeChild(overlay);
    document.body.removeChild(dialog);
  }

  // Event listeners
  document.getElementById('close-quick-create').addEventListener('click', closeQuickCreate);
  overlay.addEventListener('click', closeQuickCreate);
  
  document.getElementById('open-main-app-create').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(window.location.origin, '_blank');
    closeQuickCreate();
  });

  // Handle form submission
  document.getElementById('quick-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('runsheet-name').value.trim();
    const submitBtn = document.getElementById('create-submit');
    const errorDiv = document.getElementById('create-error');
    
    if (!name) {
      errorDiv.textContent = 'Please enter a runsheet name';
      errorDiv.style.display = 'block';
      return;
    }
    
    submitBtn.textContent = 'Creating...';
    submitBtn.disabled = true;
    errorDiv.style.display = 'none';
    
    try {
      const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/create-quick-runsheet', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userSession.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log('🔧 RunsheetPro Extension: Quick create response:', data);
        closeQuickCreate();
        showNotification(`Created runsheet: ${name}`, 'success');
        
        // Load the new runsheet immediately - no delay needed
        if (data.runsheet) {
          loadRunsheet(data.runsheet);
        } else {
          console.error('🔧 RunsheetPro Extension: No runsheet data in response');
        }
        
      } else {
        throw new Error(data.error || 'Failed to create runsheet');
      }
    } catch (error) {
      console.error('Create runsheet error:', error);
      errorDiv.textContent = error.message || 'Failed to create runsheet. Please try again.';
      errorDiv.style.display = 'block';
    } finally {
      submitBtn.textContent = 'Create Runsheet';
      submitBtn.disabled = false;
    }
  });

  // Auto-focus the name input
  setTimeout(() => {
    document.getElementById('runsheet-name').focus();
  }, 100);
}

// Show runsheet selector with real data from Supabase
async function showRunsheetSelector() {
  console.log('🔧 RunsheetPro Extension: Showing runsheet selector');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'runsheetpro-runsheet-selector';
  dialog.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: hsl(var(--background, 0 0% 100%)) !important;
    border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
    border-radius: 8px !important;
    padding: 24px !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483647 !important;
    width: 400px !important;
    max-height: 500px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    color: hsl(var(--foreground, 222 47% 11%)) !important;
  `;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483646 !important;
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Select Runsheet</h3>
      <button id="close-selector" style="background: none; border: none; font-size: 20px; cursor: pointer; color: hsl(var(--muted-foreground, 215 16% 47%));">×</button>
    </div>
    <div id="runsheet-loading" style="text-align: center; padding: 20px;">
      <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid hsl(var(--border, 214 32% 91%)); border-radius: 50%; border-top-color: hsl(var(--primary, 215 80% 40%)); animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 10px; color: hsl(var(--muted-foreground, 215 16% 47%));">Loading your runsheets...</p>
    </div>
    <div id="runsheet-list" style="display: none; max-height: 300px; overflow-y: auto;">
      <!-- Runsheets will be populated here -->
    </div>
    <div style="margin-top: 16px; display: flex; gap: 8px;">
      <button id="create-new-runsheet" style="flex: 1; padding: 8px 16px; background: hsl(var(--primary, 215 80% 40%)); color: hsl(var(--primary-foreground, 210 40% 98%)); border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
        Create New Runsheet
      </button>
    </div>
  `;

  // Add CSS for spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  // Load runsheets from Supabase
  try {
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/get-user-runsheets', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch runsheets');
    }

    const { runsheets } = await response.json();
    
    const loadingDiv = document.getElementById('runsheet-loading');
    const listDiv = document.getElementById('runsheet-list');
    
    loadingDiv.style.display = 'none';
    listDiv.style.display = 'block';

    if (runsheets.length === 0) {
      listDiv.innerHTML = `
        <div style="text-align: center; padding: 20px; color: hsl(var(--muted-foreground, 215 16% 47%));">
          <p>No runsheets found. Create your first runsheet!</p>
        </div>
      `;
    } else {
      runsheets.forEach(runsheet => {
        const runsheetItem = document.createElement('div');
        runsheetItem.style.cssText = `
          padding: 12px !important;
          border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
          border-radius: 6px !important;
          margin-bottom: 8px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          background: hsl(var(--card, 0 0% 100%)) !important;
        `;
        
        runsheetItem.innerHTML = `
          <div style="font-weight: 500; margin-bottom: 4px;">${runsheet.name}</div>
          <div style="font-size: 12px; color: hsl(var(--muted-foreground, 215 16% 47%));">
            ${runsheet.columns.length} columns • ${runsheet.data.length} rows • Updated ${new Date(runsheet.updated_at).toLocaleDateString()}
          </div>
        `;
        
        runsheetItem.addEventListener('mouseenter', () => {
          runsheetItem.style.background = 'hsl(var(--muted, 210 40% 96%))';
        });
        
        runsheetItem.addEventListener('mouseleave', () => {
          runsheetItem.style.background = 'hsl(var(--card, 0 0% 100%))';
        });
        
        runsheetItem.addEventListener('click', () => {
          loadRunsheet(runsheet);
          closeSelector();
        });
        
        listDiv.appendChild(runsheetItem);
      });
    }

  } catch (error) {
    console.error('Error loading runsheets:', error);
    const loadingDiv = document.getElementById('runsheet-loading');
    loadingDiv.innerHTML = `
      <div style="text-align: center; color: hsl(var(--destructive, 0 84% 60%));">
        <p>Failed to load runsheets</p>
        <p style="font-size: 12px; margin-top: 8px;">Make sure you're signed in to the main app</p>
      </div>
    `;
  }

  function closeSelector() {
    document.body.removeChild(overlay);
    document.body.removeChild(dialog);
    document.head.removeChild(style);
  }

  // Event listeners
  document.getElementById('close-selector').addEventListener('click', closeSelector);
  overlay.addEventListener('click', closeSelector);
  
  document.getElementById('create-new-runsheet').addEventListener('click', () => {
    closeSelector();
    showQuickCreateDialog();
  });
}

// Function to add current row data to the sheet
async function addRowToSheet() {
  if (!activeRunsheet || !userSession) {
    showNotification('No active runsheet or authentication', 'error');
    return;
  }
  
  console.log('🔧 RunsheetPro Extension: Adding row to sheet');
  
  // Gather data from input fields and textareas
  const inputs = document.querySelectorAll('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
  const rowData = {};
  let hasData = false;
  
  inputs.forEach(input => {
    if (input.dataset.column && input.value.trim()) {
      rowData[input.dataset.column] = input.value.trim();
      hasData = true;
    }
  });
  
  // Check if there's a captured snip to include
  let screenshotUrl = null;
  if (window.currentCapturedSnip && window.currentSnipFilename) {
    console.log('🔧 RunsheetPro Extension: Including captured snip in row data');
    // Upload the snip first, then include its URL in the sync request
    try {
      const uploadResult = await uploadSnipToStorage(window.currentCapturedSnip);
      rowData['Document File Name'] = window.currentSnipFilename;
      screenshotUrl = uploadResult.url;
      hasData = true;
      
      // Clear the captured snip since we're about to save it
      window.currentCapturedSnip = null;
      window.currentSnipFilename = null;
      
      // Clear screenshot indicator
      updateScreenshotIndicator(false);
    } catch (error) {
      console.error('Error uploading captured snip:', error);
      showNotification('Failed to upload captured snip, but continuing with other data...', 'warning');
    }
  }
  
  if (!hasData) {
    showNotification('Please enter some data first', 'error');
    return;
  }
  
  try {
    // Get the current runsheet data from Supabase to find the next empty row
    const response = await fetch(`https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-sync?runsheet_id=${activeRunsheet.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch current runsheet data');
    }
    
    const { runsheet } = await response.json();
    
    // Find the next empty row index
    let nextRowIndex = 0;
    if (runsheet.data && Array.isArray(runsheet.data)) {
      // Find first empty row or add to end
      nextRowIndex = runsheet.data.findIndex(row => {
        if (!row || Object.keys(row).length === 0) {
          return true; // Completely empty row
        }
        
        // Check if row has any text data
        const hasTextData = Object.entries(row).some(([key, value]) => {
          // Skip document-related fields for text data check
          if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
            return false;
          }
          return value !== null && value !== undefined && value !== '' && value !== 'N/A';
        });
        
        // Check if row has any linked documents
        const hasLinkedDocuments = Object.entries(row).some(([key, value]) => {
          if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
            return value !== null && value !== undefined && value !== '' && value !== 'N/A';
          }
          return false;
        });
        
        // Row is empty only if it has no text data AND no linked documents
        return !hasTextData && !hasLinkedDocuments;
      });
      
      if (nextRowIndex === -1) {
        nextRowIndex = runsheet.data.length; // Add to end
      }
    }
    
    // Add the row data using extension-sync endpoint with screenshot URL if available
    const syncResponse = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet.id,
        row_data: rowData,
        screenshot_url: screenshotUrl
      })
    });
    
    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      console.error('Sync response not ok:', syncResponse.status, errorText);
      throw new Error(`HTTP ${syncResponse.status}: ${errorText}`);
    }
    
    const result = await syncResponse.json();
    console.log('Sync response result:', result);
    
    if (result.success) {
      showNotification(`Row ${result.row_index + 1} added successfully!`, 'success');
      
      // Mark screenshot as added to sheet if one was included
      if (screenshotUrl) {
        screenshotAddedToSheet = true;
      }
      
      // If a document was created, fire an event for the main app to refresh its document map
      if (result.document_created) {
        console.log('🚨 Extension: Firing document record created event for runsheet:', result.runsheet_id);
        console.log('🚨 Extension: Event details:', {
          runsheetId: result.runsheet_id,
          rowIndex: result.row_index,
          document_created: result.document_created
        });
        
        const eventDetail = {
          runsheetId: result.runsheet_id,
          rowIndex: result.row_index,
          allPossibleIds: {
            activeRunsheetId: result.runsheet_id,
            finalRunsheetId: result.runsheet_id
          }
        };
        
        // Use postMessage to communicate with main app (content script -> page)
        window.postMessage({
          type: 'EXTENSION_DOCUMENT_CREATED',
          detail: eventDetail,
          source: 'runsheet-extension'
        }, '*');
        console.log('🚨 Extension: PostMessage sent to main app');
      }
      
      // Update current row index to move to next row
      currentRowIndex = result.row_index + 1;
      updateRowNavigationUI();
      
  // Clear all input fields and textareas for next entry
      inputs.forEach(input => {
        // Only clear if it's not a hidden field or Document File Name field
        if (input.type !== 'hidden' && input.dataset.column !== 'Document File Name') {
          input.value = '';
          // Auto-resize textareas after clearing
          if (input.tagName === 'TEXTAREA') {
            input.style.height = 'auto';
            input.style.height = Math.max(32, input.scrollHeight) + 'px';
          }
        }
      });
      
      // Focus back to first input or textarea for quick data entry
      const firstInput = document.querySelector('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
      if (firstInput) {
        firstInput.focus();
      }
      
      console.log('🔧 RunsheetPro Extension: Row added successfully to index (server):', result.row_index, ' (predicted):', nextRowIndex);
      
      // Update the local activeRunsheet data with the new row (use server-confirmed index)
      const targetIndex = (typeof result.row_index === 'number') ? result.row_index : nextRowIndex;
      if (!activeRunsheet.data) {
        activeRunsheet.data = [];
      }
      
      // Ensure the data array has enough rows
      while (activeRunsheet.data.length <= targetIndex) {
        const emptyRow = {};
        activeRunsheet.columns.forEach(col => emptyRow[col] = '');
        activeRunsheet.data.push(emptyRow);
      }
      
      // Update the specific row with the new data and attached screenshot URL (if any)
      const updatedRow = { ...activeRunsheet.data[targetIndex], ...rowData };
      if (screenshotUrl) {
        updatedRow['screenshot_url'] = screenshotUrl;
      }
      activeRunsheet.data[targetIndex] = updatedRow;
      
      // Update the global current row tracking to the next empty row
      if (window.currentDisplayRowIndex !== undefined) {
        window.currentDisplayRowIndex = targetIndex + 1;
      }
      
      // Clear any saved form data since we just submitted it
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.remove(['extension_form_data']);
      }
      
      // Refresh the current view (both single and full views)
      refreshCurrentView();
    } else {
      console.error('Sync result indicates failure:', result);
      throw new Error(result.error || 'Failed to add row');
    }
  } catch (error) {
    console.error('Add row error:', error);
    showNotification('Failed to add row to sheet: ' + error.message, 'error');
  }
}

// Show brain button for document analysis
function showBrainButton(file, filename) {
  const brainBtn = document.querySelector('.brain-btn');
  if (brainBtn) {
    window.currentAnalysisFile = file;
    window.currentAnalysisFileName = filename;
    brainBtn.style.display = 'block';
  }
}

// Analyze document function
async function analyzeDocument(file, filename) {
  if (!userSession) {
    showNotification('Authentication required', 'error');
    return;
  }

  try {
    showNotification('Analyzing document...', 'info');
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/analyze-document', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      // Fill in the extracted data to the form fields
      const extractedData = result.extractedData || {};
      
      for (const [field, value] of Object.entries(extractedData)) {
        const input = document.querySelector(`input[data-column="${field}"], textarea[data-column="${field}"]`);
        if (input && value) {
          input.value = value;
        }
      }
      
      showNotification('Document analyzed and data extracted!', 'success');
    } else {
      throw new Error(result.error || 'Analysis failed');
    }
  } catch (error) {
    console.error('Document analysis error:', error);
    showNotification('Failed to analyze document', 'error');
  }
}

// Load a specific runsheet
function loadRunsheet(runsheet) {
  console.log('🔧 RunsheetPro Extension: Loading runsheet:', runsheet.name);
  
  activeRunsheet = runsheet;
  
  // Find the next available blank row for data entry
  currentRowIndex = findNextAvailableRow(runsheet);
  console.log('🔧 RunsheetPro Extension: Set currentRowIndex to next available row:', currentRowIndex);
  
  // Save state when setting active runsheet
  if (typeof saveExtensionState === 'function') {
    try { saveExtensionState(); }
    catch (e) { console.error('🔧 RunsheetPro Extension: saveExtensionState failed:', e); }
  }
  
  // Store runsheet data for persistence across page navigation
  chrome.storage.local.set({ 
    'active_runsheet': runsheet,
    'activeRunsheet': runsheet // Store for popup
  });
  
  // Destroy existing frame and recreate with new data
  if (runsheetFrame) {
    runsheetFrame.remove();
    runsheetFrame = null;
  }
  
  // Create the frame with the loaded runsheet
  createRunsheetFrame();
  
  // Show the frame
  if (runsheetFrame) {
    runsheetFrame.style.display = 'block';
    document.body.appendChild(runsheetFrame);
    setupFrameEventListeners();
  }
  
  showNotification(`Loaded runsheet: ${runsheet.name} (Row ${currentRowIndex + 1})`, 'success');
}

// Toggle runsheet frame visibility
function toggleRunsheetFrame() {
  if (!runsheetFrame) {
    // No active runsheet, show selector
    showRunsheetSelector();
    return;
  }
  
  if (runsheetFrame.style.display === 'none') {
    runsheetFrame.style.display = 'block';
  } else {
    runsheetFrame.style.display = 'none';
  }
}

// Create the fixed bottom frame
function createRunsheetFrame() {
  if (runsheetFrame) return; // Already exists
  
  console.log('🔧 RunsheetPro Extension: Creating runsheet frame');
  
  // Create main frame container
  runsheetFrame = document.createElement('div');
  runsheetFrame.id = 'runsheetpro-runsheet-frame';
  
  // Restore saved height or use default
  const savedHeight = parseInt(localStorage.getItem('runsheetpro-frame-height') || '200', 10);
  runsheetFrame.style.setProperty('height', `${savedHeight}px`, 'important');
  document.body.style.setProperty('padding-bottom', `${savedHeight}px`, 'important');
  
  // Create resize handle at the top
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'frame-resize-handle';
  resizeHandle.style.cssText = `
    height: 6px !important;
    background: hsl(var(--border)) !important;
    cursor: ns-resize !important;
    position: relative !important;
    opacity: 0.7 !important;
    transition: all 0.2s ease !important;
    z-index: 10 !important;
    border-bottom: 1px solid hsl(var(--border)) !important;
    flex-shrink: 0 !important;
  `;
  
  // Add resize functionality
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    console.log('🔧 Resize handle mousedown');
    isResizing = true;
    startY = e.clientY;
    startHeight = parseInt(window.getComputedStyle(runsheetFrame).height);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  const handleMouseMove = (e) => {
    if (!isResizing) return;
    
    const deltaY = startY - e.clientY;
    const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
    
    runsheetFrame.style.setProperty('height', `${newHeight}px`, 'important');
    document.body.style.setProperty('padding-bottom', `${newHeight}px`, 'important');
    
    // Save preferred height
    localStorage.setItem('runsheetpro-frame-height', newHeight.toString());
  };
  
  const handleMouseUp = () => {
    if (isResizing) {
      console.log('🔧 Resize complete');
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Create header
  const header = document.createElement('div');
  header.className = 'frame-header';
  header.innerHTML = `
    <span class="frame-title">RunsheetPro Runsheet - ${activeRunsheet?.name || 'Default'}</span>
    <div class="frame-controls">
      ${currentViewMode === 'single' ? '<button id="screenshot-btn" class="control-btn" style="background: green !important; color: white !important;">📷 Screenshot Options</button>' : ''}
      ${currentViewMode === 'single' ? '<button id="view-screenshot-btn" class="control-btn" style="background: blue !important; color: white !important; display: none;">👁️ View Screenshot</button>' : ''}
      ${currentViewMode === 'single' ? '<button id="retake-screenshot-btn" class="control-btn" style="background: orange !important; color: white !important; display: none;">🔄 Retake</button>' : ''}
      ${currentViewMode === 'single' ? '<button id="open-app-btn" class="control-btn">🚀 Open in App</button>' : ''}
      ${currentViewMode === 'single' ? '<button id="select-runsheet-btn" class="control-btn">📄 Select Sheet</button>' : ''}
      <button id="view-mode-btn" class="control-btn">${currentViewMode === 'single' ? '📋 Quick View' : '📝 Save & Close'}</button>
    </div>
  `;
  
  // Create content area
  const content = document.createElement('div');
  content.className = 'frame-content';
  content.style.cssText = `
    padding: 0 !important;
    height: calc(100% - 38px) !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    background: hsl(var(--background, 0 0% 100%)) !important;
    flex: 1 !important;
  `;
  
  // Load current view mode from storage
  chrome.storage.local.get(['viewMode']).then(result => {
    currentViewMode = result.viewMode || 'single';
    updateViewModeButton();
  });
  
  // Create content based on view mode
  if (currentViewMode === 'full') {
    createFullRunsheetView(content);
  } else {
    createSingleEntryView(content);
  }
  
  // Initialize row navigation UI
  setTimeout(() => {
    updateRowNavigationUI();
  }, 100);
  
  // Set up frame as flex container
  runsheetFrame.style.display = 'flex';
  runsheetFrame.style.flexDirection = 'column';
  runsheetFrame.appendChild(resizeHandle);
  runsheetFrame.appendChild(header);
  runsheetFrame.appendChild(content);
  
  setupFrameEventListeners();
}

// Helper function to find the first empty row
function findFirstEmptyRow(runsheetData) {
  if (!runsheetData.data || !Array.isArray(runsheetData.data) || runsheetData.data.length === 0) {
    return 0; // First row if no data exists
  }
  
  // Find first row that is truly empty (no text data AND no linked documents)
  const emptyRowIndex = runsheetData.data.findIndex(row => {
    if (!row || Object.keys(row).length === 0) {
      return true; // Completely empty row
    }
    
    // Check if row has any text data
    const hasTextData = Object.entries(row).some(([key, value]) => {
      // Skip document-related fields for text data check
      if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
        return false;
      }
      return value !== null && value !== undefined && value !== '' && value !== 'N/A';
    });
    
    // Check if row has any linked documents
    const hasLinkedDocuments = Object.entries(row).some(([key, value]) => {
      if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
        return value !== null && value !== undefined && value !== '' && value !== 'N/A';
      }
      return false;
    });
    
    // Row is empty only if it has no text data AND no linked documents
    return !hasTextData && !hasLinkedDocuments;
  });
  
  // If no empty row found, return the next index (add to end)
  return emptyRowIndex === -1 ? runsheetData.data.length : emptyRowIndex;
}

// Get the next available row number for display
function getNextAvailableRowNumber() {
  if (!activeRunsheet || !activeRunsheet.data) {
    return 1; // First row if no data
  }
  
  const nextRowIndex = findNextAvailableRow(activeRunsheet);
  return nextRowIndex + 1; // Convert to 1-based for display
}

// Find next available row (first empty row or add to end)
function findNextAvailableRow(runsheetData) {
  if (!runsheetData || !runsheetData.data || runsheetData.data.length === 0) {
    return 0; // First row
  }
  
  // Look for first completely empty row (no data AND no linked documents)
  for (let i = 0; i < runsheetData.data.length; i++) {
    const row = runsheetData.data[i];
    
    // Check if row exists and has any data
    if (!row || Object.keys(row).length === 0) {
      return i; // Completely empty row
    }
    
    // Check if all values are empty/null (but also check for document links)
    const hasTextData = Object.entries(row).some(([key, value]) => {
      // Skip document-related fields for text data check
      if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
        return false;
      }
      return value !== null && value !== undefined && value !== '' && value !== 'N/A';
    });
    
    // Check if row has any linked documents
    const hasLinkedDocuments = Object.entries(row).some(([key, value]) => {
      if (key === 'Document File Name' || key === 'screenshot_url' || key.toLowerCase().includes('document')) {
        return value !== null && value !== undefined && value !== '';
      }
      return false;
    });
    
    // Row is available if it has no text data AND no linked documents
    if (!hasTextData && !hasLinkedDocuments) {
      console.log(`🔧 RunsheetPro Extension: Found available row at index ${i}`);
      return i;
    } else {
      console.log(`🔧 RunsheetPro Extension: Row ${i} has data (textData: ${hasTextData}, linkedDocs: ${hasLinkedDocuments}), skipping`);
    }
  }
  
  // No empty rows found, add to end
  console.log(`🔧 RunsheetPro Extension: No empty rows found, using new row at index ${runsheetData.data.length}`);
  return runsheetData.data.length;
}

// Update target row indicator - removed since we're not showing row numbers in header anymore
function updateTargetRowIndicator() {
  // This function is no longer used since we removed the row indicator from header
  // Keeping it for compatibility in case other code calls it
}

// Refresh single entry view to show current row
function refreshSingleEntryView() {
  if (!activeRunsheet) return;
  
  const content = document.querySelector('#runsheetpro-runsheet-frame .frame-content');
  if (!content) return;
  
  // Clear current content
  content.innerHTML = '';
  
  // Recreate single entry view
  createSingleEntryView(content);
  
  // Focus first input for quick data entry
  setTimeout(() => {
    const firstInput = document.querySelector('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
    if (firstInput) {
      firstInput.focus();
    }
  }, 100);
}

// Refresh the current view (either single or full)
function refreshCurrentView() {
  if (!activeRunsheet) return;
  
  const content = document.querySelector('#runsheetpro-runsheet-frame .frame-content');
  if (!content) return;
  
  // Clear current content
  content.innerHTML = '';
  
  // Recreate the appropriate view based on current mode
  if (currentViewMode === 'full') {
    createFullRunsheetView(content);
  } else {
    createSingleEntryView(content);
  }
  
  // Focus first input for quick data entry in single entry mode
  if (currentViewMode === 'single') {
    setTimeout(() => {
      const firstInput = document.querySelector('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }
}
// Create single entry view (original functionality)
// Create single entry view (original functionality)
function createSingleEntryView(content) {
  // Create table wrapper to hold table and action area side by side
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';
  tableWrapper.style.cssText = `
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 8px !important;
    width: 100% !important;
  `;
  
  // Create dynamic table based on runsheet data
  const table = document.createElement('div');
  table.className = 'runsheet-table';
  table.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    border: none !important;
    width: fit-content !important;
    flex-shrink: 0 !important;
  `;
  
  // Get runsheet data or use defaults
  const runsheetData = activeRunsheet || {
    columns: ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name'],
    data: []  // Start with no rows until user adds data
  };

  // Find the next available row (first empty row or add to end)
  const nextRowIndex = findNextAvailableRow(runsheetData);
  
  // Store next row index for reference
  window.nextRowIndex = nextRowIndex;
  
  // Create header row with resizable columns
  const headerRow = document.createElement('div');
  headerRow.className = 'table-row header-row';
  headerRow.style.cssText = `
    display: flex !important;
    width: fit-content !important;
    height: 18px !important;
    min-height: 18px !important;
    max-height: 18px !important;
  `;
  
  runsheetData.columns.forEach((column, index) => {
    const cell = document.createElement('div');
    cell.className = 'table-cell';
    
    // Get stored width or use default
    const storedWidth = localStorage.getItem(`runsheetpro-column-width-${index}`) || '120';
    const width = parseInt(storedWidth);
    
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
    cell.style.maxWidth = `${width}px`;
    cell.style.position = 'relative';
    cell.style.height = '18px';
    cell.style.maxHeight = '18px';
    cell.style.overflow = 'hidden';
    
    // Special handling for Document File Name column
    if (column === 'Document File Name') {
      // Create header container that switches between upload and document display modes
      const headerContent = document.createElement('div');
      headerContent.className = 'document-header-container';
      headerContent.style.cssText = `
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 2px !important;
        padding: 0px 2px !important;
        height: 18px !important;
        max-height: 18px !important;
        background: hsl(var(--card, 0 0% 100%)) !important;
        border: 1px dashed hsl(var(--border, 214 32% 91%)) !important;
        border-radius: 2px !important;
        font-size: 9px !important;
        overflow: hidden !important;
      `;
      
      // Create upload interface (shown when no document)
      const uploadInterface = document.createElement('div');
      uploadInterface.className = 'upload-interface';
      uploadInterface.style.cssText = `
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 2px !important;
        width: 100% !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        height: 16px !important;
      `;
      
      // Add File button
      const addFileBtn = document.createElement('button');
      addFileBtn.innerHTML = '📁 Add File';
      addFileBtn.style.cssText = `
        background: hsl(var(--primary, 215 80% 40%)) !important;
        color: hsl(var(--primary-foreground, 210 40% 98%)) !important;
        border: none !important;
        border-radius: 2px !important;
        padding: 1px 4px !important;
        font-size: 8px !important;
        cursor: pointer !important;
        flex: 1 !important;
        transition: all 0.2s ease !important;
        height: 14px !important;
        line-height: 1 !important;
      `;
      
      // Screenshot/View Snip button
      const screenshotBtn = document.createElement('button');
      screenshotBtn.innerHTML = '📷 Screenshot';
      screenshotBtn.style.cssText = `
        background: hsl(var(--secondary, 210 40% 96%)) !important;
        color: hsl(var(--secondary-foreground, 222 47% 11%)) !important;
        border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        border-radius: 2px !important;
        padding: 1px 4px !important;
        font-size: 8px !important;
        cursor: pointer !important;
        flex: 1 !important;
        transition: all 0.2s ease !important;
        height: 14px !important;
        line-height: 1 !important;
      `;
      
      const documentInterface = document.createElement('div');
      documentInterface.className = 'document-interface';
      documentInterface.style.cssText = `
        display: none !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 2px !important;
        width: 100% !important;
        padding: 0px 2px !important;
        background: hsl(var(--background, 0 0% 100%)) !important;
        border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        border-radius: 2px !important;
        height: 16px !important;
      `;
      
      // Document filename display - positioned to the left
      const filenameDisplay = document.createElement('div');
      filenameDisplay.className = 'filename-display';
      filenameDisplay.style.cssText = `
        display: flex !important;
        align-items: center !important;
        gap: 2px !important;
        flex: 1 !important;
        padding: 0px !important;
        overflow: hidden !important;
      `;
      
      const fileIcon = document.createElement('span');
      fileIcon.innerHTML = '📄';
      fileIcon.style.cssText = `
        font-size: 8px !important;
        flex-shrink: 0 !important;
        line-height: 1 !important;
      `;
      
      const filenameText = document.createElement('span');
      filenameText.className = 'filename-text';
      filenameText.style.cssText = `
        font-size: 8px !important;
        font-weight: 500 !important;
        color: hsl(var(--foreground, 222 47% 11%)) !important;
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        line-height: 1 !important;
      `;
      
      // Document controls - positioned to the right of filename
      const documentControls = document.createElement('div');
      documentControls.style.cssText = `
        display: flex !important;
        gap: 1px !important;
        flex-shrink: 0 !important;
        margin-left: auto !important;
      `;
      
      // Brain button
      const docBrainBtn = document.createElement('button');
      docBrainBtn.innerHTML = '🧠';
      docBrainBtn.className = 'doc-brain-btn';
      docBrainBtn.style.cssText = `
        background: hsl(var(--secondary, 210 40% 96%)) !important;
        color: hsl(var(--secondary-foreground, 222 47% 11%)) !important;
        border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        border-radius: 2px !important;
        padding: 1px 2px !important;
        font-size: 6px !important;
        cursor: pointer !important;
        width: 12px !important;
        height: 12px !important;
        transition: all 0.2s ease !important;
        line-height: 1 !important;
      `;
      docBrainBtn.title = 'Analyze document';
      
      // Edit button (for renaming)
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '✏️';
      editBtn.className = 'doc-edit-btn';
      editBtn.style.cssText = `
        background: hsl(var(--secondary, 210 40% 96%)) !important;
        color: hsl(var(--secondary-foreground, 222 47% 11%)) !important;
        border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        border-radius: 2px !important;
        padding: 1px 2px !important;
        font-size: 6px !important;
        cursor: pointer !important;
        width: 12px !important;
        height: 12px !important;
        transition: all 0.2s ease !important;
        line-height: 1 !important;
      `;
      editBtn.title = 'Rename document';
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.className = 'doc-delete-btn';
      deleteBtn.style.cssText = `
        background: hsl(var(--destructive, 0 84% 60%)) !important;
        color: white !important;
        border: 1px solid hsl(var(--destructive, 0 84% 60%)) !important;
        border-radius: 2px !important;
        padding: 1px 2px !important;
        font-size: 6px !important;
        cursor: pointer !important;
        width: 12px !important;
        height: 12px !important;
        transition: all 0.2s ease !important;
        line-height: 1 !important;
      `;
      deleteBtn.title = 'Remove document';
      
      // Build upload interface
      uploadInterface.appendChild(addFileBtn);
      uploadInterface.appendChild(screenshotBtn);
      
      // Build document interface with controls on the right side of filename
      filenameDisplay.appendChild(fileIcon);
      filenameDisplay.appendChild(filenameText);
      filenameDisplay.appendChild(documentControls);
      documentControls.appendChild(docBrainBtn);
      documentControls.appendChild(editBtn);
      documentControls.appendChild(deleteBtn);
      documentInterface.appendChild(filenameDisplay);
      
      // Create hidden file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,.pdf,.doc,.docx';
      fileInput.style.display = 'none';
      
      // Function to update screenshot button based on linked snip
      const updateScreenshotButton = () => {
        const hasLinkedSnip = checkForLinkedSnip();
        if (hasLinkedSnip) {
          screenshotBtn.innerHTML = '👁️ View Snip';
          screenshotBtn.classList.add('view-snip');
          screenshotBtn.style.background = 'hsl(var(--accent, 230 60% 60%)) !important';
          screenshotBtn.style.color = 'white !important';
          screenshotBtn.title = 'View linked screenshot';
        } else {
          screenshotBtn.innerHTML = '📷 Screenshot';
          screenshotBtn.classList.remove('view-snip');
          screenshotBtn.style.background = 'hsl(var(--secondary, 210 40% 96%)) !important';
          screenshotBtn.style.color = 'hsl(var(--secondary-foreground, 222 47% 11%)) !important';
          screenshotBtn.title = 'Take screenshot';
        }
        
        // Always show the button - either to take a screenshot or view an existing one
        screenshotBtn.style.display = 'inline-block';
      };

      // Make updateScreenshotButton globally accessible
      window.updateScreenshotButtonGlobal = updateScreenshotButton;

      // Function to check for linked snip in current row
      const checkForLinkedSnip = () => {
        if (!activeRunsheet || !activeRunsheet.data || currentRowIndex >= activeRunsheet.data.length) {
          return false;
        }
        const currentRow = activeRunsheet.data[currentRowIndex];
        return currentRow && ((currentRow.screenshot_url && currentRow.screenshot_url.trim() !== '' && currentRow.screenshot_url !== 'N/A') || 
                             window.currentCapturedSnip);
      };

      // Function to switch between upload and document modes
      const switchToDocumentMode = (filename) => {
        uploadInterface.style.display = 'none';
        documentInterface.style.display = 'flex';
        filenameText.textContent = filename;
        headerContent.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
        updateScreenshotButton(); // Update button when switching modes
      };
      
      const switchToUploadMode = () => {
        uploadInterface.style.display = 'flex';
        documentInterface.style.display = 'none';
        headerContent.style.border = '1px dashed hsl(var(--border, 214 32% 91%))';
        updateScreenshotButton(); // Update button when switching modes
      };
      
      // Check if there's already a document linked on page load
      const checkExistingDocument = () => {
        const documentInput = document.querySelector('.editable-row input[data-column="Document File Name"]');
        if (documentInput && documentInput.value && documentInput.value.trim() !== '') {
          switchToDocumentMode(documentInput.value);
        } else {
          updateScreenshotButton(); // Update button state on load
        }
      };
      
      // Handle file upload
      const handleFileUpload = (file) => {
        if (file) {
        // Update the current row's Document File Name field (hidden input)
        const documentInput = document.querySelector('.editable-row input[data-column="Document File Name"]');
        if (documentInput) {
          documentInput.value = file.name;
            
            // Store file for potential processing
            if (!window.extensionFileStorage) {
              window.extensionFileStorage = new Map();
            }
            window.extensionFileStorage.set(file.name, file);
            
            showNotification(`File "${file.name}" ready to link`, 'success');
            
            // Switch to document mode
            switchToDocumentMode(file.name);
            
            // Store current file for brain button
            window.currentAnalysisFile = file;
            window.currentAnalysisFileName = file.name;
          }
        }
      };
      
      // Event handlers for upload interface
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          handleFileUpload(file);
        }
      });
      
      addFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
      
      screenshotBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Check if this is a view snip button or screenshot button
        if (screenshotBtn.classList.contains('view-snip')) {
          showSnipPreview();
        } else {
          startSnipMode();
        }
      });
      
      // Event handlers for document interface
      docBrainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.currentAnalysisFile && window.currentAnalysisFileName) {
          analyzeDocument(window.currentAnalysisFile, window.currentAnalysisFileName);
        }
      });
      
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Enable editing of filename
        const newName = prompt('Enter new filename:', filenameText.textContent);
        if (newName && newName.trim() !== '') {
          const documentInput = document.querySelector('.editable-row input[data-column="Document File Name"]');
          if (documentInput) {
            documentInput.value = newName.trim();
            switchToDocumentMode(newName.trim());
            showNotification('Filename updated', 'success');
          }
        }
      });
      
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Remove this document?')) {
          const documentInput = document.querySelector('.editable-row input[data-column="Document File Name"]');
          if (documentInput) {
            documentInput.value = '';
            switchToUploadMode();
            
            // Clear stored file data
            if (window.currentAnalysisFileName && window.extensionFileStorage) {
              window.extensionFileStorage.delete(window.currentAnalysisFileName);
            }
            window.currentAnalysisFile = null;
            window.currentAnalysisFileName = null;
            
            showNotification('Document removed', 'success');
          }
        }
      });
      
      // Drag and drop handlers for the entire header area
      headerContent.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (uploadInterface.style.display !== 'none') {
          headerContent.style.border = '1px dashed hsl(var(--primary, 215 80% 40%))';
          headerContent.style.background = 'hsl(var(--primary, 215 80% 40%) / 0.1)';
        }
      });
      
      headerContent.addEventListener('dragleave', (e) => {
        e.preventDefault();
        const currentBorder = uploadInterface.style.display !== 'none' 
          ? '1px dashed hsl(var(--border, 214 32% 91%))'
          : '1px solid hsl(var(--border, 214 32% 91%))';
        headerContent.style.border = currentBorder;
        headerContent.style.background = 'hsl(var(--card, 0 0% 100%))';
      });
      
      headerContent.addEventListener('drop', (e) => {
        e.preventDefault();
        const currentBorder = uploadInterface.style.display !== 'none' 
          ? '1px dashed hsl(var(--border, 214 32% 91%))'
          : '1px solid hsl(var(--border, 214 32% 91%))';
        headerContent.style.border = currentBorder;
        headerContent.style.background = 'hsl(var(--card, 0 0% 100%))';
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && uploadInterface.style.display !== 'none') {
          handleFileUpload(files[0]);
        }
      });
      
      // Build the header content
      headerContent.appendChild(uploadInterface);
      headerContent.appendChild(documentInterface);
      headerContent.appendChild(fileInput);
      cell.appendChild(headerContent);
      
      // Check for existing document after a short delay to ensure DOM is ready
      setTimeout(checkExistingDocument, 100);
    } else {
      // Normal header for other columns
      const cellContent = document.createElement('div');
      cellContent.className = 'cell-content';
      cellContent.textContent = column;
      cellContent.style.cssText = `
        height: 16px !important;
        line-height: 16px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        padding: 0px 2px !important;
        font-size: 11px !important;
        display: flex !important;
        align-items: flex-start !important;
      `;
      cell.appendChild(cellContent);
    }
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.style.position = 'absolute';
    resizeHandle.style.right = '0';
    resizeHandle.style.top = '0';
    resizeHandle.style.bottom = '0';
    resizeHandle.style.width = '4px';
    resizeHandle.style.cursor = 'col-resize';
    resizeHandle.style.background = 'hsl(var(--border, 214 32% 91%))';
    resizeHandle.style.opacity = '0';
    resizeHandle.style.transition = 'opacity 0.2s ease';
    
    // Add hover effect
    cell.addEventListener('mouseenter', () => {
      resizeHandle.style.opacity = '1';
    });
    cell.addEventListener('mouseleave', () => {
      resizeHandle.style.opacity = '0';
    });
    
    // Add resize functionality
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      console.log('Column resize handle clicked');
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(cell).width, 10);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const width = Math.max(80, startWidth + e.clientX - startX);
      
      // Update all cells in this column
      const allCells = document.querySelectorAll(`#runsheetpro-runsheet-frame .table-cell:nth-child(${index + 1})`);
      allCells.forEach(c => {
        c.style.width = `${width}px`;
        c.style.minWidth = `${width}px`;
        c.style.maxWidth = `${width}px`;
      });
      
      // Save the width preference
      localStorage.setItem(`runsheetpro-column-width-${index}`, width);
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
    
    cell.appendChild(resizeHandle);
    headerRow.appendChild(cell);
  });
  
  table.appendChild(headerRow);
  
  // Create editable data row (show first row of data)
  const dataRow = document.createElement('div');
  dataRow.className = 'table-row editable-row';
  dataRow.style.cssText = `
    display: flex !important;
    width: fit-content !important;
    min-height: 2rem !important;
  `;
  dataRow.dataset.rowIndex = nextRowIndex;
  
  runsheetData.columns.forEach((column, colIndex) => {
    const cell = document.createElement('div');
    cell.className = 'table-cell';
    
    // Get stored width or use default to match header
    const storedWidth = localStorage.getItem(`runsheetpro-column-width-${colIndex}`) || '120';
    const width = parseInt(storedWidth);
    
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
    cell.style.maxWidth = `${width}px`;
    cell.style.flex = '0 0 auto';
    cell.style.position = 'relative';
    
    // Create textarea instead of input for multi-line support (except for Document File Name)
    if (column === 'Document File Name') {
      // Document File Name column gets no visible input in data row, just the add row button
      // Create hidden input to store the filename value but don't display it
      const input = document.createElement('input');
      input.type = 'hidden';
      input.value = ''; // Always start blank for new data entry
      input.dataset.field = column.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
      input.dataset.column = column;
      
      cell.appendChild(input);
    } else {
      // Other columns use textarea for multi-line support
      const textarea = document.createElement('textarea');
      textarea.value = ''; // Always start blank for new data entry
      textarea.dataset.field = column.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
      textarea.dataset.column = column;
      
      textarea.style.cssText = `
        width: 100% !important;
        border: none !important;
        outline: none !important;
        background: transparent !important;
        color: hsl(var(--foreground, 0 0% 9%)) !important;
        font-size: 11px !important;
        font-family: inherit !important;
        padding: 8px 12px !important;
        min-height: 2rem !important;
        resize: none !important;
        border: 2px solid transparent !important;
        transition: all 0.2s ease !important;
        overflow: hidden !important;
        line-height: 1.4 !important;
      `;
      
      // Auto-resize textarea height
      const autoResize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(32, textarea.scrollHeight) + 'px';
      };
      
      textarea.addEventListener('input', () => {
        autoResize();
        
        // Auto-save form data as user types
        if (typeof saveCurrentFormData === 'function') {
          saveCurrentFormData();
        }
      });
      
      textarea.addEventListener('focus', () => {
        textarea.style.background = 'hsl(var(--background, 0 0% 100%))';
        textarea.style.border = '2px solid hsl(var(--primary, 215 80% 40%))';
        textarea.style.boxShadow = '0 0 0 2px hsl(var(--primary, 215 80% 40%) / 0.2)';
        textarea.style.borderRadius = '2px';
        autoResize();
      });
      
      textarea.addEventListener('blur', () => {
        textarea.style.background = 'transparent';
        textarea.style.border = '2px solid transparent';
        textarea.style.boxShadow = 'none';
        textarea.style.borderRadius = '0';
      });
      
      textarea.addEventListener('mouseenter', () => {
        if (document.activeElement !== textarea) {
          textarea.style.background = 'hsl(var(--muted, 210 40% 96%) / 0.5)';
        }
      });
      
      textarea.addEventListener('mouseleave', () => {
        if (document.activeElement !== textarea) {
          textarea.style.background = 'transparent';
        }
      });
      
      // Handle keyboard navigation like EditableSpreadsheet
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
          // Enter moves to next cell or add button if last field
          e.preventDefault();
          const currentIndex = Array.from(dataRow.children).indexOf(cell);
          if (currentIndex < dataRow.children.length - 1) {
            // Move to next cell
            const nextCell = dataRow.children[currentIndex + 1];
            const nextTextarea = nextCell.querySelector('textarea');
            const nextInput = nextCell.querySelector('input');
            if (nextTextarea) {
              nextTextarea.focus();
            } else if (nextInput) {
              // If it's the Document File Name cell, focus the Add Row button
              const addButton = nextCell.querySelector('.add-row-btn');
              if (addButton) addButton.focus();
            }
          }
        } else if (e.key === 'Enter' && e.altKey) {
          // Alt+Enter creates line break - allow default behavior and resize
          setTimeout(autoResize, 0);
        } else if (e.key === 'Tab' && e.shiftKey) {
          // Shift+Tab moves to previous field
          e.preventDefault();
          const currentIndex = Array.from(dataRow.children).indexOf(cell);
          if (currentIndex > 0) {
            const prevCell = dataRow.children[currentIndex - 1];
            const prevTextarea = prevCell.querySelector('textarea');
            const prevInput = prevCell.querySelector('input');
            if (prevTextarea) {
              prevTextarea.focus();
            } else if (prevInput) {
              prevInput.focus();
            }
          }
        } else if (e.key === 'Tab') {
          // Tab moves to next field
          e.preventDefault();
          const currentIndex = Array.from(dataRow.children).indexOf(cell);
          
          // Check if this is the last editable cell (not counting Document File Name)
          const allCells = Array.from(dataRow.children);
          const editableCells = allCells.filter(c => c.querySelector('textarea'));
          const isLastEditableCell = editableCells[editableCells.length - 1] === cell;
          
          if (isLastEditableCell) {
            // Focus the add row button
            const addButton = document.querySelector('.table-action-area .add-row-btn');
            if (addButton) {
              addButton.focus();
            }
          } else if (currentIndex < dataRow.children.length - 1) {
            const nextCell = dataRow.children[currentIndex + 1];
            const nextTextarea = nextCell.querySelector('textarea');
            const nextInput = nextCell.querySelector('input');
            const nextButton = nextCell.querySelector('.add-row-btn');
            if (nextTextarea) {
              nextTextarea.focus();
            } else if (nextInput) {
              nextInput.focus();
            } else if (nextButton) {
              nextButton.focus();
            }
          }
        }
      });
      
      cell.appendChild(textarea);
    }
    
    if (column === 'Document File Name') {
      // Just the hidden input - no buttons in this column
      const docCell = document.createElement('div');
      docCell.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: hsl(var(--muted-foreground, 215 16% 47%)) !important;
        font-size: 10px !important;
        font-style: italic !important;
      `;
      docCell.textContent = 'File linked via actions →';
      cell.appendChild(docCell);
    }
    
    dataRow.appendChild(cell);
  });
  
  table.appendChild(dataRow);
  
  // Add table to wrapper
  tableWrapper.appendChild(table);
  
  // Create action area immediately adjacent to the table
  const actionArea = document.createElement('div');
  actionArea.className = 'table-action-area';
  actionArea.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 8px !important;
    align-items: flex-start !important;
    justify-content: flex-start !important;
    flex-shrink: 0 !important;
    min-height: 32px !important;
  `;
  
  // Add Row button
  const addRowBtn = document.createElement('button');
  addRowBtn.className = 'add-row-btn';
  addRowBtn.textContent = 'Add Row to Runsheet';
  addRowBtn.style.cssText = `
    background: hsl(var(--primary, 215 80% 40%)) !important;
    color: hsl(var(--primary-foreground, 210 40% 98%)) !important;
    border: 1px solid hsl(var(--primary, 215 80% 40%)) !important;
    border-radius: 4px !important;
    padding: 8px 12px !important;
    font-size: 12px !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    transition: all 0.2s ease !important;
    white-space: nowrap !important;
    flex-shrink: 0 !important;
  `;
  addRowBtn.tabIndex = 0;
  addRowBtn.title = 'Add this row data to the runsheet';
  
  // Event handlers for Add Row button
  addRowBtn.addEventListener('click', () => {
    addRowToSheet();
  });
  
  addRowBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      addRowToSheet();
    } else if (e.key === 'Tab' && e.shiftKey) {
      // Shift+Tab moves back to the last textarea field
      e.preventDefault();
      const lastTextareaCell = Array.from(dataRow.children).reverse().find(cell => 
        cell.querySelector('textarea')
      );
      const lastTextarea = lastTextareaCell?.querySelector('textarea');
      if (lastTextarea) {
        lastTextarea.focus();
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Tab wraps to first field
      e.preventDefault();
      const firstCell = dataRow.children[0];
      const firstTextarea = firstCell.querySelector('textarea');
      if (firstTextarea) {
        firstTextarea.focus();
      }
    }
  });
  
  actionArea.appendChild(addRowBtn);
  
  // Add action area to wrapper
  tableWrapper.appendChild(actionArea);
  
  // Create container that holds the table wrapper with proper styling
  const tableContainer = document.createElement('div');
  tableContainer.style.cssText = `
    display: flex !important;
    align-items: flex-start !important;
    width: fit-content !important;
    max-width: none !important;
    border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
    border-radius: 4px !important;
    overflow: visible !important;
    position: relative !important;
  `;
  
  tableContainer.appendChild(tableWrapper);
  
  // Wrap in horizontal scroll container
  const scrollContainer = document.createElement('div');
  scrollContainer.style.cssText = `
    width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    padding-bottom: 2px !important;
  `;
  
  scrollContainer.appendChild(tableContainer);
  content.appendChild(scrollContainer);
  
  console.log('🔧 RunsheetPro Extension: Single entry view created with action buttons');
  console.log('🔧 RunsheetPro Extension: Action area contains:', actionArea.children.length, 'buttons');
  
  // Update table width after creating all cells
  setTimeout(() => {
    updateTableWidth();
  }, 0);
}

// Function to update table width to eliminate extra space
function updateTableWidth() {
  const table = document.querySelector('#runsheetpro-runsheet-frame .runsheet-table');
  if (!table) return;
  
  // Calculate total width needed for all columns
  let totalWidth = 0;
  const headerCells = table.querySelectorAll('.header-row .table-cell');
  headerCells.forEach((cell, index) => {
    const storedWidth = localStorage.getItem(`runsheetpro-column-width-${index}`) || '120';
    totalWidth += parseInt(storedWidth);
  });
  
  // Set the table width to exactly match total column widths
  table.style.width = `${totalWidth}px`;
  table.style.minWidth = `${totalWidth}px`;
  table.style.maxWidth = `${totalWidth}px`;
  
  // Update all rows to match exact width
  const rows = table.querySelectorAll('.table-row');
  rows.forEach(row => {
    row.style.width = `${totalWidth}px`;
    row.style.minWidth = `${totalWidth}px`;
    row.style.maxWidth = `${totalWidth}px`;
  });
  
  console.log('🔧 RunsheetPro Extension: Updated table width to', totalWidth, 'px');
}

// Create full runsheet view (shows all data)
function createFullRunsheetView(content) {
  const fullViewContainer = document.createElement('div');
  fullViewContainer.className = 'full-runsheet-view';
  fullViewContainer.style.cssText = `
    height: 100% !important;
    overflow: auto !important;
    padding: 8px !important;
  `;

  // Get runsheet data or use defaults
  const runsheetData = activeRunsheet || {
    columns: ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name'],
    data: [{}]
  };

  // Create scrollable container for table
  const tableContainer = document.createElement('div');
  tableContainer.style.cssText = `
    width: 100% !important;
    overflow-x: auto !important;
    overflow-y: visible !important;
  `;

  // Create table for full view
  const table = document.createElement('table');
  table.style.cssText = `
    min-width: 100% !important;
    width: max-content !important;
    border-collapse: collapse !important;
    font-size: 11px !important;
    font-family: inherit !important;
    table-layout: auto !important;
  `;

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.cssText = `
    background: hsl(var(--muted, 210 40% 96%)) !important;
    border-bottom: 1px solid hsl(var(--border, 214 32% 91%)) !important;
  `;

  runsheetData.columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column;
    th.style.cssText = `
      padding: 4px !important;
      text-align: left !important;
      font-weight: 600 !important;
      border-right: 1px solid hsl(var(--border, 214 32% 91%)) !important;
      min-width: 100px !important;
      width: auto !important;
      overflow: visible !important;
      white-space: nowrap !important;
      height: auto !important;
      line-height: 1.2 !important;
      position: relative !important;
      resize: horizontal !important;
    `;
    headerRow.appendChild(th);
  });

  // Add header for action column
  const actionTh = document.createElement('th');
  actionTh.textContent = 'Actions';
  actionTh.style.cssText = `
    padding: 4px !important;
    text-align: center !important;
    font-weight: 600 !important;
    min-width: 80px !important;
    max-width: 80px !important;
    width: 80px !important;
  `;
  headerRow.appendChild(actionTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body with editable cells
  const tbody = document.createElement('tbody');
  
  // If no data exists, show placeholder
  const dataRows = runsheetData.data && runsheetData.data.length > 0 ? runsheetData.data : [{}];
  
  dataRows.forEach((rowData, rowIndex) => {
    const row = document.createElement('tr');
    row.style.cssText = `
      border-bottom: 1px solid hsl(var(--border, 214 32% 91%)) !important;
      hover:background: hsl(var(--muted, 210 40% 96%) / 0.5) !important;
    `;

    runsheetData.columns.forEach((column, colIndex) => {
      const td = document.createElement('td');
      td.style.cssText = `
        padding: 0 !important;
        border-right: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        min-width: 100px !important;
        width: auto !important;
        vertical-align: top !important;
        position: relative !important;
        cursor: text !important;
      `;
      
      // Create editable input/textarea for each cell
      const cellValue = rowData[column] || '';
      let inputElement;
      
      if (column === 'Legal Description' || column === 'Notes') {
        // Use textarea for longer text fields
        inputElement = document.createElement('textarea');
        inputElement.style.cssText = `
          width: 100% !important;
          min-height: 24px !important;
          border: none !important;
          outline: none !important;
          padding: 6px 4px !important;
          font-size: 11px !important;
          font-family: inherit !important;
          background: transparent !important;
          resize: none !important;
          overflow: hidden !important;
        `;
        inputElement.value = cellValue;
        
        // Auto-resize function
        const autoResize = () => {
          inputElement.style.height = 'auto';
          const newHeight = Math.max(24, inputElement.scrollHeight);
          inputElement.style.height = newHeight + 'px';
          
          // Sync row height - make all cells in this row the same height
          syncRowHeight(rowIndex, newHeight + 12); // Add padding for cell height
        };
        inputElement.addEventListener('input', () => {
          autoResize();
          
          // Auto-save form data as user types
          if (typeof saveCurrentFormData === 'function') {
            saveCurrentFormData();
          }
        });
        setTimeout(autoResize, 0);
      } else {
        // Use input for shorter fields
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.style.cssText = `
          width: 100% !important;
          height: 32px !important;
          border: none !important;
          outline: none !important;
          padding: 6px 4px !important;
          font-size: 11px !important;
          font-family: inherit !important;
          background: transparent !important;
        `;
        inputElement.value = cellValue;
      }
      
      // Set data attributes for identification
      inputElement.setAttribute('data-row', rowIndex);
      inputElement.setAttribute('data-column', column);
      inputElement.setAttribute('data-col-index', colIndex);
      
      // Add keyboard navigation
      inputElement.addEventListener('keydown', (e) => {
        const currentRow = parseInt(inputElement.getAttribute('data-row'));
        const currentCol = parseInt(inputElement.getAttribute('data-col-index'));
        
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          // Move to next cell (right)
          const nextCol = currentCol + 1;
          if (nextCol < runsheetData.columns.length) {
            const nextCell = tbody.querySelector(`[data-row="${currentRow}"][data-col-index="${nextCol}"]`);
            if (nextCell) {
              nextCell.focus();
              nextCell.select();
            }
          } else {
            // Move to Add Data button
            const addDataBtn = tbody.querySelector(`[data-row="${currentRow}"][data-col-index="${runsheetData.columns.length}"]`);
            if (addDataBtn) {
              addDataBtn.focus();
            }
          }
        } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
          e.preventDefault();
          // Move to previous cell (left)
          const prevCol = currentCol - 1;
          if (prevCol >= 0) {
            const prevCell = tbody.querySelector(`[data-row="${currentRow}"][data-col-index="${prevCol}"]`);
            if (prevCell) {
              prevCell.focus();
              prevCell.select();
            }
          } else {
            // Move to last cell of previous row
            const prevRow = currentRow - 1;
            if (prevRow >= 0) {
              const lastColIndex = runsheetData.columns.length - 1;
              const prevCell = tbody.querySelector(`[data-row="${prevRow}"][data-col-index="${lastColIndex}"]`);
              if (prevCell) {
                prevCell.focus();
                prevCell.select();
              }
            }
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Move to cell below
          const nextRow = currentRow + 1;
          if (nextRow < dataRows.length) {
            const nextCell = tbody.querySelector(`[data-row="${nextRow}"][data-col-index="${currentCol}"]`);
            if (nextCell) {
              nextCell.focus();
              nextCell.select();
            }
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          // Move to cell above
          const prevRow = currentRow - 1;
          if (prevRow >= 0) {
            const prevCell = tbody.querySelector(`[data-row="${prevRow}"][data-col-index="${currentCol}"]`);
            if (prevCell) {
              prevCell.focus();
              prevCell.select();
            }
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          // Move to cell below or next row
          const nextRow = currentRow + 1;
          if (nextRow < dataRows.length) {
            const nextCell = tbody.querySelector(`[data-row="${nextRow}"][data-col-index="${currentCol}"]`);
            if (nextCell) {
              nextCell.focus();
              nextCell.select();
            }
          }
        }
      });
      
      // Handle data changes
      inputElement.addEventListener('input', () => {
        const currentRow = parseInt(inputElement.getAttribute('data-row'));
        // Update the runsheet data
        if (!activeRunsheet.data[currentRow]) {
          activeRunsheet.data[currentRow] = {};
        }
        activeRunsheet.data[currentRow][column] = inputElement.value;
        
        // Persist changes
        if (currentViewMode === 'full') {
          // Debounced per-row save in Quick View
          if (!window.__rowSaveDebouncers) window.__rowSaveDebouncers = {};
          if (!window.__rowSaveDebouncers[currentRow]) {
            window.__rowSaveDebouncers[currentRow] = debounce(() => {
              try { syncFullRow(currentRow); } catch (e) { console.error('Row sync failed', e); }
            }, 400);
          }
          window.__rowSaveDebouncers[currentRow]();
        } else {
          // Single entry mode behavior
          syncData();
        }
      });
      
      // Handle focus events to select text
      inputElement.addEventListener('focus', () => {
        setTimeout(() => {
          inputElement.select();
        }, 10);
      });
      
      // Single click to start editing and select text
      inputElement.addEventListener('click', () => {
        inputElement.focus();
        inputElement.select();
      });
      
      // Make entire cell clickable to focus input
      td.addEventListener('click', (e) => {
        if (e.target === td) {
          inputElement.focus();
          inputElement.select();
        }
      });
      
      td.appendChild(inputElement);
      row.appendChild(td);
    });

    // Add action column with screenshot functionality
    const actionTd = document.createElement('td');
    actionTd.style.cssText = `
      padding: 2px !important;
      text-align: center !important;
      min-width: 80px !important;
      max-width: 80px !important;
      width: 80px !important;
      border-right: 1px solid hsl(var(--border, 214 32% 91%)) !important;
      vertical-align: top !important;
    `;

    // Check if this row has a document/screenshot (must have actual non-empty values)
    const hasDocument = (rowData['Document File Name'] && rowData['Document File Name'].trim() !== '' && rowData['Document File Name'] !== 'N/A') || 
                       (rowData['screenshot_url'] && rowData['screenshot_url'].trim() !== '' && rowData['screenshot_url'] !== 'N/A');
    
    if (hasDocument) {
      // Show view button, analyze button, and replace button
      const viewBtn = document.createElement('button');
      viewBtn.innerHTML = '👁️';
      viewBtn.title = 'View document/screenshot';
      viewBtn.style.cssText = `
        background: hsl(var(--muted, 210 40% 96%)) !important;
        color: hsl(var(--foreground, 222 47% 11%)) !important;
        border: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        font-size: 10px !important;
        margin-right: 2px !important;
        width: 20px !important;
        height: 20px !important;
      `;
      
      viewBtn.addEventListener('click', () => {
        // Temporarily set currentRowIndex to this row for viewing
        const originalRowIndex = currentRowIndex;
        currentRowIndex = rowIndex;
        showSnipPreview();
        currentRowIndex = originalRowIndex; // Restore original row index
      });

      // Add analyze button like in the main app
      const analyzeBtn = document.createElement('button');
      analyzeBtn.innerHTML = '🧠';
      analyzeBtn.title = 'Analyze document with AI';
      analyzeBtn.style.cssText = `
        background: hsl(var(--accent, 230 60% 60%)) !important;
        color: white !important;
        border: 1px solid hsl(var(--accent, 230 60% 60%)) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        font-size: 10px !important;
        margin-right: 2px !important;
        width: 20px !important;
        height: 20px !important;
      `;
      
      analyzeBtn.addEventListener('click', async () => {
        const originalRowIndex = currentRowIndex;
        currentRowIndex = rowIndex;
        
        try {
          analyzeBtn.textContent = '🔄';
          analyzeBtn.disabled = true;
          await analyzeCurrentScreenshot();
        } catch (error) {
          console.error('Analysis error:', error);
          showNotification('Analysis failed: ' + error.message, 'error');
        } finally {
          analyzeBtn.textContent = '🧠';
          analyzeBtn.disabled = false;
          currentRowIndex = originalRowIndex;
        }
      });
      
      const addBtn = document.createElement('button');
      addBtn.innerHTML = '📷+';
      addBtn.title = 'Replace document/screenshot';
      addBtn.style.cssText = `
        background: hsl(var(--destructive, 0 84% 60%)) !important;
        color: white !important;
        border: 1px solid hsl(var(--destructive, 0 84% 60%)) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        font-size: 10px !important;
        width: 20px !important;
        height: 20px !important;
      `;
      
      addBtn.addEventListener('click', () => {
        if (confirm('This will replace the existing document/screenshot. Continue?')) {
          const originalRowIndex = currentRowIndex;
          currentRowIndex = rowIndex;
          // Skip warning since we already confirmed replacement (pass true to skip check)
          showSnipModeSelector(true); // Pass true to skip overwrite check
          // Don't restore the original row index - keep it set to the row we're replacing
        }
      });
      
      actionTd.appendChild(viewBtn);
      actionTd.appendChild(analyzeBtn);
      actionTd.appendChild(addBtn);
    } else {
      // Show add screenshot button
      const addBtn = document.createElement('button');
      addBtn.innerHTML = '📷 Add Document';
      addBtn.title = 'Add screenshot or document to this row';
      addBtn.style.cssText = `
        background: hsl(var(--primary, 215 80% 40%)) !important;
        color: white !important;
        border: 1px solid hsl(var(--primary, 215 80% 40%)) !important;
        padding: 4px 8px !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        font-size: 11px !important;
        font-weight: 500 !important;
      `;
      
      addBtn.addEventListener('click', () => {
        const originalRowIndex = currentRowIndex;
        currentRowIndex = rowIndex;
        // Skip warning since we already know there's no document (pass true to skip check)
        showSnipModeSelector(true); // Pass true to skip overwrite check
        // Don't restore the original row index - keep it set to the row we're adding to
      });
      
      actionTd.appendChild(addBtn);
    }
    
    row.appendChild(actionTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);
  
  // Add "Add Rows" button below the table
  const addRowsContainer = document.createElement('div');
  addRowsContainer.style.cssText = `
    padding: 16px !important;
    text-align: center !important;
    border-top: 1px solid hsl(var(--border, 214 32% 91%)) !important;
  `;
  
  const addRowsBtn = document.createElement('button');
  addRowsBtn.innerHTML = '➕ Add 5 More Rows';
  addRowsBtn.title = 'Add 5 empty rows to continue working';
  addRowsBtn.style.cssText = `
    background: hsl(var(--primary, 215 80% 40%)) !important;
    color: white !important;
    border: 1px solid hsl(var(--primary, 215 80% 40%)) !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    transition: all 0.2s ease !important;
  `;
  
  // Hover effects
  addRowsBtn.addEventListener('mouseenter', () => {
    addRowsBtn.style.background = 'hsl(var(--primary, 215 80% 35%)) !important';
  });
  
  addRowsBtn.addEventListener('mouseleave', () => {
    addRowsBtn.style.background = 'hsl(var(--primary, 215 80% 40%)) !important';
  });
  
  // Click handler to add more rows
  addRowsBtn.addEventListener('click', async () => {
    try {
      // Add 5 empty rows to the active runsheet data
      if (!activeRunsheet.data) activeRunsheet.data = [];
      
      for (let i = 0; i < 5; i++) {
        activeRunsheet.data.push({}); // Add empty row
      }
      
      // Refresh the quick view to show the new rows
      const content = document.querySelector('#runsheetpro-runsheet-frame .frame-content');
      if (content) {
        content.innerHTML = '';
        createFullRunsheetView(content);
      }
      
      showNotification('✅ Added 5 new rows to continue working!', 'success');
      
    } catch (error) {
      console.error('Error adding rows:', error);
      showNotification('Failed to add rows: ' + error.message, 'error');
    }
  });
  
  addRowsContainer.appendChild(addRowsBtn);
  fullViewContainer.appendChild(tableContainer);
  fullViewContainer.appendChild(addRowsContainer);
  content.appendChild(fullViewContainer);
}

// Sync row height to ensure consistent alignment
function syncRowHeight(rowIndex, minHeight) {
  // Find all cells in this row and set them to the same height
  const rowCells = document.querySelectorAll(`[data-row="${rowIndex}"]`);
  let maxHeight = minHeight;
  
  // First pass: find the maximum height needed in this row
  rowCells.forEach(cell => {
    if (cell.tagName === 'TEXTAREA') {
      const cellHeight = Math.max(24, cell.scrollHeight) + 12;
      maxHeight = Math.max(maxHeight, cellHeight);
    }
  });
  
  // Second pass: apply the maximum height to all cells in the row
  rowCells.forEach(cell => {
    const parentTd = cell.closest('td');
    if (parentTd) {
      parentTd.style.minHeight = maxHeight + 'px';
      parentTd.style.height = maxHeight + 'px';
      
      // For input elements, center them vertically within the cell
      if (cell.tagName === 'INPUT') {
        cell.style.height = '32px';
        parentTd.style.paddingTop = Math.max(0, (maxHeight - 32) / 2) + 'px';
        parentTd.style.paddingBottom = Math.max(0, (maxHeight - 32) / 2) + 'px';
      }
    }
  });
}

// Switch between view modes
async function switchViewMode(newMode) {
  if (newMode === currentViewMode) return;
  const prevMode = currentViewMode;
  
  // Save current form data before switching views
  if (typeof saveCurrentFormData === 'function') {
    saveCurrentFormData();
  }
  
  currentViewMode = newMode;
  chrome.storage.local.set({ viewMode: newMode });
  
  // If leaving Quick View, persist all row changes to DB
  if (prevMode === 'full' && newMode === 'single') {
    try { await persistActiveRunsheetData(); } catch (e) { console.warn('Persist on close failed', e); }
  }
  
  // Recreate the frame content
  if (runsheetFrame) {
    const content = runsheetFrame.querySelector('.frame-content');
    if (content) {
      content.innerHTML = '';
      if (currentViewMode === 'full') {
        createFullRunsheetView(content);
      } else {
        createSingleEntryView(content);
        // Single entry mode should ALWAYS start blank for new data entry
      }
    }
    updateViewModeButton();
    
    // Update header controls visibility for current mode
    const ids = ['screenshot-btn','view-screenshot-btn','retake-screenshot-btn','analyze-screenshot-btn','open-app-btn','select-runsheet-btn'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // In Quick View (full) hide all these buttons; in Single show default, but keep view/retake hidden until indicator toggles
      if (currentViewMode === 'full') {
        el.style.display = 'none';
      } else {
        if (id === 'view-screenshot-btn' || id === 'retake-screenshot-btn' || id === 'analyze-screenshot-btn') {
          el.style.display = 'none';
        } else {
          el.style.display = 'inline-block';
        }
      }
    });
    
    // Save state when switching view modes
    if (typeof saveExtensionState === 'function') {
      saveExtensionState();
    }
  }
}

// Update the view mode button text
function updateViewModeButton() {
  const viewModeBtn = document.getElementById('view-mode-btn');
  if (viewModeBtn) {
    viewModeBtn.textContent = currentViewMode === 'single' ? '📋 Quick View' : '📝 Save & Close';
  }
}

// Function to link captured image to a specific row
function linkCapturedImageToRow(rowIndex) {
  if (captures.length === 0) {
    showNotification('No captured images available', 'error');
    return;
  }
  
  const lastImage = captures[captures.length - 1];
  
  // Update the Document File Name field
  const input = document.querySelector(`input[data-column="Document File Name"]`);
  if (input) {
    input.value = `captured_document_row_${rowIndex}.png`;
    input.readOnly = false;
    
    // Trigger sync
    syncData();
    
    showNotification(`Image linked to row ${rowIndex + 1}`, 'success');
  }
}

// Setup event listeners for the frame
function setupFrameEventListeners() {
  if (!runsheetFrame) return;
  
  // Update screenshot indicator to show/hide buttons based on current state
  setTimeout(() => {
    updateScreenshotIndicator();
  }, 50);
  
  // Screenshot button
  const screenshotBtn = document.getElementById('screenshot-btn');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', () => {
      startSnipMode();
    });
  }
  
  // View screenshot button
  const viewScreenshotBtn = document.getElementById('view-screenshot-btn');
  if (viewScreenshotBtn) {
    viewScreenshotBtn.addEventListener('click', () => {
      showSnipPreview();
    });
  }
  
  // Retake screenshot button
  const retakeScreenshotBtn = document.getElementById('retake-screenshot-btn');
  if (retakeScreenshotBtn) {
    retakeScreenshotBtn.addEventListener('click', () => {
      retakeScreenshot();
    });
  }
  
  // Remove old row navigation event listeners (no longer needed)
  // Single entry view is for adding new data only
  
  // Open in app button
  const openAppBtn = document.getElementById('open-app-btn');
  if (openAppBtn) {
    openAppBtn.addEventListener('click', () => {
      if (hasUnsavedData()) {
        showUnsavedDataWarning('opening the app', () => {
          openCurrentRunsheetInApp();
        });
      } else {
        openCurrentRunsheetInApp();
      }
    });
  }
  
  // View mode button
  const viewModeBtn = document.getElementById('view-mode-btn');
  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
      const newMode = currentViewMode === 'single' ? 'full' : 'single';
      
      if (currentViewMode === 'single' && hasUnsavedData()) {
        showUnsavedDataWarning('switching to Quick View', () => {
          switchViewMode(newMode);
        });
      } else {
        switchViewMode(newMode);
      }
    });
  }
  
  // Select runsheet button
  const selectRunsheetBtn = document.getElementById('select-runsheet-btn');
  if (selectRunsheetBtn) {
    selectRunsheetBtn.addEventListener('click', () => {
      if (hasUnsavedData()) {
        showUnsavedDataWarning('selecting a different sheet', () => {
          showRunsheetSelector();
        });
      } else {
        showRunsheetSelector();
      }
    });
  }
}

// Check if there's unsaved data in single entry mode
function hasUnsavedData() {
  if (currentViewMode !== 'single') return false;

  // Look for the editable single-entry row
  const editableRow = document.querySelector('#runsheetpro-runsheet-frame .editable-row');

  // If the editable row isn't found, fall back to any textareas inside the frame
  const scope = editableRow || document.querySelector('#runsheetpro-runsheet-frame');
  if (!scope) return false;

  // Any non-empty textarea counts as unsaved data
  const textareas = scope.querySelectorAll('textarea');
  for (const textarea of textareas) {
    if (textarea.value && textarea.value.trim()) {
      return true;
    }
  }

  // If a screenshot was captured but not yet added to the sheet, warn as well
  if (window.currentCapturedSnip && !screenshotAddedToSheet) {
    return true;
  }

  // If Document File Name has a value but not yet added (rare in single view), treat as unsaved
  const docInput = scope.querySelector('input[type="hidden"][data-column="Document File Name"]');
  if (docInput && docInput.value && docInput.value.trim() && !screenshotAddedToSheet) {
    return true;
  }

  return false;
}

// Show warning dialog for unsaved data
function showUnsavedDataWarning(action, callback) {
  const existingDialog = document.getElementById('unsaved-data-dialog');
  if (existingDialog) existingDialog.remove();
  
  const dialog = document.createElement('div');
  dialog.id = 'unsaved-data-dialog';
  dialog.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 10001 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;
  
  dialog.innerHTML = `
    <div style="
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      margin: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    ">
      <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">⚠️ Unsaved Data</h3>
      <p style="margin: 0 0 20px 0; color: #666; line-height: 1.4;">
        You have unsaved data in the current entry. Do you want to add it to the runsheet before ${action}?
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="save-and-continue" style="
          background: hsl(215 80% 40%);
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Add to Sheet & ${action}</button>
        <button id="continue-without-saving" style="
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Discard & ${action}</button>
        <button id="cancel-action" style="
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Event handlers
  document.getElementById('save-and-continue').addEventListener('click', async () => {
    dialog.remove();
    // Add current data to sheet first
    await addRowToSheet();
    // Then proceed with the action
    callback();
  });
  
  document.getElementById('continue-without-saving').addEventListener('click', () => {
    dialog.remove();
    callback();
  });
  
  document.getElementById('cancel-action').addEventListener('click', () => {
    dialog.remove();
  });
  
  // Close on outside click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
}

// Open current runsheet in the main app
async function openCurrentRunsheetInApp() {
  if (!activeRunsheet) {
    showNotification('No active runsheet to open', 'error');
    return;
  }
  
  // Get the current domain (you may need to adjust this URL based on your app's deployment)
  const appUrl = window.location.origin.includes('localhost') 
    ? 'http://localhost:5173' 
    : 'https://preview--docu-flow-excel-form.lovable.app';
  
  // Construct URL to open the specific runsheet
  let runsheetUrl = `${appUrl}/runsheet?id=${activeRunsheet.id || 'default'}`;
  
  // Include auth data if available
  if (userSession && userSession.access_token) {
    const authData = {
      access_token: userSession.access_token,
      refresh_token: userSession.refresh_token
    };
    const encodedAuth = encodeURIComponent(JSON.stringify(authData));
    runsheetUrl += `&extension_auth=${encodedAuth}`;
  }
  
  // Open in new tab
  window.open(runsheetUrl, '_blank');
  
  showNotification(`Opening runsheet: ${activeRunsheet.name}`, 'info');
}

// Start snip mode (select area to capture) - show mode selector first
function startSnipMode() {
  console.log('🔧 RunsheetPro Extension: startSnipMode() called without parameters - showing selector');
  showSnipModeSelector(true); // Use default behavior (show overwrite warning)
}

// Capture selected area
async function captureSelectedArea(left, top, width, height) {
  console.log('🔧 RunsheetPro Extension: Capturing area:', { left, top, width, height });
  
  try {
    // Request screenshot from background script
    const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
    
    if (response && response.dataUrl) {
      // Create canvas to crop the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size to selection
        canvas.width = width;
        canvas.height = height;
        
        // Draw the cropped portion
        ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
        
        // Get the cropped image data
        const croppedDataUrl = canvas.toDataURL('image/png');
        
        // Add to captures and process
        captures.push(croppedDataUrl);
        showNotification('Area captured successfully!', 'success');
        
        console.log('🔧 RunsheetPro Extension: Snipped area captured');
      };
      img.src = response.dataUrl;
    }
  } catch (error) {
    console.error('Snip capture error:', error);
    showNotification('Failed to capture area', 'error');
  }
}

// Toggle capture functionality
function toggleCapture() {
  const captureBtn = document.getElementById('capture-btn');
  
  if (isCapturing) {
    // Stop capturing
    isCapturing = false;
    captureBtn.textContent = '📷 Capture';
    captureBtn.classList.remove('capturing');
    
    if (captures.length > 0) {
      processCapturedImages();
    }
  } else {
    // Start capturing
    isCapturing = true;
    captures = [];
    captureBtn.textContent = '🛑 Stop';
    captureBtn.classList.add('capturing');
    startCaptureLoop();
  }
}

// Start the capture loop
function startCaptureLoop() {
  if (!isCapturing) return;
  
  chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
    if (response && response.dataUrl) {
      captures.push(response.dataUrl);
      console.log(`🔧 RunsheetPro Extension: Captured image ${captures.length}`);
    }
    
    if (isCapturing) {
      setTimeout(startCaptureLoop, 2000); // Capture every 2 seconds
    }
  });
}

// Process captured images
async function processCapturedImages() {
  if (captures.length === 0) return;
  
  console.log(`🔧 RunsheetPro Extension: Processing ${captures.length} captured images`);
  // For now, just use the last capture
  const latestCapture = captures[captures.length - 1];
  
  showNotification(`${captures.length} images captured`, 'success');
}

// Sync data with Supabase
async function syncData() {
  if (!activeRunsheet || !userSession) {
    showNotification('No active runsheet or authentication', 'error');
    return;
  }
  
  console.log('🔧 RunsheetPro Extension: Syncing data');
  
  // Gather data from input fields and textareas
  const inputs = document.querySelectorAll('#runsheetpro-runsheet-frame input, #runsheetpro-runsheet-frame textarea');
  const rowData = {};
  
  inputs.forEach(input => {
    if (input.dataset.column && input.value.trim()) {
      rowData[input.dataset.column] = input.value.trim();
    }
  });
  
  if (Object.keys(rowData).length === 0) {
    console.log('🔧 RunsheetPro Extension: No data to sync');
    return;
  }
  
  try {
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet.id,
        row_data: rowData,
        screenshot_url: captures.length > 0 ? captures[captures.length - 1] : null
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('Data synced successfully!', 'success');
      console.log('🔧 RunsheetPro Extension: Data synced successfully');
    } else {
      throw new Error(result.error || 'Sync failed');
    }
  } catch (error) {
    console.error('Sync error:', error);
    showNotification('Failed to sync data', 'error');
  }
}

// Sync a specific row in Quick View (full)
async function syncFullRow(rowIndex) {
  try {
    if (!activeRunsheet || !userSession) return;
    // Collect inputs for this row
    const rowInputs = document.querySelectorAll(`#runsheetpro-runsheet-frame [data-row="${rowIndex}"]`);
    const rowData = {};
    rowInputs.forEach((el) => {
      const col = el.getAttribute('data-column');
      if (col) rowData[col] = (el.value && typeof el.value === 'string') ? el.value.trim() : (el.value || '');
    });
    // Merge with any existing values like screenshot_url
    const existing = (activeRunsheet.data && activeRunsheet.data[rowIndex]) || {};
    activeRunsheet.data[rowIndex] = { ...existing, ...rowData };

    await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet.id,
        row_data: activeRunsheet.data[rowIndex],
        target_row_index: rowIndex
      })
    });
  } catch (e) {
    console.error('syncFullRow error:', e);
  }
}

// Persist entire runsheet data (used when leaving Quick View)
async function persistActiveRunsheetData() {
  try {
    if (!activeRunsheet || !userSession) return;
    const res = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/rest/v1/runsheets?id=eq.' + activeRunsheet.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
      },
      body: JSON.stringify({ data: activeRunsheet.data, updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      console.warn('persistActiveRunsheetData failed', await res.text());
    }
  } catch (e) {
    console.error('persistActiveRunsheetData error:', e);
  }
}

// Toggle frame minimization
function toggleMinimize() {
  const content = document.querySelector('.frame-content');
  const minimizeBtn = document.getElementById('minimize-btn');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    minimizeBtn.textContent = '−';
    
    // Update stored state
    if (activeRunsheet) {
      chrome.storage.local.set({ 'active_runsheet': activeRunsheet });
    }
  } else {
    content.style.display = 'none';
    minimizeBtn.textContent = '+';
    
    // Update stored state
    if (activeRunsheet) {
      chrome.storage.local.set({ 'active_runsheet': activeRunsheet });
    }
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `runsheetpro-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      document.body.removeChild(notification);
    }
  }, 3000);
}

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize extension with state restoration
function initializeExtension() {
  console.log('🔧 RunsheetPro Extension: Starting initializeExtension() function');
  
  // Check enable/disable flags (support both legacy and new keys)
  chrome.storage.local.get(['extension_enabled', 'extensionEnabled', 'extension_disabled']).then((settings) => {
    const enabledFlag = settings.extensionEnabled;
    const legacyEnabled = settings.extension_enabled; // just in case
    const disabledFlag = settings.extension_disabled;

    const isEnabled = (enabledFlag !== false && legacyEnabled !== false) && disabledFlag !== true;

    if (!isEnabled) {
      console.log('🔧 RunsheetPro Extension: Extension is disabled');
      return;
    }
    
    console.log('🔧 RunsheetPro Extension: Extension is enabled, continuing initialization');
    
    // Always create the runsheet button first
    createRunsheetButton();
    console.log('🔧 RunsheetPro Extension: Button creation attempted');
  }).catch((err) => {
    console.warn('🔧 RunsheetPro Extension: Could not read storage, defaulting to enabled:', err);
    createRunsheetButton();
  });
}

async function init() {
  console.log('🔧 RunsheetPro Extension: Starting init() function');
  
  try {
    // Check enable/disable flags (support both legacy and new keys)
    const settings = await chrome.storage.local.get(['extension_enabled', 'extensionEnabled', 'extension_disabled']);
    console.log('🔧 Extension settings retrieved:', settings);
    
    const enabledFlag = settings.extensionEnabled;
    const legacyEnabled = settings.extension_enabled;
    const disabledFlag = settings.extension_disabled;
    
    // Default to enabled if no settings exist
    const isEnabled = enabledFlag !== false && legacyEnabled !== false && disabledFlag !== true;
    
    console.log('🔧 Extension enabled status:', isEnabled);

    if (!isEnabled) {
      console.log('🔧 RunsheetPro Extension: Extension is disabled');
      return;
    }
  } catch (e) {
    console.warn('🔧 RunsheetPro Extension: Storage check failed, assuming enabled', e);
  }
  
  console.log('🔧 RunsheetPro Extension: Extension is enabled, continuing initialization');
  
  // Use state restoration system if available
  if (typeof initializeExtensionWithStateRestore === 'function') {
    console.log('🔧 RunsheetPro Extension: Using advanced state restoration');
    await initializeExtensionWithStateRestore();
  } else {
    console.log('🔧 RunsheetPro Extension: Using basic initialization');
    
    // Always create the runsheet button first
    createRunsheetButton();
    console.log('🔧 RunsheetPro Extension: Button creation attempted');
    
    // Check authentication after button is created
    const isAuthenticated = await checkAuth();
    console.log('🔧 RunsheetPro Extension: Authentication check result:', isAuthenticated);
    
    // Check if there's an active runsheet to restore (only if authenticated)
    if (isAuthenticated) {
      const storedData = await chrome.storage.local.get(['active_runsheet', 'activeRunsheet']);
      const restoredRunsheet = storedData.active_runsheet || storedData.activeRunsheet;
      if (restoredRunsheet) {
        console.log('🔧 RunsheetPro Extension: Restoring active runsheet:', restoredRunsheet.name);
        
        // Restore the active runsheet
        activeRunsheet = restoredRunsheet;
        
        // Find the next available blank row for data entry
        currentRowIndex = findNextAvailableRow(activeRunsheet);
        console.log('🔧 RunsheetPro Extension: Set currentRowIndex to next available row:', currentRowIndex);
        
        // Create and show the frame with the restored runsheet
        createRunsheetFrame();
        if (runsheetFrame) {
          runsheetFrame.style.display = 'block';
          document.body.appendChild(runsheetFrame);
          setupFrameEventListeners();
        }
        
        showNotification(`Restored runsheet: ${activeRunsheet.name} (Row ${currentRowIndex + 1})`, 'success');
      }
    } else {
      console.log('🔧 RunsheetPro Extension: User not authenticated, button will show sign-in prompt');
    }
  }
  
  // Setup global event listeners for bootstrap communication
  window.addEventListener('runsheetpro-open', async () => {
    console.log('🔧 RunsheetPro Extension: Custom event received from bootstrap');
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
      showRunsheetSelector();
    } else {
      showSignInPopup();
    }
  });

  // Expose global function for bootstrap fallback
  window.openRunsheetUI = async () => {
    console.log('🔧 RunsheetPro Extension: Global function called from bootstrap');
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
      showRunsheetSelector();
    } else {
      showSignInPopup();
    }
  };
  
  console.log('🔧 RunsheetPro Extension: Initialized successfully');
}

// =============================================================================
// SNIP FUNCTIONALITY
// =============================================================================

// Show snip mode selector modal
function showSnipModeSelector(skipOverwriteCheck = true) {
  console.log('🔧 RunsheetPro Extension: showSnipModeSelector() called');
  // Remove any existing selector
  const existingSelector = document.getElementById('runsheetpro-snip-selector');
  if (existingSelector) {
    existingSelector.remove();
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'runsheetpro-snip-selector';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483647 !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;

  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white !important;
    border-radius: 12px !important;
    padding: 24px !important;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
    max-width: 480px !important;
    width: 90vw !important;
    color: #1f2937 !important;
  `;

  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #1f2937;">Choose Screenshot Mode</h2>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">Select how you want to capture your screenshots</p>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <button id="single-snip-option" style="
        background: linear-gradient(135deg, #4285f4, #5c70d6);
        color: white;
        border: none;
        border-radius: 12px;
        padding: 16px;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(66, 133, 244, 0.2);
      ">
        <div style="font-weight: 600; margin-bottom: 4px;">📷 Single Snip</div>
        <div style="opacity: 0.9; font-size: 13px;">Capture one area and automatically link it to your runsheet</div>
      </button>
      
      <button id="scroll-snip-option" style="
        background: linear-gradient(135deg, #10b981, #14a85f);
        color: white;
        border: none;
        border-radius: 12px;
        padding: 16px;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
      ">
        <div style="font-weight: 600; margin-bottom: 4px;">📜 Snip & Scroll</div>
        <div style="opacity: 0.9; font-size: 13px;">Capture multiple areas on the same page by scrolling between snips</div>
      </button>
      
      <button id="navigate-snip-option" style="
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        border: none;
        border-radius: 12px;
        padding: 16px;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
      ">
        <div style="font-weight: 600; margin-bottom: 4px;">🔗 Snip & Navigate</div>
        <div style="opacity: 0.9; font-size: 13px;">Capture areas across multiple pages by clicking links or navigating</div>
      </button>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
      <button id="cancel-snip-selector" style="
        background: transparent;
        color: #6b7280;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
      ">Cancel</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById('single-snip-option').addEventListener('click', () => {
    overlay.remove();
    startSnipModeWithMode('single', skipOverwriteCheck);
  });

  document.getElementById('scroll-snip-option').addEventListener('click', () => {
    overlay.remove();
    startSnipModeWithMode('scroll', skipOverwriteCheck);
  });

  document.getElementById('navigate-snip-option').addEventListener('click', () => {
    overlay.remove();
    startSnipModeWithMode('navigate', skipOverwriteCheck);
  });

  document.getElementById('cancel-snip-selector').addEventListener('click', () => {
    overlay.remove();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Add hover effects
  const buttons = modal.querySelectorAll('button[id$="-option"]');
  buttons.forEach(button => {
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
    });
  });
}

// Show runsheet selector modal
async function showRunsheetSelector() {
  // Remove any existing selector
  const existingSelector = document.getElementById('runsheetpro-runsheet-selector');
  if (existingSelector) {
    existingSelector.remove();
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'runsheetpro-runsheet-selector';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483647 !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;

  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white !important;
    border-radius: 12px !important;
    padding: 24px !important;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
    max-width: 600px !important;
    max-height: 80vh !important;
    width: 90vw !important;
    color: #1f2937 !important;
    overflow-y: auto !important;
  `;

  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #1f2937;">Select Runsheet</h2>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">Choose from your saved runsheets</p>
    </div>
    
    <div id="runsheets-loading" style="text-align: center; padding: 40px;">
      <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f4f6; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 16px; color: #6b7280;">Loading runsheets...</p>
    </div>
    
    <div id="runsheets-list" style="display: none;"></div>
    
    <div style="text-align: center; margin-top: 20px;">
      <button id="cancel-runsheet-selector" style="
        background: transparent;
        color: #6b7280;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        margin-right: 12px;
      ">Cancel</button>
      <button id="create-new-runsheet" style="
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
      ">Create New</button>
    </div>
  `;

  overlay.appendChild(modal);

  // Cancel button
  const cancelBtn = modal.querySelector('#cancel-runsheet-selector');
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  // Create new button
  const createNewBtn = modal.querySelector('#create-new-runsheet');
  createNewBtn.addEventListener('click', () => {
    overlay.remove();
    // Show the quick create dialog to properly name and save the new runsheet
    showQuickCreateDialog();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);

  // Load runsheets
  try {
    // Check if user is authenticated
    if (!userSession || !userSession.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/get-user-runsheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userSession.access_token}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch runsheets: ${response.statusText}`);
    }

    const data = await response.json();
    const runsheets = data.runsheets || [];

    // Hide loading and show list
    const loadingDiv = modal.querySelector('#runsheets-loading');
    const listDiv = modal.querySelector('#runsheets-list');
    loadingDiv.style.display = 'none';
    listDiv.style.display = 'block';

    if (runsheets.length === 0) {
      listDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6b7280;">
          <p style="margin: 0; font-size: 16px;">No saved runsheets found</p>
          <p style="margin: 8px 0 0 0; font-size: 14px;">Create your first runsheet to get started</p>
        </div>
      `;
    } else {
      listDiv.innerHTML = runsheets.map(runsheet => `
        <div class="runsheet-item" data-runsheet="${encodeURIComponent(JSON.stringify(runsheet))}" style="
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        ">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: #1f2937;">${runsheet.name}</div>
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
            Created: ${new Date(runsheet.created_at).toLocaleDateString()}
          </div>
          <div style="font-size: 12px; color: #9ca3af;">
            ${(runsheet.data && runsheet.data.length) || 0} rows • ${(runsheet.columns && runsheet.columns.length) || 0} columns
          </div>
        </div>
      `).join('');

      // Add hover effects and click handlers
      const runsheetItems = listDiv.querySelectorAll('.runsheet-item');
      runsheetItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f9fafb';
          item.style.borderColor = '#3b82f6';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'white';
          item.style.borderColor = '#e5e7eb';
        });
        
        item.addEventListener('click', () => {
          const runsheetData = JSON.parse(decodeURIComponent(item.dataset.runsheet));
          loadSelectedRunsheet(runsheetData);
          overlay.remove();
        });
      });
    }
  } catch (error) {
    console.error('Failed to load runsheets:', error);
    const loadingDiv = modal.querySelector('#runsheets-loading');
    loadingDiv.innerHTML = `
      <div style="text-align: center; color: #dc2626;">
        <p style="margin: 0;">Failed to load runsheets</p>
        <p style="margin: 8px 0 0 0; font-size: 14px;">${error.message}</p>
      </div>
    `;
  }
}

// Load selected runsheet
function loadSelectedRunsheet(runsheetData) {
  // Convert database format to extension format
  activeRunsheet = {
    id: runsheetData.id,
    name: runsheetData.name,
    columns: runsheetData.columns || [],
    data: runsheetData.data || [],
    columnInstructions: runsheetData.column_instructions || {}
  };

  // Find the first available row instead of defaulting to 0
  currentRowIndex = findNextAvailableRow(activeRunsheet);
  console.log(`🔧 RunsheetPro Extension: Set current row to ${currentRowIndex} (next available row)`);

  // Save to storage (and mirror via persistent-state if available)
  chrome.storage.local.set({ activeRunsheet });
  if (typeof saveExtensionState !== 'undefined') {
    saveExtensionState();
  }

  // Refresh the frame
  createRunsheetFrame();
  if (runsheetFrame) {
    runsheetFrame.style.display = 'block';
    document.body.appendChild(runsheetFrame);
    setupFrameEventListeners();
  }
  
  showNotification(`Loaded runsheet: ${runsheetData.name}`, 'success');
}

// Start snip mode with specific mode
function startSnipModeWithMode(mode = 'single', skipOverwriteCheck = false) {
  if (isSnipMode) return;
  
  // Check if there's already a file for this row and warn user (unless skipping)
  if (!skipOverwriteCheck && activeRunsheet && activeRunsheet.data && activeRunsheet.data[currentRowIndex]) {
    const currentRow = activeRunsheet.data[currentRowIndex];
    const hasExistingFile = (currentRow['Document File Name'] && currentRow['Document File Name'].trim() !== '' && currentRow['Document File Name'] !== 'N/A') || 
                           (currentRow['screenshot_url'] && currentRow['screenshot_url'].trim() !== '' && currentRow['screenshot_url'] !== 'N/A');
    
    if (hasExistingFile) {
      const confirmOverwrite = confirm('A document/screenshot already exists for this row. Taking a new screenshot will replace the existing file. Continue?');
      if (!confirmOverwrite) {
        return;
      }
    }
  }
  
  console.log('🔧 RunsheetPro Extension: Starting snip mode:', mode);
  isSnipMode = true;
  snipMode = mode;
  capturedSnips = [];
  
  // For scroll and navigate modes, initialize persistent session
  if (mode === 'scroll' || mode === 'navigate') {
    snipSession = {
      active: true,
      mode: mode,
      captures: [],
      currentFormData: {},
      startTime: Date.now()
    };
    
    // Save current form data before starting
    if (typeof saveCurrentFormData === 'function') {
      saveCurrentFormData();
    }
    if (typeof saveExtensionState === 'function') {
      saveExtensionState();
    }
  }
  
  createSnipOverlay();
  if (mode !== 'single') {
    createSnipControlPanel();
  }
  
  const messages = {
    single: 'Single snip mode! Drag to select area - it will auto-submit when done.',
    scroll: 'Snip & scroll mode! Drag to select areas, scroll as needed. Your session will persist. Smart scrolling enabled for document viewers.',
    navigate: 'Snip & navigate mode! Drag to select areas, navigate between pages. Your session will persist.'
  };
  
  showNotification(messages[mode], 'info');
  
  // Enable smart scroll detection for document viewers
  if (mode === 'scroll') {
    enableSmartScrollDetection();
  }
}

// Create snip overlay for selection
function createSnipOverlay() {
  if (snipOverlay) return;
  
  snipOverlay = document.createElement('div');
  snipOverlay.id = 'runsheetpro-snip-overlay';
  snipOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: transparent !important;
    z-index: 2147483645 !important;
    cursor: crosshair !important;
    user-select: none !important;
    pointer-events: auto !important;
  `;
  
  let isSelecting = false;
  let startX, startY, currentX, currentY;
  
  // Create selection rectangle
  const selectionRect = document.createElement('div');
  selectionRect.style.cssText = `
    position: absolute !important;
    border: 2px dashed #3b82f6 !important;
    background: rgba(59, 130, 246, 0.1) !important;
    display: none !important;
    pointer-events: none !important;
  `;
  snipOverlay.appendChild(selectionRect);
  
  // Mouse events for selection
  snipOverlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = startX;
    currentY = startY;
    
    console.log('🔧 RunsheetPro Extension: Mouse down at:', { startX, startY });
    
    selectionRect.style.left = startX + 'px';
    selectionRect.style.top = startY + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    selectionRect.style.display = 'block';
  });
  
  snipOverlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    
    currentX = e.clientX;
    currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selectionRect.style.left = left + 'px';
    selectionRect.style.top = top + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';
  });
  
  snipOverlay.addEventListener('mouseup', async (e) => {
    if (!isSelecting) return;
    
    isSelecting = false;
    selectionRect.style.display = 'none';
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    console.log('🔧 RunsheetPro Extension: Selection coordinates:', { 
      startX, startY, currentX, currentY, 
      left, top, width, height 
    });
    
    // Allow any size selection - no minimum size restriction
    
    // Hide overlay temporarily for clean capture
    snipOverlay.style.display = 'none';
    if (snipControlPanel) {
      snipControlPanel.style.display = 'none';
    }
    
    // Wait a bit for UI to hide
    setTimeout(async () => {
      await captureSelectedArea(left, top, width, height);
      
      // Handle different modes after capture  
      if (snipMode === 'single') {
        // Single mode: automatically store and cleanup
        cleanupSnipMode();
        showNotification('Screenshot captured and saved!', 'success');
      } else if (snipMode === 'scroll') {
        // Scroll mode: keep crosshairs active for continuous snipping
        snipOverlay.style.display = 'block';
        if (snipControlPanel) {
          snipControlPanel.style.display = 'flex';
        }
        updateSnipCounter();
        showNotification(`Snip ${capturedSnips.length} captured! Continue scrolling and snipping or click "Snipping Complete"`, 'success');
      } else if (snipMode === 'navigate') {
        // Navigate mode: hide crosshairs, show navigation controls with "Next Snip"
        hideSnipModeForNavigation();
        updateSnipCounter();
        showNotification(`Snip ${capturedSnips.length} captured! Navigate to next area and click "Next Snip"`, 'success');
      }
    }, 100);
  });
  
  document.body.appendChild(snipOverlay);
}

// Create snip control panel
function createSnipControlPanel() {
  if (snipControlPanel) return;
  
  snipControlPanel = document.createElement('div');
  snipControlPanel.id = 'runsheetpro-snip-controls';
  
  // Position control panel at bottom of viewport to avoid interfering with snipping
  snipControlPanel.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    padding: 12px 16px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    gap: 12px !important;
    align-items: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    max-width: 90vw !important;
  `;
  
  // Preview toggle button
  const previewToggle = document.createElement('button');
  previewToggle.textContent = '👁 Preview';
  previewToggle.style.cssText = `
    background: #6b7280 !important;
    color: white !important;
    border: none !important;
    padding: 6px 12px !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  `;
  
  
  // Snip counter
  const counter = document.createElement('span');
  counter.id = 'snip-counter';
  counter.style.cssText = `
    font-size: 14px !important;
    color: #374151 !important;
    font-weight: 500 !important;
  `;
  counter.textContent = 'Snips captured: 0';
  
  // Done button
  const doneButton = document.createElement('button');
  doneButton.textContent = snipMode === 'scroll' ? 'Snipping Complete' : 'Done Snipping';
  doneButton.style.cssText = `
    background: #3b82f6 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  
  doneButton.addEventListener('click', finishSnipping);
  
  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    background: #ef4444 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  
  cancelButton.addEventListener('click', cancelSnipping);
  
  snipControlPanel.appendChild(previewToggle);
  snipControlPanel.appendChild(counter);
  snipControlPanel.appendChild(doneButton);
  snipControlPanel.appendChild(cancelButton);
  
  document.body.appendChild(snipControlPanel);
  
  // Create preview panel (initially hidden)
  createSnipPreviewPanel();
}

// Capture selected area
async function captureSelectedArea(left, top, width, height) {
  try {
    // Get tab capture
    const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const img = new Image();
    img.onload = () => {
      // Create canvas for cropping
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Account for device pixel ratio
      const ratio = window.devicePixelRatio || 1;
      
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      // Draw cropped portion
      ctx.drawImage(
        img,
        left * ratio, top * ratio, width * ratio, height * ratio,
        0, 0, width * ratio, height * ratio
      );
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          capturedSnips.push({
            blob: blob,
            timestamp: Date.now(),
            width: width,
            height: height
          });
          
          // Also add to persistent session for navigation/scroll modes
          if (snipMode === 'navigate' || snipMode === 'scroll') {
            snipSession.captures.push({
              blob: blob,
              timestamp: Date.now(),
              width: width,
              height: height
            });
            // Save session to storage
            saveExtensionState();
          }
          
          // Update counter for all modes
          updateSnipCounter();
          
          showNotification(`Snip ${capturedSnips.length} captured!`, 'success');
          
          // For navigate mode, hide crosshairs after capture but keep session active
          if (snipMode === 'navigate') {
            console.log('🔧 RunsheetPro Extension: Navigate mode - hiding crosshairs and showing nav panel');
            hideSnipModeForNavigation();
          }
          
          // Handle single mode - process with AI analysis if available
          if (snipMode === 'single') {
            try {
              // Validate captured content format first
              const validation = await validateCaptureFormat(blob);
              
              if (!validation.isValid) {
                showNotification(validation.error, 'error');
                cleanupSnipMode();
                return;
              }
              
              // Store the snip locally for later use
              window.currentCapturedSnip = blob;
              window.currentSnipFilename = `captured_snip_${Date.now()}.png`;
              
              // If we're in quickview mode, immediately link to the selected row
              if (currentViewMode === 'full' && currentRowIndex !== undefined) {
                await linkScreenshotToSpecificRow(currentRowIndex, blob, window.currentSnipFilename);
                cleanupSnipMode();
                return;
              }
              
              // For single entry mode, continue with standard flow
              // Try enhanced AI processing first
              const aiResult = await processSnipWithAI(blob, {
                filename: window.currentSnipFilename,
                row_index: currentRowIndex
              });
              
              if (aiResult.success) {
                // AI processing succeeded - don't cleanup yet, wait for user decision
                console.log('Enhanced AI analysis completed successfully');
                return;
              } else {
                // AI processing failed - continue with standard flow
                console.log('AI processing failed, continuing with standard flow');
              }
              
              // Standard processing flow
              // Update the Document File Name field in the UI
              const input = document.querySelector(`input[data-column="Document File Name"]`);
              if (input) {
                input.value = window.currentSnipFilename;
              }
              
              // Update the Document File Name column header to show the document interface
              const headerContainer = document.querySelector('.document-header-container');
              if (headerContainer) {
                const uploadInterface = headerContainer.querySelector('.upload-interface');
                const documentInterface = headerContainer.querySelector('.document-interface');
                const filenameText = headerContainer.querySelector('.filename-text');
                
                if (uploadInterface && documentInterface && filenameText) {
                  uploadInterface.style.display = 'none';
                  documentInterface.style.display = 'flex';
                  filenameText.textContent = window.currentSnipFilename;
                  headerContainer.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
                }
              }
              
              // Update screenshot indicator and reset added status
              updateScreenshotIndicator(true);
              screenshotAddedToSheet = false; // New screenshot hasn't been added yet
              
              cleanupSnipMode();
              showNotification('✅ Screenshot captured successfully! Fill in any additional data and click "Add Row" to save.', 'success');
            } catch (error) {
              console.error('Error capturing snip:', error);
              showNotification(`Failed to capture screenshot: ${error.message}`, 'error');
              cleanupSnipMode();
            }
          }
        } else {
          showNotification('Failed to capture snip', 'error');
          if (snipMode === 'single') {
            cleanupSnipMode();
          }
        }
      }, 'image/png');
    };
    
    img.src = response.dataUrl;
    
  } catch (error) {
    console.error('Error capturing snip:', error);
    showNotification('Failed to capture snip: ' + error.message, 'error');
  }
}

// Update snip counter
function updateSnipCounter() {
  // Use session captures count for navigate/scroll modes, capturedSnips for single mode
  const totalSnips = (snipMode === 'navigate' || snipMode === 'scroll') ? 
    snipSession.captures.length : capturedSnips.length;
  
  const counter = document.getElementById('snip-counter');
  if (counter) {
    counter.textContent = `Snips captured: ${totalSnips}`;
  }
  
  // Also update navigation panel counter
  const navCounter = document.getElementById('nav-snip-counter');
  if (navCounter) {
    navCounter.textContent = `Snips captured: ${totalSnips}`;
  }
}

// Finish snipping process
async function finishSnipping() {
  // Use session captures for navigate/scroll modes, capturedSnips for single mode
  const snipsToProcess = (snipMode === 'navigate' || snipMode === 'scroll') ? 
    snipSession.captures : capturedSnips;
  
  if (snipsToProcess.length === 0) {
    showNotification('No snips captured', 'error');
    return;
  }
  
  try {
    showNotification(`Processing ${snipsToProcess.length} snips...`, 'info');
    
    // Store the combined snip locally for the current row
    let finalBlob;
    if (snipsToProcess.length === 1) {
      finalBlob = snipsToProcess[0].blob;
    } else {
      // Combine snips vertically
      finalBlob = await combineSnipsVertically(snipsToProcess);
    }
    
    // Store locally for "Add to Row" functionality
    window.currentCapturedSnip = finalBlob;
    window.currentSnipFilename = `snip_session_${Date.now()}.png`;
    
    // If we're in quickview mode, immediately link to the selected row
    if (currentViewMode === 'full' && currentRowIndex !== undefined) {
      await linkScreenshotToSpecificRow(currentRowIndex, finalBlob, window.currentSnipFilename);
      cleanupSnipMode();
      return;
    }
    
    // Update the Document File Name field in the UI
    const input = document.querySelector(`input[data-column="Document File Name"]`);
    if (input) {
      input.value = window.currentSnipFilename;
    }
    
    // Show file indication in the document header
    const headerContainer = document.querySelector('.document-header-container');
    if (headerContainer) {
      const uploadInterface = headerContainer.querySelector('.upload-interface');
      const documentInterface = headerContainer.querySelector('.document-interface');
      const filenameText = headerContainer.querySelector('.filename-text');
      
      if (uploadInterface && documentInterface && filenameText) {
        uploadInterface.style.display = 'none';
        documentInterface.style.display = 'flex';
        filenameText.textContent = window.currentSnipFilename;
        headerContainer.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
      }
    }
    
    // Update screenshot indicator and reset added status
    updateScreenshotIndicator(true);
    screenshotAddedToSheet = false; // New screenshot hasn't been added yet
    
    showNotification(`✅ ${snipsToProcess.length} snips combined and ready! Fill in data and click "Add to Row" to save everything.`, 'success');
    
  } catch (error) {
    console.error('Error finishing snipping:', error);
    showNotification('Failed to process snips: ' + error.message, 'error');
  } finally {
    cleanupSnipMode();
  }
}

// Cancel snipping
function cancelSnipping() {
  cleanupSnipMode();
  showNotification('Snipping cancelled', 'info');
}

// Hide snip mode temporarily for navigation
function hideSnipModeForNavigation() {
  // Only hide the overlay crosshairs for navigation, but keep session active
  if (snipOverlay) {
    snipOverlay.style.display = 'none';
  }
  
  // Don't remove the control panel - keep it for session persistence
  // Just ensure navigation panel exists
  if (!document.getElementById('runsheetpro-nav-controls')) {
    createNavigationControlPanel();
  }
}

// Create navigation control panel with snip again option
function createNavigationControlPanel() {
  // Remove any existing navigation panel first
  const existingPanel = document.getElementById('runsheetpro-nav-controls');
  if (existingPanel) {
    console.log('🔧 RunsheetPro Extension: Removing existing navigation panel');
    existingPanel.remove();
  }
  
  console.log('🔧 RunsheetPro Extension: Creating navigation control panel');
  const navPanel = document.createElement('div');
  navPanel.id = 'runsheetpro-nav-controls';
  
  // Position at bottom to avoid interfering with page content
  navPanel.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    padding: 12px 16px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    gap: 12px !important;
    align-items: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    backdrop-filter: blur(8px) !important;
  `;
  
  // Snip counter
  const counter = document.createElement('span');
  counter.id = 'nav-snip-counter'; // Add ID for updates
  counter.style.cssText = `
    font-size: 14px !important;
    color: #374151 !important;
    font-weight: 500 !important;
    background: #f3f4f6 !important;
    padding: 6px 12px !important;
    border-radius: 4px !important;
    border: 1px solid #e5e7eb !important;
  `;
  counter.textContent = `Snips captured: ${capturedSnips.length}`;
  
  // Snip Again button
  const snipAgainButton = document.createElement('button');
  snipAgainButton.textContent = 'Next Snip';
  snipAgainButton.style.cssText = `
    background: #3b82f6 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  
  snipAgainButton.addEventListener('click', () => {
    // Don't remove the nav panel - just resume snip mode to add another snip to session
    resumeSnipMode();
  });
  
  // Done button
  const doneButton = document.createElement('button');
  doneButton.textContent = 'Finished Snipping';
  doneButton.style.cssText = `
    background: #10b981 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  
  doneButton.addEventListener('click', () => {
    navPanel.remove();
    finishSnipping();
  });
  
  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    background: #ef4444 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  
  cancelButton.addEventListener('click', () => {
    navPanel.remove();
    cancelSnipping();
  });
  
  navPanel.appendChild(counter);
  navPanel.appendChild(snipAgainButton);
  navPanel.appendChild(doneButton);
  navPanel.appendChild(cancelButton);
  
  document.body.appendChild(navPanel);
  console.log('🔧 RunsheetPro Extension: Navigation control panel created and appended to DOM');
}

// Resume snip mode after navigation
function resumeSnipMode() {
  // Restore captured snips from session
  if (snipSession.active && snipSession.captures.length > 0) {
    capturedSnips = [...snipSession.captures];
  }
  
  // Show the crosshairs overlay for selection
  if (snipOverlay) {
    snipOverlay.style.display = 'block';
  } else {
    createSnipOverlay();
  }
  
  // Don't create a separate control panel - session persists with navigation panel
  showNotification('Ready for next snip! Drag to select area.', 'info');
}

// Cleanup snip mode
function cleanupSnipMode() {
  isSnipMode = false;
  capturedSnips = [];
  
  if (snipOverlay) {
    snipOverlay.remove();
    snipOverlay = null;
  }
  
  if (snipControlPanel) {
    snipControlPanel.remove();
    snipControlPanel = null;
  }
  
  // Also remove navigation panel if it exists
  const navPanel = document.getElementById('runsheetpro-nav-controls');
  if (navPanel) {
    navPanel.remove();
  }
  
  // Clear snip session and save state
  if (typeof cleanupSnipSession === 'function') {
    cleanupSnipSession();
  }
}

// Combine snips vertically into one image
async function combineSnipsVertically(snips) {
  return new Promise((resolve, reject) => {
    if (snips.length === 0) {
      reject(new Error('No snips to combine'));
      return;
    }
    
    if (snips.length === 1) {
      resolve(snips[0].blob);
      return;
    }
    
    // Calculate total height and max width
    let totalHeight = 0;
    let maxWidth = 0;
    const images = [];
    let loadedCount = 0;
    
    // Load all images first
    snips.forEach((snip, index) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        totalHeight += img.height;
        maxWidth = Math.max(maxWidth, img.width);
        loadedCount++;
        
        if (loadedCount === snips.length) {
          // All images loaded, combine them
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = maxWidth;
          canvas.height = totalHeight;
          
          let currentY = 0;
          images.forEach(img => {
            // Center image horizontally if it's narrower than maxWidth
            const x = (maxWidth - img.width) / 2;
            ctx.drawImage(img, x, currentY);
            currentY += img.height;
          });
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create combined image'));
            }
          }, 'image/png');
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load snip image'));
      };
      
      img.src = URL.createObjectURL(snip.blob);
    });
  });
}

// Enhanced file format validation for Chrome extension
function validateCaptureFormat(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      
      // Check if it's a valid image format
      const supportedFormats = [
        'data:image/png', 'data:image/jpeg', 'data:image/jpg',
        'data:image/gif', 'data:image/webp', 'data:image/bmp'
      ];
      
      const isSupported = supportedFormats.some(format => dataUrl.startsWith(format));
      
      if (!isSupported) {
        resolve({
          isValid: false,
          error: 'Captured content is not in a supported image format. Please try capturing again.'
        });
      } else {
        resolve({ isValid: true, dataUrl });
      }
    };
    
    reader.onerror = () => {
      resolve({
        isValid: false,
        error: 'Failed to read captured content. Please try capturing again.'
      });
    };
    
    reader.readAsDataURL(blob);
  });
}

// Enhanced processSnipWithAI function with better validation
async function processSnipWithAI(blob, metadata = {}) {
  try {
    if (!window.EnhancedSnipWorkflow) {
      console.warn('Enhanced Snip Workflow not available, falling back to standard processing');
      return { success: false, error: 'Enhanced workflow not available' };
    }

    const processingIndicator = window.EnhancedSnipWorkflow.showProcessingIndicator();

    try {
      const result = await window.EnhancedSnipWorkflow.processEnhancedSnip(blob, metadata);
      
      window.EnhancedSnipWorkflow.hideProcessingIndicator();
      
      if (result.success && result.analysis) {
        // Show analysis preview with option to accept or edit
        window.onAnalysisAccepted = (analysisResult) => {
          // Fill form with extracted data
          if (analysisResult.analysis?.extracted_data) {
            fillFormWithExtractedData(analysisResult.analysis.extracted_data);
          }
          showNotification('AI analysis applied! Review and click "Add Row" to save.', 'success');
        };

        window.onAnalysisEdit = (analysisResult) => {
          // Fill form with extracted data for editing
          if (analysisResult.analysis?.extracted_data) {
            fillFormWithExtractedData(analysisResult.analysis.extracted_data);
          }
          showNotification('Analysis data loaded for editing. Make changes and click "Add Row" to save.', 'info');
        };

        window.EnhancedSnipWorkflow.showEnhancedPreview(result);
        return result;
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error) {
      window.EnhancedSnipWorkflow.hideProcessingIndicator();
      throw error;
    }
  } catch (error) {
    console.error('Enhanced snip processing error:', error);
    showNotification(`AI analysis failed: ${error.message}. Using standard snip processing.`, 'warning');
    return { success: false, error: error.message };
  }
}

// Upload snip to Supabase storage
async function uploadSnipToStorage(blob) {
  try {
    if (!userSession) {
      throw new Error('User not authenticated');
    }
    
    // Create filename with user folder structure
    const filename = `snip-${Date.now()}.png`;
    const filePath = `${userSession.user.id}/snips/${filename}`;
    
    // Upload using the correct storage API format
    const response = await fetch(`https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/documents/${filePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'image/png',
        'x-upsert': 'true'
      },
      body: blob
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to upload snip to storage:', response.status, errorText);
      throw new Error(`Failed to upload snip to storage: ${response.status} ${errorText}`);
    }
    
    // Get public URL
    const publicUrl = `https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/public/documents/${filePath}`;
    
    return {
      url: publicUrl,
      filename: filename,
      filePath: filePath
    };
    
  } catch (error) {
    console.error('Error uploading snip:', error);
    throw error;
  }
}

// Link snip to current runsheet row
async function linkSnipToRunsheet(snipUrl) {
  try {
    console.log('🔧 Starting linkSnipToRunsheet with URL:', snipUrl);
    
    if (!activeRunsheet || !activeRunsheet.id) {
      console.error('No active runsheet found:', activeRunsheet);
      throw new Error('No active runsheet found');
    }
    
    console.log('Active runsheet:', activeRunsheet.id, 'User session:', !!userSession);
    
    // Get current row being worked on
    const runsheetData = activeRunsheet.data || [];
    let targetRowIndex = window.currentDisplayRowIndex || 0;
    
    console.log('Linking snip to row index:', targetRowIndex, 'Current data length:', runsheetData.length);
    
    // Update the row with snip URL in Document File Name column
    if (!runsheetData[targetRowIndex]) {
      runsheetData[targetRowIndex] = {};
    }
    
    // Store the snip URL directly in the Document File Name column so it displays as an image
    runsheetData[targetRowIndex]['Document File Name'] = snipUrl;
    
    console.log('Updated row data:', runsheetData[targetRowIndex]);
    console.log('Making PATCH request to update runsheet...');
    
    // Update the runsheet in Supabase
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/rest/v1/runsheets?id=eq.' + activeRunsheet.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
      },
      body: JSON.stringify({
        data: runsheetData,
        updated_at: new Date().toISOString()
      })
    });
    
    console.log('PATCH response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update runsheet with snip URL:', response.status, errorText);
      throw new Error(`Failed to update runsheet with snip URL: ${response.status} ${errorText}`);
    }
    
    console.log('Runsheet updated successfully');
    
    // Update local activeRunsheet
    activeRunsheet.data = runsheetData;
    
    // Update the Document File Name field in the UI
    const input = document.querySelector(`input[data-column="Document File Name"]`);
    if (input) {
      input.value = snipUrl;
      console.log('Updated Document File Name input with screenshot URL');
    }
    
    // Update the Document File Name column header to show the document interface
    const headerContainer = document.querySelector('.document-header-container');
    if (headerContainer) {
      const uploadInterface = headerContainer.querySelector('.upload-interface');
      const documentInterface = headerContainer.querySelector('.document-interface');
      const filenameText = headerContainer.querySelector('.filename-text');
      
      if (uploadInterface && documentInterface && filenameText) {
        uploadInterface.style.display = 'none';
        documentInterface.style.display = 'flex';
        filenameText.textContent = 'Screenshot captured';
        headerContainer.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
      }
    }
    
    // Create a file object for the brain button functionality
    const file = new File([new Blob()], 'screenshot.png', { type: 'image/png' });
    window.currentAnalysisFile = file;
    window.currentAnalysisFileName = 'screenshot.png';
    
    console.log('Snip linked successfully to row', targetRowIndex);
    
  } catch (error) {
    console.error('Error in linkSnipToRunsheet:', error);
    console.error('Error details:', {
      activeRunsheet: !!activeRunsheet,
      activeRunsheetId: activeRunsheet?.id,
      userSession: !!userSession,
      userSessionToken: !!userSession?.access_token
    });
    throw error;
  }
}
// Listen for messages from other extension parts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('🔧 RunsheetPro Extension: Received message:', request);
  
  if (request.action === 'toggle') {
    if (runsheetButton) {
      runsheetButton.style.display = runsheetButton.style.display === 'none' ? 'block' : 'none';
    }
  } else if (request.action === 'toggleExtension') {
    // Handle extension enable/disable from popup
    if (request.enabled) {
      if (!runsheetButton) {
        createRunsheetButton();
      } else {
        runsheetButton.style.display = 'block';
      }
    } else {
      if (runsheetButton) runsheetButton.style.display = 'none';
      if (runsheetFrame) runsheetFrame.style.display = 'none';
    }
  } else if (request.action === 'switchViewMode') {
    // Handle view mode switching from popup
    switchViewMode(request.viewMode);
    showNotification(`Switched to ${request.viewMode === 'single' ? 'single entry' : 'full view'} mode`, 'info');
  } else if (request.action === 'showSnipModeSelector') {
    // Show snip mode selection modal
    showSnipModeSelector();
  } else if (request.action === 'openRunsheet') {
    // Open the runsheet UI: if frame exists, toggle; else show selector/sign-in
    (async () => {
      try {
        if (runsheetFrame) {
          toggleRunsheetFrame();
          return;
        }
        const isAuthenticated = await checkAuth();
        if (isAuthenticated) {
          showRunsheetSelector();
        } else {
          showSignInPopup();
        }
      } catch (e) {
        console.error('openRunsheet action failed', e);
      }
    })();
  } else if (request.action === 'updateAuth') {
    // Refresh auth status
    checkAuth();
  } else if (request.action === 'deactivate') {
    // Clear active runsheet and hide frame
    activeRunsheet = null;
    chrome.storage.local.remove(['active_runsheet', 'activeRunsheet']);
    if (runsheetFrame) {
      runsheetFrame.remove();
      runsheetFrame = null;
    }
    showNotification('Extension deactivated', 'info');
  }
  
  sendResponse({ success: true });
});

// React to storage changes to enable/disable the UI in real time
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const enabledChange = changes.extensionEnabled || changes.extension_enabled || changes.extension_disabled;
    if (enabledChange) {
      const enabled = (changes.extensionEnabled ? changes.extensionEnabled.newValue !== false : true)
        && (changes.extension_enabled ? changes.extension_enabled.newValue !== false : true)
        && !(changes.extension_disabled ? changes.extension_disabled.newValue === true : false);
      if (enabled) {
        if (!runsheetButton) createRunsheetButton();
        else runsheetButton.style.display = 'block';
      } else {
        if (runsheetButton) runsheetButton.style.display = 'none';
        if (runsheetFrame) runsheetFrame.style.display = 'none';
      }
    }
  });
} catch (e) {
  console.warn('🔧 RunsheetPro Extension: storage.onChanged listener failed', e);
}

// Initialize when page loads - Handle both initial load and navigation
try {
  console.log('🔧 RunsheetPro Extension: Starting initialization...');
  console.log('🔧 RunsheetPro Extension: Document ready state:', document.readyState);
  
  // Use initializeExtensionWithStateRestore instead of init for proper persistence
  const initializeExtension = () => {
    console.log('🔧 RunsheetPro Extension: Initializing with state restoration');
    if (typeof initializeExtensionWithStateRestore !== 'undefined') {
      initializeExtensionWithStateRestore();
    } else {
      // Fallback to regular init if persistent state not available
      init();
    }
  };
  
  // Handle page navigation by listening to pageshow event (covers back/forward navigation)
  window.addEventListener('pageshow', (event) => {
    console.log('🔧 RunsheetPro Extension: Page shown (navigation detected), reinitializing...');
    setTimeout(initializeExtension, 100);
  });
  
  // Force a small delay to ensure page is fully loaded
  setTimeout(() => {
    if (document.readyState === 'loading') {
      console.log('🔧 RunsheetPro Extension: Adding DOMContentLoaded listener');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('🔧 RunsheetPro Extension: DOMContentLoaded fired, calling init with state restore');
        setTimeout(initializeExtension, 100); // Small delay to ensure DOM is ready
      });
    } else {
      console.log('🔧 RunsheetPro Extension: Document ready, calling init with state restore immediately');
      initializeExtension();
    }
  }, 100);
  
  // Listen for page unload to save state before navigation
  window.addEventListener('beforeunload', () => {
    console.log('🔧 RunsheetPro Extension: Page unloading, saving state...');
    if (typeof saveExtensionState !== 'undefined') {
      saveExtensionState();
    }
    // Also save current form data if frame is open
    if (runsheetFrame && runsheetFrame.style.display !== 'none' && typeof saveCurrentFormData !== 'undefined') {
      saveCurrentFormData();
    }
  });
  
} catch (error) {
  console.error('🔧 RunsheetPro Extension: Critical initialization error:', error);
  console.error('🔧 RunsheetPro Extension: Error stack:', error.stack);
}

// Update screenshot indicator in header and control buttons
function updateScreenshotIndicator(hasScreenshot) {
  // Check for current captured snip first, then check stored screenshot
  const hasCapturedSnip = !!window.currentCapturedSnip;
  const hasStoredScreenshot = activeRunsheet && activeRunsheet.data && activeRunsheet.data[currentRowIndex] && 
    (activeRunsheet.data[currentRowIndex]['Document File Name'] || activeRunsheet.data[currentRowIndex]['screenshot_url']);
  
  // Only show screenshot-related buttons if we actually have a screenshot
  const actuallyHasScreenshot = hasCapturedSnip || hasStoredScreenshot;
  
  const indicator = document.getElementById('screenshot-indicator');
  const analyzeBtn = document.getElementById('analyze-screenshot-btn');
  const viewBtn = document.getElementById('view-screenshot-btn');
  const screenshotBtn = document.getElementById('screenshot-btn');
  const retakeBtn = document.getElementById('retake-screenshot-btn');
  
  if (indicator) {
    indicator.style.display = actuallyHasScreenshot ? 'inline' : 'none';
    indicator.title = actuallyHasScreenshot ? 'Screenshot available for this row' : '';
  }
  
  if (analyzeBtn) {
    analyzeBtn.style.display = actuallyHasScreenshot ? 'inline-block' : 'none';
  }
  
  // Only show header buttons in single entry mode, not in quick view
  if (currentViewMode === 'single') {
    if (viewBtn) {
      viewBtn.style.display = actuallyHasScreenshot ? 'inline-block' : 'none';
    }
    
    // Toggle main screenshot button visibility based on screenshot state
    if (screenshotBtn) {
      screenshotBtn.style.display = actuallyHasScreenshot ? 'none' : 'inline-block';
    }
    
    if (retakeBtn) {
      retakeBtn.style.display = actuallyHasScreenshot ? 'inline-block' : 'none';
    }
  } else {
    // In quick view mode, hide all header screenshot buttons
    if (viewBtn) {
      viewBtn.style.display = 'none';
    }
    if (retakeBtn) {
      retakeBtn.style.display = 'none';
    }
    if (screenshotBtn) {
      screenshotBtn.style.display = 'none';
    }
  }
}

// Update row navigation UI
function updateRowNavigationUI() {
  const prevBtn = document.getElementById('prev-row-btn');
  const nextBtn = document.getElementById('next-row-btn');
  const indicator = document.getElementById('current-row-indicator');
  
  if (prevBtn) {
    prevBtn.disabled = currentRowIndex <= 0;
    prevBtn.style.opacity = currentRowIndex <= 0 ? '0.5' : '1';
  }
  
  if (indicator) {
    indicator.textContent = `(Row ${currentRowIndex + 1})`;
  }
  
  // Check if current row has screenshot and update indicator
  if (activeRunsheet && activeRunsheet.data && activeRunsheet.data[currentRowIndex]) {
    const hasScreenshot = activeRunsheet.data[currentRowIndex]['Document File Name'] || 
                         activeRunsheet.data[currentRowIndex]['screenshot_url'];
    updateScreenshotIndicator(!!hasScreenshot);
  } else {
    updateScreenshotIndicator(false);
  }
  
  // Update screenshot button state when row changes
  // Call updateScreenshotButton if it exists (it's defined within the createRunsheetFrame scope)
  if (typeof window.updateScreenshotButtonGlobal === 'function') {
    window.updateScreenshotButtonGlobal();
  }
}

// Analyze current screenshot with AI
async function analyzeCurrentScreenshot() {
  if (!activeRunsheet || !userSession) {
    showNotification('No active runsheet or authentication', 'error');
    return;
  }

  // Get screenshot from current data or captured snip
  let screenshotData = null;
  
  if (window.currentCapturedSnip) {
    // Convert blob to data URL for analysis
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(window.currentCapturedSnip);
      });
      screenshotData = dataUrl;
    } catch (error) {
      console.error('Failed to convert blob to data URL:', error);
      showNotification('Failed to process screenshot data', 'error');
      return;
    }
  } else if (activeRunsheet.data && activeRunsheet.data[currentRowIndex]) {
    const storedScreenshotUrl = activeRunsheet.data[currentRowIndex]['screenshot_url'];
    
    // If it's a storage URL, we need to fetch it and convert to data URL
    if (storedScreenshotUrl && storedScreenshotUrl.startsWith('https://')) {
      try {
        console.log('🔧 Fetching screenshot from storage URL for analysis');
        const response = await fetch(storedScreenshotUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch screenshot: ${response.statusText}`);
        }
        const blob = await response.blob();
        
        // Convert blob to data URL
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        screenshotData = dataUrl;
      } catch (error) {
        console.error('Failed to fetch and convert screenshot:', error);
        showNotification('Failed to load screenshot for analysis', 'error');
        return;
      }
    } else {
      // It's already a data URL
      screenshotData = storedScreenshotUrl;
    }
  } else if (captures.length > 0) {
    screenshotData = captures[captures.length - 1];
  }

  if (!screenshotData) {
    showNotification('No screenshot available to analyze', 'error');
    return;
  }

  try {
    showNotification('Analyzing screenshot...', 'info');
    
    const analyzeBtn = document.getElementById('analyze-screenshot-btn');
    if (analyzeBtn) {
      analyzeBtn.textContent = '🔄 Analyzing...';
      analyzeBtn.disabled = true;
    }

    // Get active runsheet data for better extraction
    const runsheetData = await chrome.storage.local.get(['activeRunsheet']);
    const activeRunsheet = runsheetData.activeRunsheet;
    
    // Build extraction prompt based on runsheet columns
    let extractionPrompt = `Analyze this document image and extract any relevant data for the current runsheet. Please extract text, numbers, dates, and other relevant information that can be used to populate form fields.`;
    
    if (activeRunsheet?.columns) {
      const extractionFields = activeRunsheet.columns.map(col => `${col}: [extracted value]`).join('\n');
      extractionPrompt = `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`;
    }

    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/analyze-document', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: extractionPrompt,
        imageData: screenshotData
      })
    });

    const result = await response.json();
    
    if (analyzeBtn) {
      analyzeBtn.textContent = '🔍 Analyze';
      analyzeBtn.disabled = false;
    }

    if (result.generatedText) {
      showNotification('Screenshot analyzed successfully!', 'success');
      
      try {
        // Parse the JSON response from the AI
        const extractedData = JSON.parse(result.generatedText);
        fillFormWithExtractedData(extractedData);
      } catch (parseError) {
        console.error('Failed to parse extracted data:', parseError);
        showNotification('Analysis completed but data format was invalid', 'warning');
      }
    } else {
      throw new Error(result.error || 'Analysis failed');
    }
  } catch (error) {
    console.error('Screenshot analysis error:', error);
    showNotification('Failed to analyze screenshot', 'error');
    
    const analyzeBtn = document.getElementById('analyze-screenshot-btn');
    if (analyzeBtn) {
      analyzeBtn.textContent = '🔍 Analyze';
      analyzeBtn.disabled = false;
    }
  }
}

// Function to view current screenshot
// Function to view current screenshot - DEPRECATED
// This function has been replaced by showSnipPreview() for consistency
function deletedViewCurrentScreenshot() {
  console.log('🔧 OLD FUNCTION CALLED - redirecting to showSnipPreview');
  showSnipPreview();
}

// Function to retake screenshot
function retakeScreenshot() {
  // Clear current screenshot
  window.currentCapturedSnip = null;
  window.currentSnipFilename = null;
  
  // Update button visibility and reset added status
  updateScreenshotIndicator(false);
  screenshotAddedToSheet = false; // Reset since screenshot is cleared
  
  // Start new screenshot process
  startSnipMode();
  
  showNotification('Previous screenshot cleared. Take a new screenshot.', 'info');
}

// Fill form fields with extracted data from AI analysis
function fillFormWithExtractedData(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return;
  
  console.log('🔧 RunsheetPro Extension: Filling form with extracted data:', extractedData);
  
  // Map common field names to runsheet columns
  const fieldMapping = {
    'instrument_number': 'Inst Number',
    'book_page': 'Book/Page',
    'instrument_type': 'Inst Type',
    'recording_date': 'Recording Date',
    'document_date': 'Document Date',
    'grantor': 'Grantor',
    'grantee': 'Grantee',
    'legal_description': 'Legal Description',
    'notes': 'Notes'
  };

  // Fill in fields based on mapping
  Object.entries(fieldMapping).forEach(([aiField, columnName]) => {
    if (extractedData[aiField]) {
      const input = document.querySelector(`input[data-column="${columnName}"], textarea[data-column="${columnName}"]`);
      if (input && !input.value.trim()) { // Only fill if field is empty
        input.value = extractedData[aiField];
        
        // Trigger auto-resize for textareas
        if (input.tagName === 'TEXTAREA') {
          input.style.height = 'auto';
          input.style.height = Math.max(32, input.scrollHeight) + 'px';
        }
      }
    }
  });

  // Also try to fill any other fields that match exactly
  Object.entries(extractedData).forEach(([key, value]) => {
    if (value && typeof value === 'string') {
      const input = document.querySelector(`input[data-column="${key}"], textarea[data-column="${key}"]`);
      if (input && !input.value.trim()) {
        input.value = value;
        
        if (input.tagName === 'TEXTAREA') {
          input.style.height = 'auto';
          input.style.height = Math.max(32, input.scrollHeight) + 'px';
        }
      }
    }
  });
}

// Create snip preview panel
function createSnipPreviewPanel() {
  const previewPanel = document.createElement('div');
  previewPanel.id = 'runsheetpro-snip-preview';
  previewPanel.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 300px !important;
    max-height: 400px !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    z-index: 2147483648 !important;
    display: none !important;
    flex-direction: column !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 16px !important;
    border-bottom: 1px solid #e5e7eb !important;
    font-weight: 600 !important;
    font-size: 14px !important;
    color: #374151 !important;
  `;
  header.textContent = 'Captured Snips Preview';
  
  const content = document.createElement('div');
  content.id = 'preview-content';
  content.style.cssText = `
    padding: 12px !important;
    overflow-y: auto !important;
    max-height: 300px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  `;
  
  previewPanel.appendChild(header);
  previewPanel.appendChild(content);
  document.body.appendChild(previewPanel);
}

// Toggle snip preview panel
function toggleSnipPreview() {
  const previewPanel = document.getElementById('runsheetpro-snip-preview');
  if (!previewPanel) return;
  
  if (previewPanel.style.display === 'none' || previewPanel.style.display === '') {
    // Show preview
    previewPanel.style.display = 'flex';
    updateSnipPreview();
  } else {
    // Hide preview
    previewPanel.style.display = 'none';
  }
}

// Update snip preview with current captured snips
function updateSnipPreview() {
  const previewContent = document.getElementById('preview-content');
  if (!previewContent) return;
  
  previewContent.innerHTML = '';
  
  if (capturedSnips.length === 0) {
    previewContent.innerHTML = '<p style="color: #6b7280; font-size: 12px; text-align: center;">No snips captured yet</p>';
    return;
  }
  
  capturedSnips.forEach((snip, index) => {
    const snipItem = document.createElement('div');
    snipItem.style.cssText = `
      border: 1px solid #e5e7eb !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      background: #f9fafb !important;
    `;
    
    const img = document.createElement('img');
    img.src = URL.createObjectURL(snip.blob);
    img.style.cssText = `
      width: 100% !important;
      height: auto !important;
      max-height: 120px !important;
      object-fit: cover !important;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
      padding: 6px 8px !important;
      font-size: 11px !important;
      color: #6b7280 !important;
      background: white !important;
    `;
    label.textContent = `Snip ${index + 1}`;
    
    snipItem.appendChild(img);
    snipItem.appendChild(label);
    previewContent.appendChild(snipItem);
  });
}

// Update table width based on all column widths
function updateTableWidth() {
  const table = document.querySelector('.runsheet-table');
  if (!table) return;
  
  // Calculate total width from all columns
  const cells = document.querySelectorAll('.header-row .table-cell');
  let totalWidth = 0;
  
  cells.forEach(cell => {
    const cellWidth = parseInt(cell.style.width) || 120;
    totalWidth += cellWidth;
  });
  
  // Set table width to fit content (no extra space)
  table.style.width = `${totalWidth}px`;
  table.style.minWidth = `${totalWidth}px`;
  
  // Update all rows to match
  const rows = document.querySelectorAll('.table-row');
  rows.forEach(row => {
    row.style.width = `${totalWidth}px`;
    row.style.minWidth = `${totalWidth}px`;
  });
  
  console.log('🔧 RunsheetPro Extension: Updated table width to', totalWidth, 'px');
}

function showSnipPreview() {
  console.log('🔧 showSnipPreview called, currentRowIndex:', currentRowIndex);
  
  if (!activeRunsheet || !activeRunsheet.data || currentRowIndex >= activeRunsheet.data.length) {
    showNotification('No snip data available', 'error');
    return;
  }

  const currentRow = activeRunsheet.data[currentRowIndex];
  console.log('🔧 Current row data:', currentRow);
  
  let snipUrl = null;

  // Check for stored screenshot URL first
  if (currentRow && currentRow.screenshot_url) {
    snipUrl = currentRow.screenshot_url;
    console.log('🔧 Found screenshot_url:', snipUrl);
  }
  // Then check for current captured snip (blob format)
  else if (window.currentCapturedSnip) {
    // Convert blob to object URL for display
    console.log('🔧 Found currentCapturedSnip, converting blob to URL');
    snipUrl = URL.createObjectURL(window.currentCapturedSnip);
    console.log('🔧 Created object URL:', snipUrl);
  }

  if (!snipUrl) {
    console.log('🔧 No snip URL found');
    showNotification('No linked snip found for this row', 'error');
    return;
  }

  console.log('🔧 Creating document viewer for:', snipUrl);

  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0.9) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 10000 !important;
    backdrop-filter: blur(5px) !important;
  `;

  // Create scrollable viewer container
  const viewerContainer = document.createElement('div');
  viewerContainer.style.cssText = `
    width: 95vw !important;
    height: 95vh !important;
    background: white !important;
    border-radius: 12px !important;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5) !important;
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  `;

  // Create header with controls
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(135deg, hsl(var(--primary, 215 80% 40%)), hsl(var(--primary, 215 80% 45%))) !important;
    color: white !important;
    padding: 15px 20px !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-radius: 12px 12px 0 0 !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1) !important;
  `;

  // Create title
  const title = document.createElement('h3');
  title.textContent = `Document Viewer - Row ${currentRowIndex + 1}`;
  title.style.cssText = `
    margin: 0 !important;
    font-size: 18px !important;
    font-weight: 600 !important;
  `;

  // Create control buttons container
  const controls = document.createElement('div');
  controls.style.cssText = `
    display: flex !important;
    gap: 10px !important;
    align-items: center !important;
  `;

  // Zoom controls
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.innerHTML = '🔍-';
  zoomOutBtn.title = 'Zoom Out';
  zoomOutBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    border-radius: 6px !important;
    padding: 8px 12px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    transition: all 0.2s ease !important;
  `;

  const zoomInBtn = document.createElement('button');
  zoomInBtn.innerHTML = '🔍+';
  zoomInBtn.title = 'Zoom In';
  zoomInBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    border-radius: 6px !important;
    padding: 8px 12px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    transition: all 0.2s ease !important;
  `;

  const resetZoomBtn = document.createElement('button');
  resetZoomBtn.innerHTML = '🔄';
  resetZoomBtn.title = 'Reset Zoom';
  resetZoomBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    border-radius: 6px !important;
    padding: 8px 12px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    transition: all 0.2s ease !important;
  `;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close Viewer';
  closeBtn.style.cssText = `
    background: rgba(220, 38, 38, 0.8) !important;
    color: white !important;
    border: 1px solid rgba(220, 38, 38, 0.9) !important;
    border-radius: 6px !important;
    padding: 8px 12px !important;
    cursor: pointer !important;
    font-size: 16px !important;
    font-weight: bold !important;
    transition: all 0.2s ease !important;
  `;

  // Create scrollable content area
  const scrollContainer = document.createElement('div');
  scrollContainer.style.cssText = `
    flex: 1 !important;
    overflow: auto !important;
    background: #f8f9fa !important;
    position: relative !important;
    padding: 20px !important;
  `;

  // Create image with zoom functionality
  const img = document.createElement('img');
  img.src = snipUrl;
  img.style.cssText = `
    max-width: 100% !important;
    height: auto !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
    transition: transform 0.3s ease !important;
    cursor: grab !important;
    user-select: none !important;
    transform-origin: center center !important;
  `;

  // Add loading and error handling
  img.onload = () => {
    console.log('🔧 Image loaded successfully');
  };
  
  img.onerror = () => {
    console.error('🔧 Failed to load image:', snipUrl);
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjEwMCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
  };

  // Zoom functionality
  let currentZoom = 1;
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;

  const updateZoom = (newZoom) => {
    currentZoom = Math.max(0.25, Math.min(5, newZoom));
    img.style.transform = `scale(${currentZoom})`;
    
    // Update cursor based on zoom level
    if (currentZoom > 1) {
      img.style.cursor = 'grab';
    } else {
      img.style.cursor = 'default';
    }
  };

  // Zoom controls
  zoomInBtn.addEventListener('click', () => updateZoom(currentZoom * 1.25));
  zoomOutBtn.addEventListener('click', () => updateZoom(currentZoom * 0.8));
  resetZoomBtn.addEventListener('click', () => updateZoom(1));

  // Mouse wheel zoom
  scrollContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      updateZoom(currentZoom * delta);
    }
  });

  // Drag functionality for zoomed images
  img.addEventListener('mousedown', (e) => {
    if (currentZoom > 1) {
      isDragging = true;
      img.style.cursor = 'grabbing';
      startX = e.pageX - scrollContainer.offsetLeft;
      startY = e.pageY - scrollContainer.offsetTop;
      scrollLeft = scrollContainer.scrollLeft;
      scrollTop = scrollContainer.scrollTop;
      e.preventDefault();
    }
  });

  scrollContainer.addEventListener('mousemove', (e) => {
    if (!isDragging || currentZoom <= 1) return;
    e.preventDefault();
    const x = e.pageX - scrollContainer.offsetLeft;
    const y = e.pageY - scrollContainer.offsetTop;
    const walkX = (x - startX) * 2;
    const walkY = (y - startY) * 2;
    scrollContainer.scrollLeft = scrollLeft - walkX;
    scrollContainer.scrollTop = scrollTop - walkY;
  });

  scrollContainer.addEventListener('mouseup', () => {
    isDragging = false;
    if (currentZoom > 1) {
      img.style.cursor = 'grab';
    } else {
      img.style.cursor = 'default';
    }
  });

  scrollContainer.addEventListener('mouseleave', () => {
    isDragging = false;
    if (currentZoom > 1) {
      img.style.cursor = 'grab';
    } else {
      img.style.cursor = 'default';
    }
  });

  // Status bar with instructions
  const statusBar = document.createElement('div');
  statusBar.style.cssText = `
    background: #e5e7eb !important;
    color: #374151 !important;
    padding: 10px 20px !important;
    text-align: center !important;
    font-size: 12px !important;
    border-radius: 0 0 12px 12px !important;
  `;
  statusBar.innerHTML = '💡 <strong>Tips:</strong> Use Ctrl+Scroll to zoom • Drag to pan when zoomed • Esc to close';

  // Assemble controls
  controls.appendChild(zoomOutBtn);
  controls.appendChild(resetZoomBtn);
  controls.appendChild(zoomInBtn);
  controls.appendChild(closeBtn);

  // Assemble header
  header.appendChild(title);
  header.appendChild(controls);

  // Assemble container
  scrollContainer.appendChild(img);
  viewerContainer.appendChild(header);
  viewerContainer.appendChild(scrollContainer);
  viewerContainer.appendChild(statusBar);
  modal.appendChild(viewerContainer);

  // Event handlers
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Show modal
  document.body.appendChild(modal);

  // Focus for keyboard events
  modal.focus();
}

// Add test function for debugging
window.testExtensionUI = function() {
  console.log('🧪 Testing Extension UI');
  console.log('🧪 Button exists:', !!document.getElementById('runsheetpro-runsheet-button'));
  console.log('🧪 Frame exists:', !!runsheetFrame);
  console.log('🧪 Active runsheet:', !!activeRunsheet);
  console.log('🧪 User session:', !!userSession);
  
  // Force show sign-in popup for testing
  showSignInPopup();
};

// Improved initialization
try {
  console.log('🔧 Starting initialization...');
  
  // Force initialization after a delay to ensure DOM is ready
  const initWithDelay = () => {
    console.log('🔧 DOM ready state:', document.readyState);
    console.log('🔧 Body exists:', !!document.body);
    
    if (document.body) {
      init();
    } else {
      console.log('🔧 Body not ready, retrying...');
      setTimeout(initWithDelay, 100);
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWithDelay);
  } else {
    setTimeout(initWithDelay, 50);
  }
} catch (error) {
  console.error('🔧 Critical initialization error:', error);
}

// Function to link screenshot directly to a specific row (for quickview mode)
async function linkScreenshotToSpecificRow(rowIndex, blob, filename) {
  try {
    if (!activeRunsheet || !userSession) {
      throw new Error('No active runsheet or authentication');
    }
    
    console.log(`🔧 RunsheetPro Extension: Linking screenshot to row ${rowIndex}`);
    
    // Upload the screenshot first
    const uploadResult = await uploadSnipToStorage(blob);
    
    // Update the specific row in the runsheet data
    if (!activeRunsheet.data[rowIndex]) {
      activeRunsheet.data[rowIndex] = {};
    }
    
    activeRunsheet.data[rowIndex]['Document File Name'] = filename;
    activeRunsheet.data[rowIndex]['screenshot_url'] = uploadResult.url;
    
    // Sync the updated row data with the backend
    const syncResponse = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet.id,
        row_data: activeRunsheet.data[rowIndex],
        screenshot_url: uploadResult.url,
        target_row_index: rowIndex // Specify the exact row to update
      })
    });
    
    if (!syncResponse.ok) {
      throw new Error('Failed to sync screenshot with backend');
    }
    
    // Clear the captured snip since it's now saved
    window.currentCapturedSnip = null;
    window.currentSnipFilename = null;
    
    // Refresh the quickview display to show the new document
    if (currentViewMode === 'full') {
      const content = document.querySelector('#runsheetpro-runsheet-frame .frame-content');
      if (content) {
        // Clear and rebuild to ensure buttons reflect the new state
        content.innerHTML = '';
        createFullRunsheetView(content);
        // Update any dependent UI
        setTimeout(() => {
          try { updateRowNavigationUI && updateRowNavigationUI(); } catch {}
        }, 0);
      }
    }
    
    showNotification('✅ Screenshot linked to row successfully!', 'success');
    
  } catch (error) {
    console.error('Error linking screenshot to row:', error);
    showNotification(`Failed to link screenshot: ${error.message}`, 'error');
  }
}

// Smart scroll detection for document viewers
let smartScrollEnabled = false;
let lastScrollableElement = null;
let scrollKeyHandler = null;

function enableSmartScrollDetection() {
  if (smartScrollEnabled) return;
  
  smartScrollEnabled = true;
  console.log('🔧 RunsheetPro Extension: Smart scroll detection enabled');
  
  // Allow scrolling through the overlay by making specific elements scrollable
  makeOverlayScrollable();
  
  // Remove existing handler
  if (scrollKeyHandler) {
    document.removeEventListener('keydown', scrollKeyHandler);
  }
  
  // Create enhanced scroll handler
  scrollKeyHandler = (e) => {
    // Only handle scroll keys in snip mode
    if (!isSnipMode || snipMode !== 'scroll') return;
    
    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];
    if (!scrollKeys.includes(e.key)) return;
    
    // Find the best scrollable element
    const targetElement = findBestScrollableElement(e.target);
    
    if (targetElement && targetElement !== document.documentElement && targetElement !== document.body) {
      // Prevent default browser scrolling
      e.preventDefault();
      e.stopPropagation();
      
      // Perform smart scroll on the detected element
      performSmartScroll(targetElement, e.key, e.shiftKey);
    }
  };
  
  // Add the scroll handler
  document.addEventListener('keydown', scrollKeyHandler, { passive: false, capture: true });
  
  // Also detect mouse wheel events on specific elements
  enableMouseWheelScrollDetection();
}

function disableSmartScrollDetection() {
  if (!smartScrollEnabled) return;
  
  smartScrollEnabled = false;
  console.log('🔧 RunsheetPro Extension: Smart scroll detection disabled');
  
  if (scrollKeyHandler) {
    document.removeEventListener('keydown', scrollKeyHandler);
    scrollKeyHandler = null;
  }
  
  // Remove mouse wheel detection
  disableMouseWheelScrollDetection();
  
  // Clean up scroll overlay modifications
  cleanupScrollOverlay();
}

function findBestScrollableElement(startElement) {
  let element = startElement;
  
  // Walk up the DOM tree to find scrollable elements
  while (element && element !== document.body) {
    if (isScrollableElement(element)) {
      // Prioritize certain types of containers
      if (isDocumentViewer(element)) {
        console.log('🔧 Found document viewer for scrolling:', element);
        return element;
      }
      
      // Check if it has meaningful scroll content
      if (hasScrollableContent(element)) {
        console.log('🔧 Found scrollable element:', element);
        return element;
      }
    }
    element = element.parentElement;
  }
  
  // Fallback to document scrolling
  return document.documentElement;
}

function isScrollableElement(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return false;
  }
  
  const style = window.getComputedStyle(element);
  const hasScrollbar = element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
  const canScroll = ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow);
  
  return hasScrollbar && canScroll;
}

function isDocumentViewer(element) {
  // Check for common document viewer characteristics
  const classNames = element.className.toLowerCase();
  const tagName = element.tagName.toLowerCase();
  
  // Common PDF viewer selectors
  const viewerSelectors = [
    'pdf-viewer', 'document-viewer', 'viewer-container', 'pdf-container',
    'embed-responsive', 'doc-viewer', 'preview-container', 'document-frame',
    'pdf-js-viewer', 'pdfjs-viewer', 'adobe-reader', 'foxit-reader'
  ];
  
  // Check if it's an iframe with document content
  if (tagName === 'iframe') {
    const src = element.src.toLowerCase();
    if (src.includes('.pdf') || src.includes('viewer') || src.includes('document')) {
      return true;
    }
  }
  
  // Check for viewer-specific class names
  return viewerSelectors.some(selector => classNames.includes(selector));
}

function hasScrollableContent(element) {
  const scrollableHeight = element.scrollHeight - element.clientHeight;
  const scrollableWidth = element.scrollWidth - element.clientWidth;
  
  // Must have at least 100px of scrollable content to be considered meaningful
  return scrollableHeight > 100 || scrollableWidth > 100;
}

function performSmartScroll(element, key, shiftKey) {
  const scrollAmount = shiftKey ? element.clientHeight : 100; // Larger scroll with Shift
  
  let deltaX = 0, deltaY = 0;
  
  switch (key) {
    case 'ArrowUp':
      deltaY = -scrollAmount / 4;
      break;
    case 'ArrowDown':
      deltaY = scrollAmount / 4;
      break;
    case 'PageUp':
      deltaY = -scrollAmount;
      break;
    case 'PageDown':
    case 'Space':
      deltaY = scrollAmount;
      break;
    case 'Home':
      element.scrollTop = 0;
      return;
    case 'End':
      element.scrollTop = element.scrollHeight;
      return;
  }
  
  // Smooth scroll
  element.scrollBy({
    top: deltaY,
    left: deltaX,
    behavior: 'smooth'
  });
  
  console.log(`🔧 Smart scroll: ${key} on element`, element, `deltaY: ${deltaY}`);
}

// Mouse wheel detection for document viewers
let mouseWheelHandler = null;

function enableMouseWheelScrollDetection() {
  if (mouseWheelHandler) return;
  
  mouseWheelHandler = (e) => {
    if (!isSnipMode || snipMode !== 'scroll') return;
    
    const targetElement = findBestScrollableElement(e.target);
    
    // If we found a specific document viewer, ensure the scroll happens there
    if (targetElement && targetElement !== document.documentElement && targetElement !== document.body) {
      if (isDocumentViewer(targetElement)) {
        // For document viewers, let the event proceed but ensure it targets the right element
        console.log('🔧 Mouse wheel on document viewer:', targetElement);
        
        // Focus the element to ensure it receives scroll events
        if (targetElement.focus) {
          targetElement.focus();
        }
      }
    }
  };
  
  document.addEventListener('wheel', mouseWheelHandler, { passive: true, capture: true });
}

function disableMouseWheelScrollDetection() {
  if (mouseWheelHandler) {
    document.removeEventListener('wheel', mouseWheelHandler);
    mouseWheelHandler = null;
  }
}

// Update cleanup function to disable smart scroll
function cleanupSnipMode() {
  isSnipMode = false;
  snipMode = 'single';
  capturedSnips = [];
  
  // Disable smart scrolling
  disableSmartScrollDetection();
  
  // Remove overlays and UI
  if (snipOverlay) {
    snipOverlay.remove();
    snipOverlay = null;
  }
  
  if (snipControlPanel) {
    snipControlPanel.remove();
    snipControlPanel = null;
  }
  
  if (snipSelection) {
    snipSelection.remove();
    snipSelection = null;
  }
  
  // Clean up scroll overlay modifications
  cleanupScrollOverlay();
  
  console.log('🔧 RunsheetPro Extension: Snip mode cleaned up with smart scroll disabled');
}

// Make the overlay allow scrolling through to underlying elements
function makeOverlayScrollable() {
  if (!snipOverlay) return;
  
  // Add a visual grid to help with selection while keeping transparency
  const gridOverlay = document.createElement('div');
  gridOverlay.id = 'runsheetpro-grid-overlay';
  gridOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background-image: 
      linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px) !important;
    background-size: 50px 50px !important;
    pointer-events: none !important;
    z-index: 2147483644 !important;
    opacity: 0.3 !important;
  `;
  
  document.body.appendChild(gridOverlay);
  
  // Enable scroll passthrough for iframes and document viewers
  document.addEventListener('wheel', handleScrollPassthrough, { passive: false });
  document.addEventListener('keydown', handleKeyScrollPassthrough, true);
}

// Handle scroll events to pass through to underlying elements
function handleScrollPassthrough(e) {
  if (!isSnipMode || snipMode !== 'scroll') return;
  
  // Find the element under the cursor
  const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
  if (!elementUnderCursor) return;
  
  // Find scrollable parent
  const scrollableElement = findBestScrollableElement(elementUnderCursor);
  
  if (scrollableElement && scrollableElement !== document.documentElement && scrollableElement !== document.body) {
    // Temporarily allow pointer events on the scrollable element
    const originalPointerEvents = scrollableElement.style.pointerEvents;
    scrollableElement.style.pointerEvents = 'auto';
    
    // Focus the element for scroll events
    if (scrollableElement.focus && typeof scrollableElement.focus === 'function') {
      try {
        scrollableElement.focus();
      } catch (err) {
        // Ignore focus errors
      }
    }
    
    // Restore pointer events after a short delay
    setTimeout(() => {
      scrollableElement.style.pointerEvents = originalPointerEvents;
    }, 100);
    
    console.log('🔧 Enabling scroll for element:', scrollableElement);
  }
}

// Handle keyboard scroll passthrough
function handleKeyScrollPassthrough(e) {
  if (!isSnipMode || snipMode !== 'scroll') return;
  
  const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];
  if (!scrollKeys.includes(e.key)) return;
  
  // Find focused element or element under cursor
  const focusedElement = document.activeElement;
  const scrollableElement = findBestScrollableElement(focusedElement);
  
  if (scrollableElement && isDocumentViewer(scrollableElement)) {
    // Let the document viewer handle the scroll
    console.log('🔧 Allowing keyboard scroll for document viewer:', scrollableElement);
    // Don't prevent default - let it pass through
    return;
  }
}

// Clean up scroll overlay modifications
function cleanupScrollOverlay() {
  // Remove grid overlay
  const gridOverlay = document.getElementById('runsheetpro-grid-overlay');
  if (gridOverlay) {
    gridOverlay.remove();
  }
  
  // Remove event listeners
  document.removeEventListener('wheel', handleScrollPassthrough);
  document.removeEventListener('keydown', handleKeyScrollPassthrough, true);
}

// Make the overlay allow scrolling through to underlying elements
function makeOverlayScrollable() {
  if (!snipOverlay) return;
  
  // Add a visual grid to help with selection while keeping transparency
  const gridOverlay = document.createElement('div');
  gridOverlay.id = 'runsheetpro-grid-overlay';
  gridOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background-image: 
      linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px) !important;
    background-size: 50px 50px !important;
    pointer-events: none !important;
    z-index: 2147483644 !important;
    opacity: 0.3 !important;
  `;
  
  document.body.appendChild(gridOverlay);
  
  // Enable scroll passthrough for iframes and document viewers
  document.addEventListener('wheel', handleScrollPassthrough, { passive: false });
  document.addEventListener('keydown', handleKeyScrollPassthrough, true);
}

// Handle scroll events to pass through to underlying elements
function handleScrollPassthrough(e) {
  if (!isSnipMode || snipMode !== 'scroll') return;
  
  // Find the element under the cursor
  const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
  if (!elementUnderCursor) return;
  
  // Find scrollable parent
  const scrollableElement = findBestScrollableElement(elementUnderCursor);
  
  if (scrollableElement && scrollableElement !== document.documentElement && scrollableElement !== document.body) {
    // Temporarily allow pointer events on the scrollable element
    const originalPointerEvents = scrollableElement.style.pointerEvents;
    scrollableElement.style.pointerEvents = 'auto';
    
    // Focus the element for scroll events
    if (scrollableElement.focus && typeof scrollableElement.focus === 'function') {
      try {
        scrollableElement.focus();
      } catch (err) {
        // Ignore focus errors
      }
    }
    
    // Restore pointer events after a short delay
    setTimeout(() => {
      scrollableElement.style.pointerEvents = originalPointerEvents;
    }, 100);
    
    console.log('🔧 Enabling scroll for element:', scrollableElement);
  }
}

// Handle keyboard scroll passthrough
function handleKeyScrollPassthrough(e) {
  if (!isSnipMode || snipMode !== 'scroll') return;
  
  const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];
  if (!scrollKeys.includes(e.key)) return;
  
  // Find focused element or element under cursor
  const focusedElement = document.activeElement;
  const scrollableElement = findBestScrollableElement(focusedElement);
  
  if (scrollableElement && isDocumentViewer(scrollableElement)) {
    // Let the document viewer handle the scroll
    console.log('🔧 Allowing keyboard scroll for document viewer:', scrollableElement);
    // Don't prevent default - let it pass through
    return;
  }
}

// Clean up scroll overlay modifications
function cleanupScrollOverlay() {
  // Remove grid overlay
  const gridOverlay = document.getElementById('runsheetpro-grid-overlay');
  if (gridOverlay) {
    gridOverlay.remove();
  }
  
  // Remove event listeners
  document.removeEventListener('wheel', handleScrollPassthrough);
  document.removeEventListener('keydown', handleKeyScrollPassthrough, true);
}