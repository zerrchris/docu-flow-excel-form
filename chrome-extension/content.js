// DocuFlow Runsheet Assistant - Content Script

console.log('🔧 DocuFlow Extension: Content script loading started');
console.log('🔧 DocuFlow Extension: Document ready state:', document.readyState);

// Global variables
let runsheetButton = null;
let runsheetFrame = null;
let activeRunsheet = null;
let captures = [];
let isCapturing = false;
let userSession = null;
let currentViewMode = 'single'; // 'single' or 'full'

// Snip mode variables
let isSnipMode = false;
let snipOverlay = null;
let snipSelection = null;
let capturedSnips = [];
let snipControlPanel = null;

// Check authentication status
async function checkAuth() {
  try {
    const authData = await chrome.storage.local.get(['supabase_session']);
    if (authData.supabase_session && authData.supabase_session.access_token) {
      userSession = authData.supabase_session;
      console.log('🔧 DocuFlow Extension: User authenticated');
      return true;
    }
    console.log('🔧 DocuFlow Extension: No authentication found');
    return false;
  } catch (error) {
    console.error('Auth check failed:', error);
    return false;
  }
}

// Create the floating runsheet button
function createRunsheetButton() {
  if (runsheetButton) return; // Already exists
  
  console.log('🔧 DocuFlow Extension: Creating runsheet button');
  
  runsheetButton = document.createElement('div');
  runsheetButton.id = 'docuflow-runsheet-button';
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
  runsheetButton.innerHTML = '📋';
  runsheetButton.title = 'DocuFlow Runsheet Assistant';
  
  // Hover effects
  runsheetButton.addEventListener('mouseenter', () => {
    runsheetButton.style.transform = 'scale(1.1)';
    runsheetButton.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
  });
  
  runsheetButton.addEventListener('mouseleave', () => {
    runsheetButton.style.transform = 'scale(1)';
    runsheetButton.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
  });
  
  // Click handler
  runsheetButton.addEventListener('click', async () => {
    if (runsheetFrame && runsheetFrame.style.display !== 'none') {
      toggleRunsheetFrame();
    } else {
      const isAuthenticated = await checkAuth();
      if (isAuthenticated) {
        showRunsheetSelector();
      } else {
        showSignInPopup();
}

// Show sign-in popup
function showSignInPopup() {
  console.log('🔧 DocuFlow Extension: Showing sign-in popup');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'docuflow-signin-popup';
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
      <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Sign In to DocuFlow</h3>
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
    }
  });
  
  document.body.appendChild(runsheetButton);
}

// Show quick create dialog
function showQuickCreateDialog() {
  console.log('🔧 DocuFlow Extension: Showing quick create dialog');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'docuflow-quick-create';
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
        ⚡ <strong>Quick Create</strong> sets up a runsheet with standard real estate columns.<br>
        For custom columns and advanced settings, create a new runsheet in the main app.
      </p>
    </div>
    <form id="quick-create-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;">Runsheet Name</label>
        <input type="text" id="runsheet-name" required placeholder="e.g., Property Research - January 2025" style="width: 100%; padding: 8px 12px; border: 1px solid hsl(var(--border, 214 32% 91%)); border-radius: 6px; font-size: 14px;">
      </div>
      <div style="font-size: 12px; color: hsl(var(--muted-foreground, 215 16% 47%));">
        <strong>Default columns included:</strong><br>
        Inst Number, Book/Page, Inst Type, Recording Date, Document Date, Grantor, Grantee, Legal Description, Notes, Document File Name
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
        closeQuickCreate();
        showNotification(`Created runsheet: ${name}`, 'success');
        
        // Load the new runsheet immediately
        setTimeout(() => loadRunsheet(data.runsheet), 500);
        
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
  console.log('🔧 DocuFlow Extension: Showing runsheet selector');
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = 'docuflow-runsheet-selector';
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
  
  console.log('🔧 DocuFlow Extension: Adding row to sheet');
  
  // Gather data from input fields and textareas
  const inputs = document.querySelectorAll('#docuflow-runsheet-frame input, #docuflow-runsheet-frame textarea');
  const rowData = {};
  let hasData = false;
  
  inputs.forEach(input => {
    if (input.dataset.column && input.value.trim()) {
      rowData[input.dataset.column] = input.value.trim();
      hasData = true;
    }
  });
  
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
        return runsheet.columns.every(col => !row[col] || row[col].trim() === '');
      });
      
      if (nextRowIndex === -1) {
        nextRowIndex = runsheet.data.length; // Add to end
      }
    }
    
    // Add the row data using extension-sync endpoint
    const syncResponse = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/add-row-to-runsheet', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet.id,
        row_data: rowData,
        row_index: nextRowIndex
      })
    });
    
    const result = await syncResponse.json();
    
    if (result.success) {
      showNotification(`Row ${nextRowIndex + 1} added successfully!`, 'success');
      
      // Clear all input fields and textareas for next entry
      inputs.forEach(input => {
        input.value = '';
        // Auto-resize textareas after clearing
        if (input.tagName === 'TEXTAREA') {
          input.style.height = 'auto';
          input.style.height = Math.max(32, input.scrollHeight) + 'px';
        }
      });
      
      // Focus back to first input or textarea for quick data entry
      const firstInput = document.querySelector('#docuflow-runsheet-frame input, #docuflow-runsheet-frame textarea');
      if (firstInput) {
        firstInput.focus();
      }
      
      console.log('🔧 DocuFlow Extension: Row added successfully to index:', nextRowIndex);
    } else {
      throw new Error(result.error || 'Failed to add row');
    }
  } catch (error) {
    console.error('Add row error:', error);
    showNotification('Failed to add row to sheet', 'error');
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
  console.log('🔧 DocuFlow Extension: Loading runsheet:', runsheet.name);
  
  activeRunsheet = runsheet;
  
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
  
  showNotification(`Loaded runsheet: ${runsheet.name}`, 'success');
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
  
  console.log('🔧 DocuFlow Extension: Creating runsheet frame');
  
  // Create main frame container
  runsheetFrame = document.createElement('div');
  runsheetFrame.id = 'docuflow-runsheet-frame';
  
  // Restore saved height or use default
  const savedHeight = localStorage.getItem('docuflow-frame-height') || '200';
  runsheetFrame.style.height = `${savedHeight}px`;
  document.body.style.paddingBottom = `${savedHeight}px`;
  
  // Create resize handle at the top
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'frame-resize-handle';
  resizeHandle.style.cssText = `
    height: 4px !important;
    background: hsl(var(--border)) !important;
    cursor: ns-resize !important;
    position: relative !important;
    opacity: 0.7 !important;
    transition: all 0.2s ease !important;
    z-index: 1 !important;
  `;
  
  // Add resize functionality
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    console.log('Resize handle mousedown');
    isResizing = true;
    startY = e.clientY;
    startHeight = parseInt(window.getComputedStyle(runsheetFrame).height);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  const handleMouseMove = (e) => {
    if (!isResizing) return;
    
    console.log('Resizing frame');
    const deltaY = startY - e.clientY;
    const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
    
    runsheetFrame.style.height = `${newHeight}px`;
    document.body.style.paddingBottom = `${newHeight}px`;
    
    // Save preferred height
    localStorage.setItem('docuflow-frame-height', newHeight.toString());
  };
  
  const handleMouseUp = () => {
    if (isResizing) {
      console.log('Resize complete');
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
    <span class="frame-title">DocuFlow Runsheet - ${activeRunsheet?.name || 'Default'}</span>
    <div class="frame-controls">
      <button id="view-mode-btn" class="control-btn">${currentViewMode === 'single' ? '📋 Full View' : '📝 Single Entry'}</button>
      <button id="snip-btn" class="control-btn">✂️ Snip</button>
      <button id="capture-btn" class="control-btn">📷 Capture</button>
      <button id="sync-btn" class="control-btn">🔄 Sync</button>
      <button id="minimize-btn" class="control-btn">−</button>
    </div>
  `;
  
  // Create content area
  const content = document.createElement('div');
  content.className = 'frame-content';
  
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
  
  runsheetFrame.appendChild(resizeHandle);
  runsheetFrame.appendChild(header);
  runsheetFrame.appendChild(content);
  
  setupFrameEventListeners();
}

// Create single entry view (original functionality)
function createSingleEntryView(content) {
  // Create dynamic table based on runsheet data
  const table = document.createElement('div');
  table.className = 'runsheet-table';
  
  // Get runsheet data or use defaults
  const runsheetData = activeRunsheet || {
    columns: ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name'],
    data: [{}]
  };
  
  // Create header row with resizable columns
  const headerRow = document.createElement('div');
  headerRow.className = 'table-row header-row';
  headerRow.style.cssText = `
    height: 18px !important;
    min-height: 18px !important;
    max-height: 18px !important;
  `;
  
  runsheetData.columns.forEach((column, index) => {
    const cell = document.createElement('div');
    cell.className = 'table-cell';
    cell.style.width = `${120}px`; // Default width
    cell.style.minWidth = `${120}px`;
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
      
      // Screenshot button
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
      
      // Function to switch between upload and document modes
      const switchToDocumentMode = (filename) => {
        uploadInterface.style.display = 'none';
        documentInterface.style.display = 'flex';
        filenameText.textContent = filename;
        headerContent.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
      };
      
      const switchToUploadMode = () => {
        uploadInterface.style.display = 'flex';
        documentInterface.style.display = 'none';
        headerContent.style.border = '1px dashed hsl(var(--border, 214 32% 91%))';
      };
      
      // Check if there's already a document linked on page load
      const checkExistingDocument = () => {
        const documentInput = document.querySelector('.editable-row input[data-column="Document File Name"]');
        if (documentInput && documentInput.value && documentInput.value.trim() !== '') {
          switchToDocumentMode(documentInput.value);
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
        startSnipMode();
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
        align-items: center !important;
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
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(cell).width, 10);
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const width = Math.max(80, startWidth + e.clientX - startX);
      
      // Update all cells in this column
      const allCells = document.querySelectorAll(`#docuflow-runsheet-frame .table-cell:nth-child(${index + 1})`);
      allCells.forEach(c => {
        c.style.width = `${width}px`;
        c.style.minWidth = `${width}px`;
      });
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
      }
    });
    
    cell.appendChild(resizeHandle);
    headerRow.appendChild(cell);
  });
  
  table.appendChild(headerRow);
  
  // Create editable data row (show first row of data)
  const dataRow = document.createElement('div');
  dataRow.className = 'table-row editable-row';
  dataRow.dataset.rowIndex = 0;
  
  runsheetData.columns.forEach((column, colIndex) => {
    const cell = document.createElement('div');
    cell.className = 'table-cell';
    cell.style.width = `${120}px`; // Match header width
    cell.style.minWidth = `${120}px`;
    cell.style.position = 'relative';
    
    // Create textarea instead of input for multi-line support (except for Document File Name)
    if (column === 'Document File Name') {
      // Document File Name column gets no visible input in data row, just the add row button
      // Create hidden input to store the filename value but don't display it
      const input = document.createElement('input');
      input.type = 'hidden';
      input.value = runsheetData.data[0]?.[column] || '';
      input.dataset.field = column.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
      input.dataset.column = column;
      
      cell.appendChild(input);
    } else {
      // Other columns use textarea for multi-line support
      const textarea = document.createElement('textarea');
      textarea.value = runsheetData.data[0]?.[column] || '';
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
        } else if (e.key === 'Tab') {
          // Tab moves to next field
          e.preventDefault();
          const currentIndex = Array.from(dataRow.children).indexOf(cell);
          if (currentIndex < dataRow.children.length - 1) {
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
          } else {
            // If this is the last cell, focus the add row button in the Document File Name cell
            const documentCell = dataRow.querySelector('[data-column="Document File Name"]')?.closest('.table-cell');
            const addButton = documentCell?.querySelector('.add-row-btn');
            if (addButton) {
              addButton.focus();
            }
          }
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
        }
      });
      
      cell.appendChild(textarea);
    }
    
    // Document File Name special handling - Create full-width Add Row button only
    if (column === 'Document File Name') {
      // Create main button container that spans full cell width
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex !important;
        width: 100% !important;
        padding: 4px !important;
        box-sizing: border-box !important;
      `;
      
      // Full-width Add Row button
      const addRowBtn = document.createElement('button');
      addRowBtn.className = 'add-row-btn';
      addRowBtn.textContent = 'Add Row';
      addRowBtn.style.cssText = `
        background: hsl(var(--primary, 215 80% 40%)) !important;
        color: hsl(var(--primary-foreground, 210 40% 98%)) !important;
        border: 1px solid hsl(var(--primary, 215 80% 40%)) !important;
        border-radius: 4px !important;
        padding: 8px 12px !important;
        font-size: 12px !important;
        cursor: pointer !important;
        width: 100% !important;
        font-weight: 500 !important;
        transition: all 0.2s ease !important;
      `;
      addRowBtn.tabIndex = 0; // Can be tabbed to
      addRowBtn.title = 'Add this row data to the sheet';
      
      // Event handler
      addRowBtn.addEventListener('click', () => {
        addRowToSheet();
      });
      
      addRowBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addRowToSheet();
        } else if (e.key === 'Tab' && e.shiftKey) {
          // Shift+Tab moves back to the last textarea field (since Document File Name input is hidden)
          e.preventDefault();
          const lastTextareaCell = Array.from(dataRow.children).reverse().find(cell => 
            cell.querySelector('textarea') && !cell.querySelector('[data-column="Document File Name"]')
          );
          const lastTextarea = lastTextareaCell?.querySelector('textarea');
          if (lastTextarea) {
            lastTextarea.focus();
          }
        } else if (e.key === 'Tab' && !e.shiftKey) {
          // Tab moves to first field in next row or wraps to first field
          e.preventDefault();
          const firstCell = dataRow.children[0];
          const firstTextarea = firstCell.querySelector('textarea');
          const firstInput = firstCell.querySelector('input');
          if (firstTextarea) {
            firstTextarea.focus();
          } else if (firstInput) {
            firstInput.focus();
          }
        }
      });
      
      buttonContainer.appendChild(addRowBtn);
      
      cell.appendChild(buttonContainer);
    }
    
    dataRow.appendChild(cell);
  });
  
  table.appendChild(dataRow);
  content.appendChild(table);
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

  // Create table for full view
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100% !important;
    border-collapse: collapse !important;
    font-size: 11px !important;
    font-family: inherit !important;
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
      max-width: 200px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      height: auto !important;
      line-height: 1.2 !important;
    `;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body with data
  const tbody = document.createElement('tbody');
  
  // If no data exists, show placeholder
  const dataRows = runsheetData.data && runsheetData.data.length > 0 ? runsheetData.data : [{}];
  
  dataRows.forEach((rowData, rowIndex) => {
    const row = document.createElement('tr');
    row.style.cssText = `
      border-bottom: 1px solid hsl(var(--border, 214 32% 91%)) !important;
      hover:background: hsl(var(--muted, 210 40% 96%) / 0.5) !important;
    `;

    runsheetData.columns.forEach(column => {
      const td = document.createElement('td');
      td.style.cssText = `
        padding: 6px 4px !important;
        border-right: 1px solid hsl(var(--border, 214 32% 91%)) !important;
        max-width: 200px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-wrap: break-word !important;
        vertical-align: top !important;
      `;
      
      const cellValue = rowData[column] || '';
      td.textContent = cellValue;
      td.title = cellValue; // Show full text on hover
      
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  // Add controls for full view
  const controls = document.createElement('div');
  controls.style.cssText = `
    margin-top: 8px !important;
    display: flex !important;
    gap: 8px !important;
    justify-content: center !important;
  `;

  const addRowBtn = document.createElement('button');
  addRowBtn.textContent = '+ Add New Row';
  addRowBtn.style.cssText = `
    padding: 6px 12px !important;
    background: hsl(var(--primary, 215 80% 40%)) !important;
    color: hsl(var(--primary-foreground, 210 40% 98%)) !important;
    border: none !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  `;
  
  addRowBtn.addEventListener('click', () => {
    // Switch to single entry mode for adding new row
    switchViewMode('single');
  });

  controls.appendChild(addRowBtn);

  fullViewContainer.appendChild(table);
  fullViewContainer.appendChild(controls);
  content.appendChild(fullViewContainer);
}

// Switch between view modes
function switchViewMode(newMode) {
  if (newMode === currentViewMode) return;
  
  currentViewMode = newMode;
  chrome.storage.local.set({ viewMode: newMode });
  
  // Recreate the frame content
  if (runsheetFrame) {
    const content = runsheetFrame.querySelector('.frame-content');
    if (content) {
      content.innerHTML = '';
      if (currentViewMode === 'full') {
        createFullRunsheetView(content);
      } else {
        createSingleEntryView(content);
      }
    }
    updateViewModeButton();
  }
}

// Update the view mode button text
function updateViewModeButton() {
  const viewModeBtn = document.getElementById('view-mode-btn');
  if (viewModeBtn) {
    viewModeBtn.textContent = currentViewMode === 'single' ? '📋 Full View' : '📝 Single Entry';
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
  
  // View mode button
  const viewModeBtn = document.getElementById('view-mode-btn');
  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
      const newMode = currentViewMode === 'single' ? 'full' : 'single';
      switchViewMode(newMode);
    });
  }
  
  // Snip button
  const snipBtn = document.getElementById('snip-btn');
  if (snipBtn) {
    snipBtn.addEventListener('click', startSnipMode);
  }
  
  // Capture button
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('click', toggleCapture);
  }
  
  // Sync button
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', syncData);
  }
  
  // Minimize button
  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', toggleMinimize);
  }
}

