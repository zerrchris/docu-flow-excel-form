// Safari Web Extension Popup Script
// Cross-browser compatible popup functionality

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', loadPopupData);

// Load and display popup data
async function loadPopupData() {
  try {
    const storage = await browser.storage.local.get([
      'currentRunsheet',
      'captures', 
      'textEntries', 
      'savedRows',
      'authToken'
    ]);
    
    // Update current runsheet display
    const runsheetElement = document.getElementById('current-runsheet');
    runsheetElement.textContent = storage.currentRunsheet ? 
      (storage.currentRunsheet.name || 'Unnamed Runsheet') : 'None';
    
    // Update quick stats
    document.getElementById('capture-count').textContent = (storage.captures || []).length;
    document.getElementById('text-count').textContent = (storage.textEntries || []).length;
    document.getElementById('saved-count').textContent = (storage.savedRows || []).length;
    
    // Update auth status
    const authSection = document.getElementById('auth-section');
    if (storage.authToken) {
      authSection.className = 'auth-section authenticated';
      authSection.innerHTML = '✅ Connected to DocuFlow account';
    } else {
      authSection.className = 'auth-section not-authenticated';
      authSection.innerHTML = '⚠️ Please authenticate with your DocuFlow account to sync data';
    }
    
    // Setup event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error('Failed to load popup data:', error);
  }
}

// Setup event listeners for popup buttons
function setupEventListeners() {
  // Toggle panel in active tab
  document.getElementById('toggle-panel')?.addEventListener('click', async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'showPanel' });
        window.close(); // Close popup after action
      }
    } catch (error) {
      console.error('Failed to toggle panel:', error);
    }
  });

  // Open web application
  document.getElementById('open-webapp')?.addEventListener('click', () => {
    browser.tabs.create({ 
      url: 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com' 
    });
    window.close();
  });

  // Sync data with web app
  document.getElementById('sync-data')?.addEventListener('click', async () => {
    const syncButton = document.getElementById('sync-data');
    const syncStatus = document.getElementById('sync-status');
    
    try {
      // Update UI
      syncButton.disabled = true;
      syncButton.textContent = 'Syncing...';
      syncStatus.textContent = 'Synchronizing data...';
      
      // Send sync message to background
      browser.runtime.sendMessage({ action: 'syncWithWebApp' });
      
      // Reset UI after delay
      setTimeout(() => {
        syncButton.disabled = false;
        syncButton.textContent = 'Sync Data';
        syncStatus.textContent = 'Sync complete';
        
        // Clear status after another delay
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 2000);
      }, 1500);
      
    } catch (error) {
      console.error('Sync failed:', error);
      syncButton.disabled = false;
      syncButton.textContent = 'Sync Data';
      syncStatus.textContent = 'Sync failed';
    }
  });

  // Clear session data
  document.getElementById('clear-session')?.addEventListener('click', async () => {
    if (confirm('Clear all captures and text entries? This cannot be undone.')) {
      try {
        await browser.storage.local.set({
          captures: [],
          textEntries: []
        });
        
        // Reload popup data
        loadPopupData();
        
        // Show feedback
        const syncStatus = document.getElementById('sync-status');
        syncStatus.textContent = 'Session cleared';
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 2000);
        
      } catch (error) {
        console.error('Failed to clear session:', error);
      }
    }
  });
}

// Listen for storage changes to update popup in real-time
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    loadPopupData();
  }
});