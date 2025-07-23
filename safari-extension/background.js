// Safari Web Extension Background Script
// Enhanced version of the Firefox background script with Safari compatibility

// Extension lifecycle
browser.runtime.onInstalled.addListener(() => {
  console.log('DocuFlow Safari Extension installed');
});

// Message handling from content scripts and popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'captureArea':
      handleScreenCapture(sender.tab);
      break;
    case 'addText':
      handleAddText(request.text, request.url, sender.tab);
      break;
    case 'saveRow':
      handleSaveRow(request.runsheet);
      break;
    case 'syncWithWebApp':
      handleSyncWithWebApp();
      break;
  }
  return true; // Keep message channel open for async responses
});

// Screen capture handling - Safari has restrictions
async function handleScreenCapture(tab) {
  try {
    // Safari Web Extensions have limited screen capture capabilities
    // Using a workaround with canvas-based capture
    const captureData = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 90
    });
    
    // Store the capture
    const captureId = 'capture_' + Date.now();
    const captureInfo = {
      id: captureId,
      dataUrl: captureData,
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString()
    };
    
    // Save to storage
    const result = await browser.storage.local.get(['captures']);
    const captures = result.captures || [];
    captures.push(captureInfo);
    
    await browser.storage.local.set({ captures });
    
    // Notify content script
    browser.tabs.sendMessage(tab.id, {
      action: 'captureComplete',
      capture: captureInfo
    });
    
    console.log('Screen capture completed:', captureId);
  } catch (error) {
    console.error('Screen capture failed:', error);
    // Fallback: notify user about limitation
    browser.tabs.sendMessage(tab.id, {
      action: 'captureError',
      error: 'Screen capture not available in Safari. Try using the web app directly.'
    });
  }
}

// Text entry handling
async function handleAddText(text, url, tab) {
  try {
    const textId = 'text_' + Date.now();
    const textEntry = {
      id: textId,
      text: text,
      url: url,
      title: tab.title,
      timestamp: new Date().toISOString()
    };
    
    // Save to storage
    const result = await browser.storage.local.get(['textEntries']);
    const textEntries = result.textEntries || [];
    textEntries.push(textEntry);
    
    await browser.storage.local.set({ textEntries });
    
    console.log('Text added:', textId);
  } catch (error) {
    console.error('Failed to add text:', error);
  }
}

// Row saving and sync
async function handleSaveRow(runsheet) {
  try {
    // Get current captures and text entries
    const storage = await browser.storage.local.get(['captures', 'textEntries', 'savedRows']);
    const captures = storage.captures || [];
    const textEntries = storage.textEntries || [];
    const savedRows = storage.savedRows || [];
    
    // Create row data
    const rowData = {
      id: 'row_' + Date.now(),
      runsheet: runsheet,
      captures: captures,
      textEntries: textEntries,
      timestamp: new Date().toISOString(),
      synced: false
    };
    
    // Save row
    savedRows.push(rowData);
    await browser.storage.local.set({ 
      savedRows,
      captures: [], // Clear current session
      textEntries: [] // Clear current session
    });
    
    // Attempt to sync
    await syncRowWithWebApp(rowData);
    
    console.log('Row saved:', rowData.id);
  } catch (error) {
    console.error('Failed to save row:', error);
  }
}

// Sync individual row with web app
async function syncRowWithWebApp(rowData) {
  try {
    const authResult = await browser.storage.local.get(['authToken']);
    
    if (!authResult.authToken) {
      console.log('No auth token available for sync');
      return;
    }
    
    // Safari requires explicit URL for fetch requests
    const syncUrl = 'https://9e913707-5b2b-41be-9c86-3541992b5349.lovableproject.com/api/sync-extension-data';
    
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authResult.authToken}`
      },
      body: JSON.stringify(rowData)
    });
    
    if (response.ok) {
      // Mark as synced
      const storage = await browser.storage.local.get(['savedRows']);
      const savedRows = storage.savedRows || [];
      const updatedRows = savedRows.map(row => 
        row.id === rowData.id ? { ...row, synced: true } : row
      );
      
      await browser.storage.local.set({ savedRows: updatedRows });
      console.log('Row synced successfully:', rowData.id);
    } else {
      console.error('Sync failed:', response.status);
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Bulk sync with web app
async function handleSyncWithWebApp() {
  try {
    const storage = await browser.storage.local.get(['savedRows']);
    const savedRows = storage.savedRows || [];
    const unsynced = savedRows.filter(row => !row.synced);
    
    for (const row of unsynced) {
      await syncRowWithWebApp(row);
    }
    
    console.log(`Synced ${unsynced.length} rows`);
  } catch (error) {
    console.error('Bulk sync failed:', error);
  }
}