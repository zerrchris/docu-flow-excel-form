// Simple test script to verify extension loading
console.log('🧪 EXTENSION TEST SCRIPT LOADED');

// Create a simple test button that always works
function createTestButton() {
  console.log('🧪 Creating test button');
  
  const testButton = document.createElement('div');
  testButton.id = 'extension-test-button';
  testButton.style.cssText = `
    position: fixed !important;
    bottom: 90px !important;
    right: 20px !important;
    width: 60px !important;
    height: 60px !important;
    background: red !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: white !important;
    font-size: 20px !important;
    cursor: pointer !important;
    z-index: 999999 !important;
  `;
  testButton.innerHTML = '🔴';
  testButton.title = 'Extension Test';
  
  testButton.addEventListener('click', () => {
    console.log('🧪 TEST BUTTON CLICKED!');
    alert('Extension is working! Test button clicked.');
  });
  
  if (document.body) {
    document.body.appendChild(testButton);
    console.log('🧪 Test button added to page');
  } else {
    console.log('🧪 No document.body available');
  }
}

// Wait for DOM and create test button
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createTestButton);
} else {
  createTestButton();
}