// Start snip mode (select area to capture)
function startSnipMode() {
  console.log('🔧 DocuFlow Extension: Starting snip mode');
  
  // Create overlay for area selection
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.3) !important;
    cursor: crosshair !important;
    z-index: 2147483647 !important;
  `;
  
  let startX, startY, endX, endY;
  let isSelecting = false;
  let selectionBox = null;
  
  overlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Create selection box
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
      position: fixed !important;
      border: 2px dashed #fff !important;
      background: rgba(255, 255, 255, 0.1) !important;
      z-index: 2147483648 !important;
      pointer-events: none !important;
    `;
    document.body.appendChild(selectionBox);
  });
  
  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selectionBox) return;
    
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
  
  overlay.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    
    endX = e.clientX;
    endY = e.clientY;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    // Clean up
    document.body.removeChild(overlay);
    if (selectionBox) {
      document.body.removeChild(selectionBox);
    }
    
    // Capture the selected area
    if (width > 10 && height > 10) {
      captureSelectedArea(left, top, width, height);
    }
  });
  
  // Add escape key to cancel
  const cancelSnip = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay);
      if (selectionBox) {
        document.body.removeChild(selectionBox);
      }
      document.removeEventListener('keydown', cancelSnip);
    }
  };
  document.addEventListener('keydown', cancelSnip);
  
  document.body.appendChild(overlay);
  showNotification('Select an area to capture', 'info');
}

