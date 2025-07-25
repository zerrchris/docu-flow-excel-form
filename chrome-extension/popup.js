// DocuFlow Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleBtn');
  const viewModeBtn = document.getElementById('viewModeBtn');
  const singleSnipBtn = document.getElementById('singleSnipBtn');
  const scrollSnipBtn = document.getElementById('scrollSnipBtn');
  const navigateSnipBtn = document.getElementById('navigateSnipBtn');
  const openAppBtn = document.getElementById('openApp');

  // Check current extension status
  const checkStatus = async () => {
    try {
      const result = await chrome.storage.local.get(['extensionEnabled', 'viewMode', 'activeRunsheet']);
      const isEnabled = result.extensionEnabled !== false;
      const viewMode = result.viewMode || 'single'; // 'single' or 'full'
      const hasActiveRunsheet = result.activeRunsheet;
      
      statusDiv.textContent = isEnabled ? 'Extension Active' : 'Extension Inactive';
      statusDiv.className = `status ${isEnabled ? 'active' : 'inactive'}`;
      toggleBtn.textContent = isEnabled ? 'Deactivate Extension' : 'Activate Extension';
      
      // Show view mode button only if extension is active and has an active runsheet
      if (isEnabled && hasActiveRunsheet) {
        viewModeBtn.style.display = 'block';
        viewModeBtn.textContent = viewMode === 'single' ? 'Switch to Full View' : 'Switch to Single Entry';
        singleSnipBtn.style.display = 'block';
        scrollSnipBtn.style.display = 'block';
        navigateSnipBtn.style.display = 'block';
      } else {
        viewModeBtn.style.display = 'none';
        singleSnipBtn.style.display = 'none';
        scrollSnipBtn.style.display = 'none';
        navigateSnipBtn.style.display = 'none';
      }
      
      return isEnabled;
    } catch (error) {
      console.error('Error checking status:', error);
      statusDiv.textContent = 'Error loading status';
      statusDiv.className = 'status inactive';
      return false;
    }
  };

  // Toggle extension
  toggleBtn.addEventListener('click', async () => {
    try {
      const currentStatus = await checkStatus();
      const newStatus = !currentStatus;
      
      await chrome.storage.local.set({ extensionEnabled: newStatus });
      
      // Send message to content scripts to update
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'toggleExtension', 
          enabled: newStatus 
        }).catch(() => {
          // Ignore errors if content script isn't loaded
        });
      }
      
      await checkStatus();
    } catch (error) {
      console.error('Error toggling extension:', error);
    }
  });

  // Toggle view mode
  viewModeBtn.addEventListener('click', async () => {
    try {
      const result = await chrome.storage.local.get(['viewMode']);
      const currentMode = result.viewMode || 'single';
      const newMode = currentMode === 'single' ? 'full' : 'single';
      
      await chrome.storage.local.set({ viewMode: newMode });
      
      // Send message to content script to switch view
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'switchViewMode', 
          viewMode: newMode 
        }).catch(() => {
          // Ignore errors if content script isn't loaded
        });
      }
      
      await checkStatus();
    } catch (error) {
      console.error('Error toggling view mode:', error);
    }
  });

  // Single snip mode
  singleSnipBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startSnipMode',
          mode: 'single'
        }).catch(() => {
          console.error('Could not start single snip mode');
        });
      }
      window.close(); // Close popup after starting snip mode
    } catch (error) {
      console.error('Error starting single snip mode:', error);
    }
  });

  // Snip and scroll mode
  scrollSnipBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startSnipMode',
          mode: 'scroll'
        }).catch(() => {
          console.error('Could not start scroll snip mode');
        });
      }
      window.close(); // Close popup after starting snip mode
    } catch (error) {
      console.error('Error starting scroll snip mode:', error);
    }
  });

  // Click and navigate mode
  navigateSnipBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startSnipMode',
          mode: 'navigate'
        }).catch(() => {
          console.error('Could not start navigate snip mode');
        });
      }
      window.close(); // Close popup after starting snip mode
    } catch (error) {
      console.error('Error starting navigate snip mode:', error);
    }
  });

  // Open main application
  openAppBtn.addEventListener('click', async () => {
    // Check if we're in development by looking at the current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const isLocalDevelopment = tabs[0] && tabs[0].url.includes('localhost');
    
    const appUrl = isLocalDevelopment 
      ? 'http://localhost:5173' 
      : 'https://docuflow-chrome-extension.lovableproject.com';
      
    chrome.tabs.create({ 
      url: appUrl 
    });
  });

  // Initial status check
  await checkStatus();
});