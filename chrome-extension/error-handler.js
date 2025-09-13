// Error handling utilities for RunsheetPro Extension
console.log('🔧 Error Handler module loaded');

window.ExtensionErrorHandler = {
  
  // Show error notification to user
  showError(message, details = null) {
    console.error('Extension Error:', message, details);
    
    // Create error notification
    const notification = document.createElement('div');
    notification.className = 'runsheetpro-notification error';
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      padding: 16px 20px !important;
      border-radius: 8px !important;
      background: #ef4444 !important;
      color: white !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      z-index: 2147483647 !important;
      max-width: 400px !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      animation: slideIn 0.3s ease-out !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <span style="font-size: 16px;">❌</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">Error</div>
          <div style="font-size: 13px; opacity: 0.9;">${message}</div>
          ${details ? `<div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Details: ${details}</div>` : ''}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; margin-left: 8px;">×</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 8000);
  },
  
  // Show success notification
  showSuccess(message) {
    console.log('Extension Success:', message);
    
    const notification = document.createElement('div');
    notification.className = 'runsheetpro-notification success';
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      padding: 16px 20px !important;
      border-radius: 8px !important;
      background: #10b981 !important;
      color: white !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      z-index: 2147483647 !important;
      max-width: 400px !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      animation: slideIn 0.3s ease-out !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">✅</span>
        <div style="flex: 1;">
          <div style="font-weight: 600;">${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; margin-left: 8px;">×</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 4000);
  },
  
  // Show progress notification
  showProgress(message) {
    const existingProgress = document.getElementById('extension-progress');
    if (existingProgress) {
      existingProgress.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'extension-progress';
    notification.className = 'runsheetpro-notification info';
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      padding: 16px 20px !important;
      border-radius: 8px !important;
      background: #3b82f6 !important;
      color: white !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      z-index: 2147483647 !important;
      max-width: 400px !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      animation: slideIn 0.3s ease-out !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>
        <div style="flex: 1;">
          <div style="font-weight: 600;">${message}</div>
        </div>
      </div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;
    
    document.body.appendChild(notification);
    return notification;
  },
  
  // Hide progress notification
  hideProgress() {
    const notification = document.getElementById('extension-progress');
    if (notification) {
      notification.remove();
    }
  },
  
  // Handle API errors with user-friendly messages
  handleApiError(error, operation = 'operation') {
    let userMessage = `Failed to ${operation}`;
    let details = null;
    
    if (error.message) {
      if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
        userMessage = 'Authentication required. Please sign in again.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        userMessage = 'Network error. Please check your connection.';
      } else if (error.message.includes('timeout')) {
        userMessage = 'Request timed out. Please try again.';
      } else {
        details = error.message;
      }
    }
    
    this.showError(userMessage, details);
  },
  
  // Validate file before processing
  validateFile(file, maxSizeBytes = 50 * 1024 * 1024) { // 50MB default
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.size > maxSizeBytes) {
      throw new Error(`File too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)}MB`);
    }
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }
    
    return true;
  },
  
  // Retry mechanism for failed operations
  async retry(operation, maxAttempts = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError;
  }
};

console.log('🔧 Error Handler ready');