// Capture selected area
async function captureSelectedArea(left, top, width, height) {
  console.log('🔧 DocuFlow Extension: Capturing area:', { left, top, width, height });
  
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
        
        console.log('🔧 DocuFlow Extension: Snipped area captured');
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
      console.log(`🔧 DocuFlow Extension: Captured image ${captures.length}`);
    }
    
    if (isCapturing) {
      setTimeout(startCaptureLoop, 2000); // Capture every 2 seconds
    }
  });
}

// Process captured images
async function processCapturedImages() {
  if (captures.length === 0) return;
  
  console.log(`🔧 DocuFlow Extension: Processing ${captures.length} captured images`);
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
  
  console.log('🔧 DocuFlow Extension: Syncing data');
  
  // Gather data from input fields and textareas
  const inputs = document.querySelectorAll('#docuflow-runsheet-frame input, #docuflow-runsheet-frame textarea');
  const rowData = {};
  
  inputs.forEach(input => {
    if (input.dataset.column && input.value.trim()) {
      rowData[input.dataset.column] = input.value.trim();
    }
  });
  
  if (Object.keys(rowData).length === 0) {
    console.log('🔧 DocuFlow Extension: No data to sync');
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
      console.log('🔧 DocuFlow Extension: Data synced successfully');
    } else {
      throw new Error(result.error || 'Sync failed');
    }
  } catch (error) {
    console.error('Sync error:', error);
    showNotification('Failed to sync data', 'error');
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
  notification.className = `docuflow-notification ${type}`;
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

// Initialize the extension
async function init() {
  // Check if extension is disabled
  const settings = await chrome.storage.local.get(['extension_disabled']);
  if (settings.extension_disabled) {
    console.log('🔧 DocuFlow Extension: Extension is disabled');
    return;
  }
  
  console.log('🔧 DocuFlow Extension: Initializing');
  
  // Check authentication
  const isAuthenticated = await checkAuth();
  
  // Create the runsheet button
  createRunsheetButton();
  
  // Check if there's an active runsheet to restore
  const storedData = await chrome.storage.local.get(['active_runsheet']);
  if (storedData.active_runsheet && isAuthenticated) {
    console.log('🔧 DocuFlow Extension: Restoring active runsheet:', storedData.active_runsheet.name);
    
    // Restore the active runsheet
    activeRunsheet = storedData.active_runsheet;
    
    // Create and show the frame with the restored runsheet
    createRunsheetFrame();
    if (runsheetFrame) {
      runsheetFrame.style.display = 'block';
      document.body.appendChild(runsheetFrame);
      setupFrameEventListeners();
    }
    
    showNotification(`Restored runsheet: ${activeRunsheet.name}`, 'success');
  }
  
  console.log('🔧 DocuFlow Extension: Initialized successfully');
}

// =============================================================================
// SNIP FUNCTIONALITY
// =============================================================================

// Start snip mode
function startSnipMode() {
  if (isSnipMode) return;
  
  console.log('🔧 DocuFlow Extension: Starting snip mode');
  isSnipMode = true;
  capturedSnips = [];
  
  createSnipOverlay();
  createSnipControlPanel();
  showNotification('Snip mode active! Drag to select areas to capture.', 'info');
}

// Create snip overlay for selection
function createSnipOverlay() {
  if (snipOverlay) return;
  
  snipOverlay = document.createElement('div');
  snipOverlay.id = 'docuflow-snip-overlay';
  snipOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483645 !important;
    cursor: crosshair !important;
    user-select: none !important;
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
    
    if (width < 10 || height < 10) {
      showNotification('Selection too small, please try again', 'error');
      return;
    }
    
    // Hide overlay temporarily for clean capture
    snipOverlay.style.display = 'none';
    snipControlPanel.style.display = 'none';
    
    // Wait a bit for UI to hide
    setTimeout(async () => {
      await captureSelectedArea(left, top, width, height);
      
      // Show overlay and controls again
      snipOverlay.style.display = 'block';
      snipControlPanel.style.display = 'flex';
    }, 100);
  });
  
  document.body.appendChild(snipOverlay);
}

