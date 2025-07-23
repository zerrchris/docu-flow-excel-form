// DocuFlow Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleBtn');
  const openAppBtn = document.getElementById('openApp');

  // Check current extension status
  const checkStatus = async () => {
    try {
      const result = await chrome.storage.local.get(['extensionEnabled']);
      const isEnabled = result.extensionEnabled !== false;
      
      statusDiv.textContent = isEnabled ? 'Extension Active' : 'Extension Inactive';
      statusDiv.className = `status ${isEnabled ? 'active' : 'inactive'}`;
      toggleBtn.textContent = isEnabled ? 'Deactivate Extension' : 'Activate Extension';
      
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

  // Open main application
  openAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ 
      url: 'https://xnpmrafjjqsissbtempj.supabase.co' 
    });
  });

  // Initial status check
  await checkStatus();
});