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

// Create the fixed bottom frame
function createRunsheetFrame() {
  if (runsheetFrame) return; // Already exists
  
  console.log('Creating runsheet frame');
  
  // Create main frame container
  runsheetFrame = document.createElement('div');
  runsheetFrame.id = 'docuflow-runsheet-frame';
  runsheetFrame.innerHTML = `
    <div class="frame-header">
      <span class="frame-title">DocuFlow Runsheet</span>
      <div class="frame-controls">
        <button id="capture-btn" class="control-btn">📷 Start Capture</button>
        <button id="sync-btn" class="control-btn">🔄 Sync</button>
        <button id="minimize-btn" class="control-btn">−</button>
      </div>
    </div>
    <div class="frame-content">
      <div class="runsheet-table">
        <div class="table-row header-row">
          <div class="table-cell">Grantor</div>
          <div class="table-cell">Grantee</div>
          <div class="table-cell">Address</div>
          <div class="table-cell">Price</div>
          <div class="table-cell">Notes</div>
        </div>
        <div class="table-row editable-row">
          <div class="table-cell"><input type="text" placeholder="Enter grantor" data-field="grantor"></div>
          <div class="table-cell"><input type="text" placeholder="Enter grantee" data-field="grantee"></div>
          <div class="table-cell"><input type="text" placeholder="Enter address" data-field="address"></div>
          <div class="table-cell"><input type="text" placeholder="Enter price" data-field="price"></div>
          <div class="table-cell"><input type="text" placeholder="Enter notes" data-field="notes"></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(runsheetFrame);
  setupFrameEventListeners();
}

// Setup event listeners for the frame
function setupFrameEventListeners() {
  // Capture button
  const captureBtn = document.getElementById('capture-btn');
  captureBtn.addEventListener('click', toggleCapture);
  
  // Sync button
  const syncBtn = document.getElementById('sync-btn');
  syncBtn.addEventListener('click', syncData);
  
  // Minimize button
  const minimizeBtn = document.getElementById('minimize-btn');
  minimizeBtn.addEventListener('click', toggleMinimize);
  
  // Input field listeners for auto-save
  const inputs = runsheetFrame.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('change', debounce(syncData, 1000));
  });
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
  
  const authenticated = await checkAuth();
  
  if (authenticated) {
    createRunsheetFrame();
  } else {
    console.log('User not authenticated. Frame will not be created.');
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authStatusChanged') {
    if (message.authenticated) {
      isAuthenticated = true;
      currentUser = message.user;
      activeRunsheet = message.runsheet;
      createRunsheetFrame();
    } else {
      isAuthenticated = false;
      currentUser = null;
      if (runsheetFrame) {
        runsheetFrame.remove();
        runsheetFrame = null;
      }
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