// Create snip control panel
function createSnipControlPanel() {
  if (snipControlPanel) return;
  
  snipControlPanel = document.createElement('div');
  snipControlPanel.id = 'docuflow-snip-controls';
  snipControlPanel.style.cssText = `
    position: fixed !important;
    top: 20px !important;
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
  doneButton.textContent = 'Done Snipping';
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
  
  snipControlPanel.appendChild(counter);
  snipControlPanel.appendChild(doneButton);
  snipControlPanel.appendChild(cancelButton);
  
  document.body.appendChild(snipControlPanel);
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
      canvas.toBlob((blob) => {
        if (blob) {
          capturedSnips.push({
            blob: blob,
            timestamp: Date.now(),
            width: width,
            height: height
          });
          
          // Hide snip mode temporarily to allow navigation
          hideSnipModeForNavigation();
          showNotification(`Snip ${capturedSnips.length} captured! Navigate to next section if needed.`, 'success');
        } else {
          showNotification('Failed to capture snip', 'error');
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
  const counter = document.getElementById('snip-counter');
  if (counter) {
    counter.textContent = `Snips captured: ${capturedSnips.length}`;
  }
}

// Finish snipping process
async function finishSnipping() {
  if (capturedSnips.length === 0) {
    showNotification('No snips captured', 'error');
    return;
  }
  
  try {
    showNotification('Processing snips...', 'info');
    
    // Combine snips vertically
    const combinedBlob = await combineSnipsVertically(capturedSnips);
    
    // Upload to Supabase Storage
    const uploadResult = await uploadSnipToStorage(combinedBlob);
    
    // Link to current runsheet row
    await linkSnipToRunsheet(uploadResult.url);
    
    showNotification('Snips combined and linked successfully!', 'success');
    
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
  if (snipOverlay) {
    snipOverlay.style.display = 'none';
  }
  
  if (snipControlPanel) {
    snipControlPanel.remove();
    snipControlPanel = null;
  }
  
  // Create navigation control panel
  createNavigationControlPanel();
}

// Create navigation control panel with snip again option
function createNavigationControlPanel() {
  const navPanel = document.createElement('div');
  navPanel.id = 'docuflow-nav-controls';
  navPanel.style.cssText = `
    position: fixed !important;
    top: 20px !important;
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
  snipAgainButton.textContent = 'Snip Again';
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
    navPanel.remove();
    resumeSnipMode();
  });
  
  // Done button
  const doneButton = document.createElement('button');
  doneButton.textContent = 'Done Snipping';
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
}

