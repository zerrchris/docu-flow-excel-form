// DocuFlow Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleBtn');
  const viewModeBtn = document.getElementById('viewModeBtn');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const openAppBtn = document.getElementById('openApp');
  const authSection = document.getElementById('auth-section');
  const authStatus = document.getElementById('auth-status');
  const signinForm = document.getElementById('signin-form');
  const showSignupBtn = document.getElementById('show-signup');

  // Supabase configuration
  const SUPABASE_URL = 'https://xnpmrafjjqsissbtempj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg';
  
  // Initialize Supabase client
  const { createClient } = window.supabase || (() => {
    console.error('Supabase client not available. Adding script...');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    document.head.appendChild(script);
    return { createClient: null };
  })();
  
  const supabase = createClient ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  
  // Authentication functions
  const checkAuthStatus = async () => {
    try {
      const result = await chrome.storage.local.get(['supabase_session']);
      const hasSession = result.supabase_session && result.supabase_session.access_token;
      
      if (hasSession) {
        authSection.style.display = 'none';
        authStatus.style.display = 'block';
        return true;
      } else {
        authSection.style.display = 'block';
        authStatus.style.display = 'none';
        return false;
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
  };

  const signIn = async (email, password) => {
    try {
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        // Store session in chrome storage
        await chrome.storage.local.set({
          supabase_session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            user: data.session.user
          }
        });
        
        console.log('🔧 RunsheetPro Extension: User signed in successfully');
        await checkAuthStatus();
        return { success: true };
      }
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message };
    }
  };

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
        screenshotBtn.style.display = 'block';
      } else {
        viewModeBtn.style.display = 'none';
        screenshotBtn.style.display = 'none';
      }
      
      // Check authentication status
      await checkAuthStatus();
      
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
    console.log('🔧 RunsheetPro Popup: Toggle button clicked');
    try {
      const currentStatus = await checkStatus();
      const newStatus = !currentStatus;
      
      console.log('🔧 RunsheetPro Popup: Current status:', currentStatus, 'New status:', newStatus);
      
      await chrome.storage.local.set({ extensionEnabled: newStatus, extension_enabled: newStatus, extension_disabled: !newStatus });
      console.log('🔧 RunsheetPro Popup: Storage updated');
      
      // Send message to content scripts to update
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('🔧 RunsheetPro Popup: Active tabs:', tabs);
      
      if (tabs[0]) {
        console.log('🔧 RunsheetPro Popup: Sending message to tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'toggleExtension', 
          enabled: newStatus 
        }).then(response => {
          console.log('🔧 RunsheetPro Popup: Message response:', response);
        }).catch(error => {
          console.warn('🔧 RunsheetPro Popup: Message error:', error);
        });
      }
      
      await checkStatus();
      console.log('🔧 RunsheetPro Popup: Toggle complete');
    } catch (error) {
      console.error('🔧 RunsheetPro Popup: Error toggling extension:', error);
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

  // Screenshot button
  screenshotBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'showSnipModeSelector'
        }).catch(() => {
          console.error('Could not show snip mode selector');
        });
      }
      window.close(); // Close popup after starting snip mode
    } catch (error) {
      console.error('Error showing snip mode selector:', error);
    }
  });

  // Open main application
  openAppBtn.addEventListener('click', async () => {
    // Check if we're in development by looking at the current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const isLocalDevelopment = tabs[0] && (tabs[0].url.includes('localhost') || tabs[0].url.includes('8080'));
    
    let appUrl = isLocalDevelopment 
      ? 'http://localhost:8080' 
      : 'https://preview--docu-flow-excel-form.lovable.app';
    
    // Include auth data and active runsheet if available
    try {
      const result = await chrome.storage.local.get(['supabase_session', 'activeRunsheet']);
      const params = new URLSearchParams();
      
      if (result.supabase_session && result.supabase_session.access_token) {
        const authData = {
          access_token: result.supabase_session.access_token,
          refresh_token: result.supabase_session.refresh_token
        };
        params.set('extension_auth', encodeURIComponent(JSON.stringify(authData)));
      }
      
      if (result.activeRunsheet && result.activeRunsheet.id) {
        params.set('id', result.activeRunsheet.id);
        params.set('from', 'extension'); // Add extension flag for force refresh
        appUrl += '/runsheet';
      }
      
      if (params.toString()) {
        appUrl += '?' + params.toString();
      }
    } catch (error) {
      console.error('Error preparing app URL with auth data:', error);
    }
      
    chrome.tabs.create({ 
      url: appUrl 
    });
  });

  // Sign in form handler
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const signinBtn = document.getElementById('signin-btn');

    if (!email || !password) {
      alert('Please enter both email and password');
      return;
    }

    signinBtn.textContent = 'Signing in...';
    signinBtn.disabled = true;

    const result = await signIn(email, password);
    
    if (result.success) {
      // Clear form
      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      
      // Send message to content script to update auth status
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'authStatusChanged', 
            authenticated: true 
          }).catch(() => {
            // Ignore errors if content script isn't loaded
          });
        }
      } catch (error) {
        console.log('Could not notify content script of auth change:', error);
      }
    } else {
      alert('Sign in failed: ' + (result.error || 'Unknown error'));
    }

    signinBtn.textContent = 'Sign In';
    signinBtn.disabled = false;
  });

  // Show signup option (redirect to main app for now)
  showSignupBtn.addEventListener('click', () => {
    chrome.tabs.create({ 
      url: 'https://preview--docu-flow-excel-form.lovable.app/signin' 
    });
  });

  // Initial status check
  await checkStatus();
});