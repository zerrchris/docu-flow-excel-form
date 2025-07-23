// Popup script for Firefox
console.log('DocuFlow popup script loading...');

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM loaded, initializing popup...');
  try {
    await loadPopupData();
    setupEventListeners();
    console.log('Popup initialization complete');
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});

async function loadPopupData() {
  try {
    // First check if user is authenticated with the web app
    await checkAuthenticationStatus();
    
    // Load current status - Firefox WebExtensions API
    const result = await browser.storage.local.get([
      'currentRunsheet', 
      'captures', 
      'textEntries', 
      'savedRows',
      'authToken'
    ]).catch(error => {
      console.error('Storage access error:', error);
      return {};
    });
    
    // Update runsheet display
    const runsheetEl = document.getElementById('current-runsheet');
    if (result.currentRunsheet) {
      runsheetEl.textContent = result.currentRunsheet.name;
    } else {
      runsheetEl.textContent = 'No runsheet selected';
    }
    
    // Update counts
    document.getElementById('captures-count').textContent = (result.captures || []).length;
    document.getElementById('text-count').textContent = (result.textEntries || []).length;
    document.getElementById('saved-rows').textContent = (result.savedRows || []).length;
    
    // Show auth section if not authenticated
    const authSection = document.getElementById('auth-section');
    if (!result.authToken) {
      authSection.style.display = 'block';
    } else {
      authSection.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Error loading popup data:', error);
  }
}

async function checkAuthenticationStatus() {
  try {
    // Check if any tabs have the web app open and get auth status from there
    const tabs = await browser.tabs.query({
      url: 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com/*'
    });
    
    if (tabs.length > 0) {
      // Try to get auth status from the web app tab
      try {
        const response = await browser.tabs.sendMessage(tabs[0].id, { 
          action: 'getAuthStatus' 
        });
        
        if (response && response.authenticated && response.token) {
          await browser.storage.local.set({ authToken: response.token });
          console.log('Authentication status synced with web app');
        }
      } catch (error) {
        console.log('Could not get auth status from web app tab:', error);
      }
    }
  } catch (error) {
    console.log('Could not check authentication status:', error);
  }
}

function setupEventListeners() {
  // Toggle panel button
  document.getElementById('toggle-panel-btn').addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      browser.tabs.sendMessage(tabs[0].id, { action: 'togglePanel' });
    }
  });

  // Open web app button
  document.getElementById('open-webapp-btn').addEventListener('click', () => {
    browser.tabs.create({ 
      url: 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com/app' 
    });
  });

  // Login button
  document.getElementById('login-btn').addEventListener('click', () => {
    browser.tabs.create({ 
      url: 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com/signin' 
    });
  });

  // Sync data button
  document.getElementById('sync-data-btn').addEventListener('click', async () => {
    const button = document.getElementById('sync-data-btn');
    const originalText = button.textContent;
    
    button.textContent = 'Syncing...';
    button.disabled = true;
    
    try {
      const result = await browser.runtime.sendMessage({ action: 'syncWithWebApp' });
      
      if (result && result.success) {
        button.textContent = 'Synced!';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
        
        // Reload data
        await loadPopupData();
      } else {
        button.textContent = 'Sync Failed';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Sync error:', error);
      button.textContent = 'Error';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  });

  // Clear session button
  document.getElementById('clear-session-btn').addEventListener('click', async () => {
    if (confirm('Clear all session data? This will remove captures and text entries but keep saved rows.')) {
      await browser.storage.local.remove(['captures', 'textEntries']);
      await loadPopupData();
    }
  });
}

// Listen for storage changes to update the popup
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    loadPopupData();
  }
});