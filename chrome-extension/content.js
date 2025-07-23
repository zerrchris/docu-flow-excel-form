// Content script for DocuFlow Runsheet Assistant
console.log('DocuFlow content script loaded on:', window.location.href);

// Configuration
const SUPABASE_URL = 'https://xnpmrafjjqsissbtempj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg';

// Global variables
let isAuthenticated = false;
let currentUser = null;
let activeRunsheet = null;
let runsheetFrame = null;
let captures = [];
let isCapturing = false;

// Check if user is authenticated
async function checkAuth() {
  try {
    const result = await chrome.storage.local.get(['supabase_session']);
    if (result.supabase_session) {
      isAuthenticated = true;
      currentUser = result.supabase_session.user;
      console.log('User authenticated:', currentUser.email);
      return true;
    }
  } catch (error) {
    console.error('Auth check error:', error);
  }
  return false;
}

// Create a floating runsheet button
function createRunsheetButton() {
  if (document.getElementById('docuflow-runsheet-button')) return;
  
  const button = document.createElement('div');
  button.id = 'docuflow-runsheet-button';
  button.innerHTML = `
    <div class="runsheet-btn-content">
      <span>📋</span>
      <span class="btn-text">Runsheet</span>
    </div>
  `;
  
  // Add styles directly to avoid conflicts
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '2147483647',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
    transition: 'all 0.3s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '12px',
    fontWeight: '600'
  });
  
  const content = button.querySelector('.runsheet-btn-content');
  Object.assign(content.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  });
  
  button.addEventListener('click', () => {
    if (!activeRunsheet) {
      showRunsheetSelector();
    } else {
      toggleRunsheetFrame();
    }
  });
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.backgroundColor = '#2563eb';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.backgroundColor = '#3b82f6';
  });
  
  document.body.appendChild(button);
}

