// Popup script
document.addEventListener('DOMContentLoaded', async function() {
  await loadPopupData();
  setupEventListeners();
});

async function loadPopupData() {
  try {
    // Load current status
    const result = await browser.storage.local.get([
      'currentRunsheet', 
      'captures', 
      'textEntries', 
      'savedRows',
      'authToken'
    ]);
    
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