// Resume snip mode after navigation
function resumeSnipMode() {
  if (snipOverlay) {
    snipOverlay.style.display = 'block';
  } else {
    createSnipOverlay();
  }
  
  createSnipControlPanel();
  showNotification('Snip mode resumed! Drag to select another area.', 'info');
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
  const navPanel = document.getElementById('docuflow-nav-controls');
  if (navPanel) {
    navPanel.remove();
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

// Upload snip to Supabase Storage
async function uploadSnipToStorage(blob) {
  try {
    if (!userSession) {
      throw new Error('User not authenticated');
    }
    
    // Create form data
    const formData = new FormData();
    const filename = `snip-${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    
    formData.append('file', file);
    
    // Upload to Supabase Storage
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/documents/' + userSession.user.id + '/snips/' + filename, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userSession.access_token}`,
        'x-upsert': 'true'
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload snip to storage');
    }
    
    // Get public URL
    const publicUrl = `https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/public/documents/${userSession.user.id}/snips/${filename}`;
    
    return {
      url: publicUrl,
      filename: filename
    };
    
  } catch (error) {
    console.error('Error uploading snip:', error);
    throw error;
  }
}

// Link snip to current runsheet row
async function linkSnipToRunsheet(snipUrl) {
  try {
    if (!activeRunsheet || !activeRunsheet.id) {
      throw new Error('No active runsheet found');
    }
    
    // Get current row being worked on (usually the first row with empty data)
    const runsheetData = activeRunsheet.data || [];
    let targetRowIndex = 0;
    
    // Find the first row that doesn't have a screenshot_url already
    for (let i = 0; i < runsheetData.length; i++) {
      if (!runsheetData[i].screenshot_url) {
        targetRowIndex = i;
        break;
      }
    }
    
    // Update the row with screenshot URL
    if (!runsheetData[targetRowIndex]) {
      runsheetData[targetRowIndex] = {};
    }
    runsheetData[targetRowIndex].screenshot_url = snipUrl;
    
    // Update the runsheet in Supabase
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/rest/v1/runsheets?id=eq.' + activeRunsheet.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userSession.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
      },
      body: JSON.stringify({
        data: runsheetData
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update runsheet with snip URL');
    }
    
    // Update local activeRunsheet
    activeRunsheet.data = runsheetData;
    
    // Update the Document File Name field in the UI
    const filename = `captured_snip_${Date.now()}.png`;
    const input = document.querySelector(`input[data-column="Document File Name"]`);
    if (input) {
      input.value = filename;
      
      // Trigger the header switch to document mode
      const headerContainer = document.querySelector('.document-header-container');
      if (headerContainer) {
        const uploadInterface = headerContainer.querySelector('.upload-interface');
        const documentInterface = headerContainer.querySelector('.document-interface');
        const filenameText = headerContainer.querySelector('.filename-text');
        
        if (uploadInterface && documentInterface && filenameText) {
          uploadInterface.style.display = 'none';
          documentInterface.style.display = 'flex';
          filenameText.textContent = filename;
          headerContainer.style.border = '1px solid hsl(var(--border, 214 32% 91%))';
        }
      }
      
      // Create a file object for the brain button functionality
      const file = new File([new Blob()], filename, { type: 'image/png' });
      window.currentAnalysisFile = file;
      window.currentAnalysisFileName = filename;
    }
    
    // Refresh the UI if visible
    if (runsheetFrame && runsheetFrame.style.display !== 'none') {
      updateRunsheetDisplay();
    }
    
  } catch (error) {
    console.error('Error linking snip to runsheet:', error);
    throw error;
  }
}

// Listen for messages from other extension parts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('🔧 DocuFlow Extension: Received message:', request);
  
  if (request.action === 'toggle') {
    if (runsheetButton) {
      runsheetButton.style.display = runsheetButton.style.display === 'none' ? 'block' : 'none';
    }
  } else if (request.action === 'toggleExtension') {
    // Handle extension enable/disable from popup
    if (request.enabled) {
      if (runsheetButton) runsheetButton.style.display = 'block';
    } else {
      if (runsheetButton) runsheetButton.style.display = 'none';
      if (runsheetFrame) runsheetFrame.style.display = 'none';
    }
  } else if (request.action === 'switchViewMode') {
    // Handle view mode switching from popup
    switchViewMode(request.viewMode);
    showNotification(`Switched to ${request.viewMode === 'single' ? 'single entry' : 'full view'} mode`, 'info');
  } else if (request.action === 'startSnipMode') {
    // Handle snip mode start from popup
    startSnipMode();
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

// Initialize when page loads
try {
  console.log('🔧 DocuFlow Extension: Initializing...');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
} catch (error) {
  console.error('🔧 DocuFlow Extension: Initialization error:', error);
}