// Show runsheet selector dialog
function showRunsheetSelector() {
  const dialog = document.createElement('div');
  dialog.id = 'docuflow-runsheet-selector';
  dialog.innerHTML = `
    <div class="selector-backdrop">
      <div class="selector-modal">
        <div class="selector-header">
          <h3>Select a Runsheet</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="selector-content">
          <p>Choose a runsheet to start working with:</p>
          <div class="runsheet-options">
            <button class="runsheet-option" data-runsheet="default">
              <span class="option-icon">📄</span>
              <span class="option-name">Default Runsheet</span>
            </button>
            <button class="runsheet-option" data-runsheet="property">
              <span class="option-icon">🏠</span>
              <span class="option-name">Property Records</span>
            </button>
            <button class="runsheet-option" data-runsheet="legal">
              <span class="option-icon">⚖️</span>
              <span class="option-name">Legal Documents</span>
            </button>
          </div>
          <div class="selector-actions">
            <button id="load-runsheet-btn" class="primary-btn" disabled>Load Runsheet</button>
            <button id="create-new-btn" class="secondary-btn">Create New</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add styles
  const backdrop = dialog.querySelector('.selector-backdrop');
  Object.assign(backdrop.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2147483648',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  });
  
  const modal = dialog.querySelector('.selector-modal');
  Object.assign(modal.style, {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
  });
  
  // Style all the dialog elements
  const header = dialog.querySelector('.selector-header');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '12px'
  });
  
  const title = dialog.querySelector('h3');
  Object.assign(title.style, {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937'
  });
  
  document.body.appendChild(dialog);
  setupRunsheetSelectorEvents(dialog);
}

// Setup runsheet selector events
function setupRunsheetSelectorEvents(dialog) {
  let selectedRunsheet = null;
  
  // Close button
  dialog.querySelector('.close-btn').addEventListener('click', () => {
    dialog.remove();
  });
  
  // Runsheet options
  dialog.querySelectorAll('.runsheet-option').forEach(option => {
    Object.assign(option.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: 'white',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      marginBottom: '8px',
      width: '100%'
    });
    
    option.addEventListener('click', () => {
      // Remove selection from others
      dialog.querySelectorAll('.runsheet-option').forEach(opt => {
        opt.style.borderColor = '#e5e7eb';
        opt.style.backgroundColor = 'white';
      });
      
      // Select this one
      option.style.borderColor = '#3b82f6';
      option.style.backgroundColor = '#f0f9ff';
      
      selectedRunsheet = option.getAttribute('data-runsheet');
      dialog.querySelector('#load-runsheet-btn').disabled = false;
      dialog.querySelector('#load-runsheet-btn').style.opacity = '1';
    });
  });
  
  // Load runsheet button
  const loadBtn = dialog.querySelector('#load-runsheet-btn');
  Object.assign(loadBtn.style, {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: '600',
    opacity: '0.5'
  });
  
  loadBtn.addEventListener('click', () => {
    if (selectedRunsheet) {
      activeRunsheet = { id: selectedRunsheet, name: selectedRunsheet };
      dialog.remove();
      createRunsheetFrame();
      showNotification('Runsheet loaded successfully!', 'success');
    }
  });
  
  // Create new button
  const createBtn = dialog.querySelector('#create-new-btn');
  Object.assign(createBtn.style, {
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: '600',
    marginLeft: '8px'
  });
}

// Toggle runsheet frame visibility
function toggleRunsheetFrame() {
  if (runsheetFrame) {
    if (runsheetFrame.style.display === 'none') {
      runsheetFrame.style.display = 'block';
    } else {
      runsheetFrame.style.display = 'none';
    }
  } else {
    createRunsheetFrame();
  }
}

// Create the fixed bottom frame
function createRunsheetFrame() {
  if (runsheetFrame) return; // Already exists
  
  console.log('Creating runsheet frame');
  
  // Create main frame container
  runsheetFrame = document.createElement('div');
  runsheetFrame.id = 'docuflow-runsheet-frame';
  runsheetFrame.innerHTML = `
    <div class="frame-header">
      <span class="frame-title">DocuFlow Runsheet - ${activeRunsheet?.name || 'Default'}</span>
      <div class="frame-controls">
        <button id="snip-btn" class="control-btn">✂️ Snip</button>
        <button id="capture-btn" class="control-btn">📷 Capture</button>
        <button id="sync-btn" class="control-btn">🔄 Sync</button>
        <button id="minimize-btn" class="control-btn">−</button>
      </div>
    </div>
    <div class="frame-content">
      <div class="runsheet-table">
        <div class="table-row header-row">
          <div class="table-cell">Inst Number</div>
          <div class="table-cell">Book/Page</div>
          <div class="table-cell">Inst Type</div>
          <div class="table-cell">Recording Date</div>
          <div class="table-cell">Document Date</div>
          <div class="table-cell">Grantor</div>
          <div class="table-cell">Grantee</div>
          <div class="table-cell">Legal Description</div>
          <div class="table-cell">Notes</div>
          <div class="table-cell">Document File Name</div>
        </div>
        <div class="table-row editable-row">
          <div class="table-cell"><input type="text" placeholder="Enter inst number" data-field="inst_number"></div>
          <div class="table-cell"><input type="text" placeholder="Enter book/page" data-field="book_page"></div>
          <div class="table-cell"><input type="text" placeholder="Enter inst type" data-field="inst_type"></div>
          <div class="table-cell"><input type="date" placeholder="Recording date" data-field="recording_date"></div>
          <div class="table-cell"><input type="date" placeholder="Document date" data-field="document_date"></div>
          <div class="table-cell"><input type="text" placeholder="Enter grantor" data-field="grantor"></div>
          <div class="table-cell"><input type="text" placeholder="Enter grantee" data-field="grantee"></div>
          <div class="table-cell"><input type="text" placeholder="Enter legal description" data-field="legal_description"></div>
          <div class="table-cell"><input type="text" placeholder="Enter notes" data-field="notes"></div>
          <div class="table-cell"><input type="text" placeholder="File name" data-field="document_file_name" readonly></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(runsheetFrame);
  setupFrameEventListeners();
}

// Setup event listeners for the frame
function setupFrameEventListeners() {
  // Snip button
  const snipBtn = document.getElementById('snip-btn');
  if (snipBtn) snipBtn.addEventListener('click', startSnipMode);
  
  // Capture button
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) captureBtn.addEventListener('click', toggleCapture);
  
  // Sync button
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) syncBtn.addEventListener('click', syncData);
  
  // Minimize button
  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) minimizeBtn.addEventListener('click', toggleMinimize);
  
  // Input field listeners for auto-save
  const inputs = runsheetFrame.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('change', debounce(syncData, 1000));
  });
}

