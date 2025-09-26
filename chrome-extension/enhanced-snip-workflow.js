// Enhanced Snip Workflow for RunsheetPro Extension
// This module provides enhanced document snipping and analysis capabilities

console.log('🔧 Enhanced Snip Workflow module loaded');

// Enhanced snip functionality with AI analysis integration
window.EnhancedSnipWorkflow = {
  
  // Process captured snip with enhanced features
  async processEnhancedSnip(blob, metadata = {}) {
    console.log('🔧 Processing enhanced snip with metadata:', metadata);
    
    const processingIndicator = this.showProcessingIndicator();
    
    try {
      // Convert blob to base64 for transmission
      const base64Data = await this.blobToBase64(blob);
      
      // Get current user session
      const authData = await chrome.storage.local.get(['supabase_session']);
      if (!authData.supabase_session?.access_token) {
        throw new Error('User not authenticated');
      }
      
      // Get active runsheet info
      const runsheetData = await chrome.storage.local.get(['activeRunsheet']);
      const activeRunsheet = runsheetData.activeRunsheet;
      
      if (!activeRunsheet?.id) {
        throw new Error('No active runsheet found');
      }
      
      // First, link document to runsheet with extracted data (without analysis)
      const linkResult = await this.linkDocumentToRunsheet(
        base64Data,
        activeRunsheet.id,
        metadata.row_index || 0,
        metadata.filename || `capture_${Date.now()}.png`,
        null, // No extracted data initially
        authData.supabase_session.access_token
      );
      
      // Then analyze document with enhanced AI if available
      let analysisResult = { analysis: null };
      try {
        analysisResult = await this.analyzeWithEnhancedAI(base64Data, {
          runsheet_id: activeRunsheet.id,
          document_name: metadata.filename || `capture_${Date.now()}.png`,
          extraction_preferences: {
            columns: activeRunsheet.columns || [],
            column_instructions: activeRunsheet.column_instructions || {}
          }
        }, authData.supabase_session.access_token);
        
        // If analysis successful, update runsheet with extracted data
        if (analysisResult.analysis?.extracted_data) {
          await this.populateRunsheetData(
            activeRunsheet.id,
            analysisResult.analysis.extracted_data,
            {
              document_id: linkResult.document.id,
              filename: linkResult.document.filename,
              url: linkResult.document.url
            },
            authData.supabase_session.access_token
          );
        }
      } catch (analysisError) {
        console.warn('Document analysis failed, but document was uploaded:', analysisError);
        // Continue without analysis - document is still uploaded
      }
      
      this.hideProcessingIndicator();
      
      // Clean up snip session after successful processing
      if (typeof cleanupSnipSession === 'function') {
        cleanupSnipSession();
      }
      
      return {
        success: true,
        analysis: analysisResult.analysis,
        document: linkResult.document,
        runsheet_update: linkResult.runsheet_update
      };
      
    } catch (error) {
      this.hideProcessingIndicator();
      console.error('Enhanced snip processing error:', error);
      throw error;
    }
  },
  
  // Populate runsheet data after analysis
  async populateRunsheetData(runsheetId, extractedData, documentInfo, accessToken) {
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/populate-runsheet-data', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        runsheetId: runsheetId,
        extractedData: extractedData,
        documentInfo: documentInfo
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runsheet population failed: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  },
  
  // Analyze document with enhanced function used by web app
  async analyzeWithEnhancedAI(base64Data, options, accessToken) {
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/enhanced-document-analysis', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document_data: base64Data,
        runsheet_id: options.runsheet_id,
        document_name: options.document_name,
        extraction_preferences: options.extraction_preferences
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // Return the result in the expected format
    return {
      analysis: result.analysis
    };
  },
  
  // Link document to runsheet with extracted data
  async linkDocumentToRunsheet(base64Data, runsheetId, rowIndex, filename, extractedData, accessToken) {
    const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/extension-document-link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucG1yYWZqanFzaXNzYnRlbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NzMyNjcsImV4cCI6MjA2ODQ0OTI2N30.aQG15Ed8IOLJfM5p7XF_kEM5FUz8zJug1pxAi9rTTsg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document_blob: base64Data,
        runsheet_id: runsheetId,
        row_index: rowIndex,
        filename: filename,
        extracted_data: extractedData
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Document linking failed: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  },
  
  // Convert blob to base64
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
  
  // Show enhanced preview with AI analysis results
  showEnhancedPreview(analysisResult) {
    const modal = document.createElement('div');
    modal.id = 'enhanced-snip-preview';
    modal.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.8) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white !important;
      border-radius: 12px !important;
      padding: 24px !important;
      max-width: 800px !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;
    
    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1f2937;">📋 Enhanced Document Analysis</h2>
        <button id="close-preview" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; margin-bottom: 10px;">📄 Document Type</h3>
        <p style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin: 0;">
          ${analysisResult.analysis?.document_type || 'Unknown'}
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; margin-bottom: 10px;">🔍 Extracted Data</h3>
        <div style="background: #f3f4f6; padding: 12px; border-radius: 6px;">
          ${this.formatExtractedData(analysisResult.analysis?.extracted_data, analysisResult.analysis?.confidence_scores)}
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; margin-bottom: 10px;">📊 Extraction Summary</h3>
        <p style="background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin: 0;">
          ${analysisResult.analysis?.extraction_summary || 'No summary available'}
        </p>
      </div>
      
      ${analysisResult.analysis?.processing_notes ? `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; margin-bottom: 10px;">📝 Processing Notes</h3>
        <p style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; margin: 0; border-left: 3px solid #f59e0b;">
          ${analysisResult.analysis.processing_notes}
        </p>
      </div>
      ` : ''}
      
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="accept-analysis" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500;">
          ✅ Accept & Add to Runsheet
        </button>
        <button id="edit-analysis" style="background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500;">
          ✏️ Edit Before Adding
        </button>
        <button id="cancel-analysis" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500;">
          ❌ Cancel
        </button>
      </div>
    `;
    
    // Event handlers
    content.querySelector('#close-preview').addEventListener('click', () => modal.remove());
    content.querySelector('#cancel-analysis').addEventListener('click', () => modal.remove());
    
    content.querySelector('#accept-analysis').addEventListener('click', () => {
      modal.remove();
      // Trigger accepted analysis callback
      if (window.onAnalysisAccepted) {
        window.onAnalysisAccepted(analysisResult);
      }
    });
    
    content.querySelector('#edit-analysis').addEventListener('click', () => {
      modal.remove();
      // Trigger edit analysis callback
      if (window.onAnalysisEdit) {
        window.onAnalysisEdit(analysisResult);
      }
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    modal.appendChild(content);
    document.body.appendChild(modal);
  },
  
  // Format extracted data for display
  formatExtractedData(extractedData, confidenceScores) {
    if (!extractedData || typeof extractedData !== 'object') {
      return '<p style="color: #6b7280;">No data extracted</p>';
    }
    
    return Object.entries(extractedData).map(([key, value]) => {
      const confidence = confidenceScores?.[key];
      const confidenceColor = confidence >= 0.8 ? '#10b981' : confidence >= 0.6 ? '#f59e0b' : '#ef4444';
      const confidenceText = confidence ? `${Math.round(confidence * 100)}%` : 'N/A';
      
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
          <div>
            <strong style="color: #374151;">${key}:</strong>
            <span style="margin-left: 8px; color: #1f2937;">${value || 'N/A'}</span>
          </div>
          <span style="background: ${confidenceColor}; color: white; padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: 500;">
            ${confidenceText}
          </span>
        </div>
      `;
    }).join('');
  },
  
  // Show loading indicator during processing
  showProcessingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'snip-processing';
    indicator.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: #3b82f6 !important;
      color: white !important;
      padding: 12px 16px !important;
      border-radius: 8px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    `;
    
    indicator.innerHTML = `
      <div style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>
      <span>Analyzing document with AI...</span>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  },
  
  // Hide processing indicator
  hideProcessingIndicator() {
    const indicator = document.getElementById('snip-processing');
    if (indicator) {
      indicator.remove();
    }
  }
};

console.log('🔧 Enhanced Snip Workflow ready');