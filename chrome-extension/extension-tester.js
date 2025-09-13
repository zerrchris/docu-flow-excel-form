// RunsheetPro Extension Testing Suite
console.log('🔧 Extension Tester module loaded');

window.ExtensionTester = {
  
  // Test suite results
  testResults: {
    passed: 0,
    failed: 0,
    tests: []
  },
  
  // Run all tests
  async runAllTests() {
    console.log('🧪 Starting Extension Test Suite...');
    this.testResults = { passed: 0, failed: 0, tests: [] };
    
    this.showTestUI();
    
    // Core functionality tests
    await this.testAuthentication();
    await this.testRunsheetSelection();
    await this.testDocumentCapture();
    await this.testDataExtraction();
    await this.testErrorHandling();
    await this.testUIResponsiveness();
    
    this.showTestResults();
  },
  
  // Show test UI
  showTestUI() {
    const existingUI = document.getElementById('extension-test-ui');
    if (existingUI) existingUI.remove();
    
    const testUI = document.createElement('div');
    testUI.id = 'extension-test-ui';
    testUI.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      left: 20px !important;
      width: 400px !important;
      background: white !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 12px !important;
      padding: 20px !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
    `;
    
    testUI.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0; color: #1f2937; font-size: 18px;">🧪 Extension Tests</h2>
        <button id="close-test-ui" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
      </div>
      <div id="test-progress" style="margin-bottom: 16px;">
        <div style="background: #f3f4f6; height: 8px; border-radius: 4px; overflow: hidden;">
          <div id="progress-bar" style="background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
        </div>
        <div id="progress-text" style="margin-top: 8px; font-size: 14px; color: #6b7280;">Initializing tests...</div>
      </div>
      <div id="test-results" style="font-size: 13px;"></div>
    `;
    
    document.body.appendChild(testUI);
    
    document.getElementById('close-test-ui').addEventListener('click', () => {
      testUI.remove();
    });
  },
  
  // Update test progress
  updateProgress(current, total, message) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar && progressText) {
      const percentage = Math.round((current / total) * 100);
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = message;
    }
  },
  
  // Run individual test
  async runTest(name, testFunction) {
    this.updateProgress(this.testResults.tests.length, 6, `Running: ${name}`);
    
    try {
      const result = await testFunction();
      this.testResults.passed++;
      this.testResults.tests.push({ name, status: 'passed', result });
      console.log(`✅ Test passed: ${name}`, result);
    } catch (error) {
      this.testResults.failed++;
      this.testResults.tests.push({ name, status: 'failed', error: error.message });
      console.error(`❌ Test failed: ${name}`, error);
    }
  },
  
  // Test authentication
  async testAuthentication() {
    await this.runTest('Authentication Check', async () => {
      const authData = await chrome.storage.local.get(['supabase_session']);
      
      if (!authData.supabase_session) {
        throw new Error('No authentication session found');
      }
      
      if (!authData.supabase_session.access_token) {
        throw new Error('No access token found');
      }
      
      // Test API call with token
      const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/rest/v1/runsheets?select=id&limit=1', {
        headers: {
          'Authorization': `Bearer ${authData.supabase_session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API authentication failed: ${response.status}`);
      }
      
      return 'Authentication valid';
    });
  },
  
  // Test runsheet selection
  async testRunsheetSelection() {
    await this.runTest('Runsheet Selection', async () => {
      const runsheetData = await chrome.storage.local.get(['activeRunsheet']);
      
      if (!runsheetData.activeRunsheet) {
        throw new Error('No active runsheet found');
      }
      
      if (!runsheetData.activeRunsheet.id) {
        throw new Error('Active runsheet has no ID');
      }
      
      if (!runsheetData.activeRunsheet.columns || runsheetData.activeRunsheet.columns.length === 0) {
        throw new Error('Active runsheet has no columns');
      }
      
      return `Active runsheet: ${runsheetData.activeRunsheet.name} (${runsheetData.activeRunsheet.columns.length} columns)`;
    });
  },
  
  // Test document capture
  async testDocumentCapture() {
    await this.runTest('Document Capture System', async () => {
      // Test if enhanced snip workflow is available
      if (!window.EnhancedSnipWorkflow) {
        throw new Error('Enhanced Snip Workflow not loaded');
      }
      
      // Test blob to base64 conversion
      const testBlob = new Blob(['test data'], { type: 'text/plain' });
      const base64Result = await window.EnhancedSnipWorkflow.blobToBase64(testBlob);
      
      if (!base64Result || !base64Result.startsWith('data:')) {
        throw new Error('Blob to base64 conversion failed');
      }
      
      // Test canvas capture capability
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 100, 100);
      
      const canvasBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      
      if (!canvasBlob) {
        throw new Error('Canvas capture failed');
      }
      
      return 'Document capture system functional';
    });
  },
  
  // Test data extraction
  async testDataExtraction() {
    await this.runTest('Data Extraction API', async () => {
      const authData = await chrome.storage.local.get(['supabase_session']);
      if (!authData.supabase_session?.access_token) {
        throw new Error('Authentication required for API test');
      }
      
      // Test extension-document-link endpoint
      const testResponse = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-document-link', {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${authData.supabase_session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg'
        }
      });
      
      if (!testResponse.ok && testResponse.status !== 405) {
        throw new Error(`API endpoint not accessible: ${testResponse.status}`);
      }
      
      return 'Data extraction API accessible';
    });
  },
  
  // Test error handling
  async testErrorHandling() {
    await this.runTest('Error Handling', async () => {
      if (!window.ExtensionErrorHandler) {
        throw new Error('Error Handler not loaded');
      }
      
      // Test file validation
      try {
        const oversizedFile = { size: 100 * 1024 * 1024, type: 'image/png' }; // 100MB
        window.ExtensionErrorHandler.validateFile(oversizedFile, 50 * 1024 * 1024);
        throw new Error('Should have thrown error for oversized file');
      } catch (error) {
        if (!error.message.includes('too large')) {
          throw new Error('File size validation not working properly');
        }
      }
      
      // Test unsupported file type
      try {
        const unsupportedFile = { size: 1024, type: 'text/plain' };
        window.ExtensionErrorHandler.validateFile(unsupportedFile);
        throw new Error('Should have thrown error for unsupported file');
      } catch (error) {
        if (!error.message.includes('Unsupported file type')) {
          throw new Error('File type validation not working properly');
        }
      }
      
      return 'Error handling system functional';
    });
  },
  
  // Test UI responsiveness
  async testUIResponsiveness() {
    await this.runTest('UI Responsiveness', async () => {
      // Test button creation
      const button = document.getElementById('runsheetpro-runsheet-button');
      if (!button) {
        throw new Error('Extension button not found');
      }
      
      // Test if button is visible
      const buttonStyles = window.getComputedStyle(button);
      if (buttonStyles.display === 'none' || buttonStyles.visibility === 'hidden') {
        throw new Error('Extension button is not visible');
      }
      
      // Test if button is positioned correctly
      if (buttonStyles.position !== 'fixed') {
        throw new Error('Extension button positioning incorrect');
      }
      
      // Test CSS loading
      const testElement = document.createElement('div');
      testElement.className = 'runsheetpro-notification';
      document.body.appendChild(testElement);
      const styles = window.getComputedStyle(testElement);
      document.body.removeChild(testElement);
      
      if (styles.position !== 'fixed') {
        throw new Error('Extension CSS not properly loaded');
      }
      
      return 'UI components responsive and properly styled';
    });
  },
  
  // Show final test results
  showTestResults() {
    const testResults = document.getElementById('test-results');
    if (!testResults) return;
    
    const totalTests = this.testResults.passed + this.testResults.failed;
    const successRate = Math.round((this.testResults.passed / totalTests) * 100);
    
    let html = `
      <div style="margin-bottom: 16px; padding: 12px; border-radius: 8px; background: ${successRate === 100 ? '#d1fae5' : successRate >= 80 ? '#fef3c7' : '#fee2e2'};">
        <div style="font-weight: 600; color: ${successRate === 100 ? '#065f46' : successRate >= 80 ? '#92400e' : '#991b1b'};">
          ${successRate === 100 ? '✅ All tests passed!' : successRate >= 80 ? '⚠️ Some issues found' : '❌ Critical issues detected'}
        </div>
        <div style="font-size: 12px; color: ${successRate === 100 ? '#065f46' : successRate >= 80 ? '#92400e' : '#991b1b'}; margin-top: 4px;">
          ${this.testResults.passed}/${totalTests} tests passed (${successRate}%)
        </div>
      </div>
    `;
    
    this.testResults.tests.forEach(test => {
      const icon = test.status === 'passed' ? '✅' : '❌';
      const color = test.status === 'passed' ? '#10b981' : '#ef4444';
      
      html += `
        <div style="margin-bottom: 8px; padding: 8px; border-left: 3px solid ${color}; background: ${test.status === 'passed' ? '#f0fdf4' : '#fef2f2'};">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${icon}</span>
            <span style="font-weight: 500; color: #1f2937;">${test.name}</span>
          </div>
          <div style="margin-top: 4px; font-size: 12px; color: #6b7280;">
            ${test.status === 'passed' ? test.result : test.error}
          </div>
        </div>
      `;
    });
    
    testResults.innerHTML = html;
    this.updateProgress(totalTests, totalTests, `Testing complete: ${successRate}% success rate`);
    
    // Auto-close after 30 seconds if all tests passed
    if (successRate === 100) {
      setTimeout(() => {
        const ui = document.getElementById('extension-test-ui');
        if (ui) ui.remove();
      }, 30000);
    }
  }
};

// Auto-run tests when loaded (if in development)
if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
  // Add test trigger to console
  console.log('🧪 Extension Tester ready. Run ExtensionTester.runAllTests() to test the extension.');
}

console.log('🔧 Extension Tester ready');