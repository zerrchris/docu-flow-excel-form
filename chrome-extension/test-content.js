// Simple test content script
console.log('TEST: Content script is loading');

// Simple test function
function createTestButton() {
  console.log('TEST: Creating test button');
  
  const button = document.createElement('div');
  button.innerHTML = 'TEST';
  button.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    width: 50px !important;
    height: 50px !important;
    background: red !important;
    color: white !important;
    z-index: 9999999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  `;
  
  document.body.appendChild(button);
  console.log('TEST: Button added to DOM');
}

// Run immediately
console.log('TEST: Script loaded, creating button...');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createTestButton);
} else {
  createTestButton();
}