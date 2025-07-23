// Background script - handles screenshots and data sync
browser.runtime.onInstalled.addListener(() => {
  console.log('DocuFlow extension installed');
});

// Handle messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'captureArea':
      handleScreenCapture(sender.tab);
      break;
    case 'addText':
      handleAddText(message.text, message.url, sender.tab);
      break;
    case 'saveRow':
      handleSaveRow(message.runsheet);
      break;
    case 'syncWithWebApp':
      handleSyncWithWebApp();
      break;
  }
});

async function handleScreenCapture(tab) {
  try {
    // Capture the visible tab
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });
    
    // Store the capture
    const timestamp = Date.now();
    const captureData = {
      id: `capture_${timestamp}`,
      dataUrl: dataUrl,
      url: tab.url,
      title: tab.title,
      timestamp: timestamp
    };
    
    // Save to storage
    const result = await browser.storage.local.get(['captures']);
    const captures = result.captures || [];
    captures.push(captureData);
    
    await browser.storage.local.set({ captures: captures });
    
    // Notify content script
    browser.tabs.sendMessage(tab.id, {
      action: 'captureComplete',
      capture: captureData
    });
    
    console.log('Screen captured successfully');
  } catch (error) {
    console.error('Error capturing screen:', error);
  }
}

async function handleAddText(text, url, tab) {
  try {
    const timestamp = Date.now();
    const textData = {
      id: `text_${timestamp}`,
      text: text,
      url: url,
      title: tab.title,
      timestamp: timestamp
    };
    
    // Save to storage
    const result = await browser.storage.local.get(['textEntries']);
    const textEntries = result.textEntries || [];
    textEntries.push(textData);
    
    await browser.storage.local.set({ textEntries: textEntries });
    
    console.log('Text added:', text);
  } catch (error) {
    console.error('Error adding text:', error);
  }
}

async function handleSaveRow(runsheet) {
  try {
    // Get all captures and text entries
    const result = await browser.storage.local.get(['captures', 'textEntries']);
    const captures = result.captures || [];
    const textEntries = result.textEntries || [];
    
    // Create row data
    const rowData = {
      id: `row_${Date.now()}`,
      runsheetId: runsheet.id,
      captures: captures,
      textEntries: textEntries,
      timestamp: Date.now()
    };
    
    // Save row
    const savedRows = await browser.storage.local.get(['savedRows']);
    const rows = savedRows.savedRows || [];
    rows.push(rowData);
    
    await browser.storage.local.set({ savedRows: rows });
    
    // Clear current session data
    await browser.storage.local.remove(['captures', 'textEntries']);
    
    // Sync with web app
    await syncRowWithWebApp(rowData);
    
    console.log('Row saved successfully');
  } catch (error) {
    console.error('Error saving row:', error);
  }
}

async function syncRowWithWebApp(rowData) {
  try {
    // Get stored authentication token
    const authResult = await browser.storage.local.get(['authToken', 'userId']);
    
    if (!authResult.authToken) {
      console.log('No auth token found, skipping sync');
      return;
    }
    
    // Send to your web app's API
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/sync-extension-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authResult.authToken}`
      },
      body: JSON.stringify({
        rowData: rowData,
        userId: authResult.userId
      })
    });
    
    if (response.ok) {
      console.log('Row synced with web app successfully');
    } else {
      console.error('Failed to sync with web app:', response.status);
    }
  } catch (error) {
    console.error('Error syncing with web app:', error);
  }
}

async function handleSyncWithWebApp() {
  try {
    // Get all pending data
    const result = await browser.storage.local.get(['savedRows', 'authToken']);
    
    if (!result.authToken) {
      console.log('Authentication required');
      return { success: false, error: 'Authentication required' };
    }
    
    const rows = result.savedRows || [];
    
    for (const row of rows) {
      await syncRowWithWebApp(row);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in bulk sync:', error);
    return { success: false, error: error.message };
  }
}