// Start snip mode for capturing specific areas
function startSnipMode() {
  showNotification('Click and drag to select an area to snip', 'info');
  
  // Create overlay for selection
  const overlay = document.createElement('div');
  overlay.id = 'snip-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    cursor: 'crosshair',
    zIndex: '2147483646'
  });
  
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let selectionBox = null;
  
  overlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
      position: 'fixed',
      border: '2px dashed #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: '2147483647'
    });
    document.body.appendChild(selectionBox);
  });
  
  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selectionBox) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    Object.assign(selectionBox.style, {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px'
    });
  });
  
  overlay.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    
    const endX = e.clientX;
    const endY = e.clientY;
    
    // Calculate selection area
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    if (width > 10 && height > 10) {
      captureSelectedArea(left, top, width, height);
    }
    
    // Cleanup
    overlay.remove();
    if (selectionBox) selectionBox.remove();
    isSelecting = false;
  });
  
  // ESC to cancel
  const cancelSnip = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      if (selectionBox) selectionBox.remove();
      document.removeEventListener('keydown', cancelSnip);
      showNotification('Snip cancelled', 'info');
    }
  };
  
  document.addEventListener('keydown', cancelSnip);
  document.body.appendChild(overlay);
}

// Capture selected area
async function captureSelectedArea(left, top, width, height) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
    
    if (response && response.dataUrl) {
      // Create a canvas to crop the image
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
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
        
        console.log('Snipped area captured:', croppedDataUrl.substring(0, 50) + '...');
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
    captureBtn.textContent = '📷 Start Capture';
    captureBtn.classList.remove('capturing');
    
    if (captures.length > 0) {
      processCapturedImages();
    }
  } else {
    // Start capturing
    isCapturing = true;
    captures = [];
    captureBtn.textContent = '🛑 Stop Capture';
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
      console.log(`Captured image ${captures.length}`);
    }
    
    if (isCapturing) {
      setTimeout(startCaptureLoop, 2000); // Capture every 2 seconds
    }
  });
}

// Process captured images
async function processCapturedImages() {
  if (captures.length === 0) return;
  
  console.log(`Processing ${captures.length} captured images`);
  // For now, just use the last capture
  // In a full implementation, you'd merge all captures into one image
  const latestCapture = captures[captures.length - 1];
  
  // Here you would upload to Supabase storage and link to runsheet
  console.log('Would upload capture to Supabase:', latestCapture.substring(0, 50) + '...');
}

// Sync data with Supabase
async function syncData() {
  if (!isAuthenticated) {
    console.log('Not authenticated, skipping sync');
    return;
  }
  
  const inputs = runsheetFrame.querySelectorAll('input');
  const rowData = {};
  
  inputs.forEach(input => {
    const field = input.getAttribute('data-field');
    if (field && input.value.trim()) {
      rowData[field] = input.value.trim();
    }
  });
  
  if (Object.keys(rowData).length === 0) {
    console.log('No data to sync');
    return;
  }
  
  console.log('Syncing data:', rowData);
  
  try {
    // Call the extension-sync edge function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/extension-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        runsheet_id: activeRunsheet?.id || 'default',
        row_data: rowData,
        user_id: currentUser?.id
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Data synced successfully');
      showNotification('Data synced!', 'success');
    } else {
      console.error('Sync failed:', result.error);
      showNotification('Sync failed', 'error');
    }
  } catch (error) {
    console.error('Sync error:', error);
    showNotification('Sync error', 'error');
  }
}

// Toggle minimize state
function toggleMinimize() {
  const frameContent = runsheetFrame.querySelector('.frame-content');
  const minimizeBtn = document.getElementById('minimize-btn');
  
  if (frameContent.style.display === 'none') {
    frameContent.style.display = 'block';
    minimizeBtn.textContent = '−';
  } else {
    frameContent.style.display = 'none';
    minimizeBtn.textContent = '+';
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `docuflow-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Debounce function
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
  console.log('Initializing DocuFlow extension');
  
  // Skip on chrome:// pages and extension pages
  if (window.location.href.startsWith('chrome://') || 
      window.location.href.startsWith('chrome-extension://')) {
    return;
  }
  
  // Always show the runsheet button
  createRunsheetButton();
  
  // Check if extension is enabled
  const result = await chrome.storage.local.get(['extensionEnabled']);
  if (result.extensionEnabled === false) {
    console.log('Extension is disabled');
    return;
  }
  
  console.log('Extension initialized successfully');
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    const button = document.getElementById('docuflow-runsheet-button');
    if (message.enabled) {
      if (button) button.style.display = 'flex';
    } else {
      if (button) button.style.display = 'none';
      if (runsheetFrame) {
        runsheetFrame.remove();
        runsheetFrame = null;
      }
    }
    sendResponse({ success: true });
  }
  
  if (message.action === 'authStatusChanged') {
    if (message.authenticated) {
      isAuthenticated = true;
      currentUser = message.user;
      activeRunsheet = message.runsheet;
    } else {
      isAuthenticated = false;
      currentUser = null;
      activeRunsheet = null;
    }
    sendResponse({ success: true });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}