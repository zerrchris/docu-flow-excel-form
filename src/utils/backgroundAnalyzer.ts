import { supabase } from '@/integrations/supabase/client';
import { DocumentService, type DocumentRecord } from '@/services/documentService';

interface AnalysisJob {
  id: string;
  runsheetId: string;
  runsheetName: string;
  columns: string[];
  columnInstructions: Record<string, string>;
  documentMap: [number, DocumentRecord][];
  currentData: Record<string, string>[];
  skipRowsWithData: boolean;
  currentIndex: number;
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  results: AnalysisResult[];
  documentCache: Map<string, string>; // Cache for downloaded document blobs
  lastSaveIndex: number; // Track when we last saved to batch saves
}

interface AnalysisResult {
  rowIndex: number;
  documentName: string;
  status: 'pending' | 'analyzing' | 'success' | 'error';
  extractedData?: Record<string, string>;
  error?: string;
}

export class BackgroundAnalyzer {
  private static instance: BackgroundAnalyzer;
  private currentJob: AnalysisJob | null = null;
  private isRunning = false;
  private callbacks: Map<string, (progress: AnalysisProgress) => void> = new Map();

  static getInstance(): BackgroundAnalyzer {
    if (!BackgroundAnalyzer.instance) {
      BackgroundAnalyzer.instance = new BackgroundAnalyzer();
    }
    return BackgroundAnalyzer.instance;
  }

  async startAnalysis(
    runsheetId: string,
    runsheetName: string,
    columns: string[],
    columnInstructions: Record<string, string>,
    documentMap: Map<number, DocumentRecord>,
    currentData: Record<string, string>[],
    skipRowsWithData: boolean = true
  ): Promise<string> {
    // Create unique job ID
    const jobId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Convert Map to array for serialization
    const documentArray = Array.from(documentMap.entries());
    
    const job: AnalysisJob = {
      id: jobId,
      runsheetId,
      runsheetName,
      columns,
      columnInstructions,
      documentMap: documentArray,
      currentData: [...currentData],
      skipRowsWithData,
      currentIndex: 0,
      status: 'running',
      results: documentArray.map(([rowIndex, doc]) => ({
        rowIndex,
        documentName: doc.stored_filename,
        status: 'pending'
      })),
      documentCache: new Map(),
      lastSaveIndex: -1
    };

    this.currentJob = job;
    this.saveJobToStorage(job);
    this.runAnalysis();
    
    return jobId;
  }

  private async runAnalysis() {
    if (!this.currentJob || this.isRunning) return;
    
    this.isRunning = true;
    const job = this.currentJob;

    try {
      while (job.currentIndex < job.documentMap.length && job.status === 'running') {
        const [rowIndex, document] = job.documentMap[job.currentIndex];
        
        // Update status to analyzing
        job.results[job.currentIndex].status = 'analyzing';
        this.saveJobToStorage(job);
        this.notifyCallbacks();

        try {
          // Check if we should skip this row
          if (job.skipRowsWithData && this.hasExistingData(job.currentData[rowIndex], job.columns)) {
            job.results[job.currentIndex] = {
              ...job.results[job.currentIndex],
              status: 'success',
              error: 'Skipped - row has existing data'
            };
          } else {
            // Perform analysis
            const extractedData = await this.analyzeDocument(document, job.columns, job.columnInstructions, job.documentCache);
            
            if (extractedData && Object.keys(extractedData).length > 0) {
              // Update the data
              if (!job.currentData[rowIndex]) {
                job.currentData[rowIndex] = {};
              }
              
              if (job.skipRowsWithData) {
                // Only add data to empty fields
                Object.keys(extractedData).forEach(key => {
                  if (!job.currentData[rowIndex][key] || job.currentData[rowIndex][key].trim() === '') {
                    job.currentData[rowIndex][key] = extractedData[key];
                  }
                });
              } else {
                // Overwrite existing data
                job.currentData[rowIndex] = {
                  ...job.currentData[rowIndex],
                  ...extractedData
                };
              }

              // Batch saves - save immediately after each document to prevent data loss
              // This ensures extracted data is persisted quickly and visible in UI
              await this.saveProgress(job);
              job.lastSaveIndex = job.currentIndex;
              
              // Dispatch immediate UI update event
              window.dispatchEvent(new CustomEvent('batchAnalysisProgress', {
                detail: { 
                  rowIndex, 
                  extractedData,
                  currentIndex: job.currentIndex,
                  total: job.documentMap.length
                }
              }));
              
              job.results[job.currentIndex] = {
                ...job.results[job.currentIndex],
                status: 'success',
                extractedData
              };
            } else {
              throw new Error('No data extracted from document');
            }
          }
        } catch (error) {
          job.results[job.currentIndex] = {
            ...job.results[job.currentIndex],
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }

        job.currentIndex++;
        this.saveJobToStorage(job);
        this.notifyCallbacks();
        
        // Reduced delay - only add minimal pause for UI updates
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (job.currentIndex >= job.documentMap.length) {
        job.status = 'completed';
        // Final save to ensure all data is persisted
        await this.saveProgress(job);
      }
    } catch (error) {
      job.status = 'error';
      console.error('Background analysis error:', error);
    } finally {
      this.saveJobToStorage(job);
      this.notifyCallbacks();
      this.isRunning = false;
    }
  }

  private async analyzeDocument(
    document: DocumentRecord, 
    columns: string[], 
    columnInstructions: Record<string, string>,
    documentCache: Map<string, string>
  ): Promise<Record<string, string> | null> {
    const extractionFields = columns.map(col => 
      `${col}: ${columnInstructions[col] || 'Extract this field'}`
    ).join('\n');

    try {
      let imageData: string;
      
      // Check cache first
      const cacheKey = document.file_path;
      if (documentCache.has(cacheKey)) {
        imageData = documentCache.get(cacheKey)!;
      } else {
        // Use public URL directly to avoid signed URL overhead
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(document.file_path);
        const documentUrl = data.publicUrl;
        
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        // Cache the converted data for potential reuse
        documentCache.set(cacheKey, imageData);
      }

      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: {
          prompt: `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`,
          imageData,
          fileName: document.stored_filename
        },
      });
      
      if (error) throw error;
      const analysisResult = data;

      if (analysisResult?.generatedText) {
        let extractedData = {};
        try {
          extractedData = JSON.parse(analysisResult.generatedText);
        } catch (e) {
          const jsonMatch = analysisResult.generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Could not extract valid JSON from AI response');
          }
        }

        const filteredData: Record<string, string> = {};
        Object.keys(extractedData).forEach(key => {
          if (columns.includes(key) && extractedData[key]) {
            filteredData[key] = extractedData[key];
          }
        });

        return filteredData;
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing document:', error);
      throw error;
    }
  }

  private hasExistingData(rowData: Record<string, string>, columns: string[]): boolean {
    if (!rowData) return false;
    
    return columns.some(column => {
      const value = rowData[column];
      return value && value.trim() !== '' && 
             !value.toLowerCase().includes('.pdf') && 
             !value.toLowerCase().includes('.png') && 
             !value.toLowerCase().includes('.jpg') && 
             !value.toLowerCase().includes('.jpeg') &&
             !value.toLowerCase().includes('document') &&
             value.length > 5;
    });
  }

  private async saveProgress(job: AnalysisJob) {
    try {
      console.log('🔧 BackgroundAnalyzer: Saving progress with', job.currentData.length, 'rows');

      // Ensure we associate the save with the authenticated user
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        console.warn('BackgroundAnalyzer: No authenticated user found. Skipping save to prevent orphaned data.');
        return;
      }

      // Edge function expects the runsheet payload at the root with snake_case keys
      const payload = {
        name: job.runsheetName,
        columns: job.columns,
        data: job.currentData,
        column_instructions: job.columnInstructions,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      await supabase.functions.invoke('save-runsheet', {
        body: payload,
      });
      
      console.log('🔧 BackgroundAnalyzer: Progress saved successfully');
    } catch (error) {
      console.error('Failed to save progress:', error);
      throw error; // Propagate error to handle it properly
    }
  }

  private saveJobToStorage(job: AnalysisJob) {
    // Exclude cache from storage to avoid localStorage bloat
    const jobToStore = {
      ...job,
      documentCache: undefined // Don't persist cache
    };
    localStorage.setItem('background_analysis_job', JSON.stringify(jobToStore));
  }

  private loadJobFromStorage(): AnalysisJob | null {
    try {
      const stored = localStorage.getItem('background_analysis_job');
      if (!stored) return null;
      
      const job = JSON.parse(stored);
      // Restore cache as empty Map
      if (job) {
        job.documentCache = new Map();
        job.lastSaveIndex = job.lastSaveIndex || -1;
      }
      return job;
    } catch (error) {
      console.error('Error loading job from storage:', error);
      return null;
    }
  }

  private clearJobFromStorage() {
    localStorage.removeItem('background_analysis_job');
  }

  async resumeFromStorage() {
    // Do not auto-resume jobs on page load to avoid unexpected runs
    const storedJob = this.loadJobFromStorage();
    if (storedJob && storedJob.status === 'running') {
      console.log('Found running background analysis in storage; not auto-resuming. Waiting for explicit start.');
      return false;
    }
    return false;
  }

  pauseAnalysis() {
    if (this.currentJob) {
      this.currentJob.status = 'paused';
      this.saveJobToStorage(this.currentJob);
    }
  }

  resumeAnalysis() {
    if (this.currentJob && this.currentJob.status === 'paused') {
      this.currentJob.status = 'running';
      this.saveJobToStorage(this.currentJob);
      this.runAnalysis();
    }
  }

  cancelAnalysis() {
    if (this.currentJob) {
      // Capture job before clearing
      const job = this.currentJob;
      job.status = 'cancelled';
      this.isRunning = false;

      // Broadcast a final cancellation update so UI can hide immediately
      const progress: AnalysisProgress = {
        jobId: job.id,
        total: job.documentMap.length,
        completed: job.currentIndex,
        status: 'cancelled',
        results: job.results,
        currentData: job.currentData,
      };
      this.callbacks.forEach((cb) => cb(progress));

      // Clear state/storage
      this.clearJobFromStorage();
      this.currentJob = null;
    }
  }

  getJobStatus(): AnalysisJob | null {
    return this.currentJob;
  }

  onProgress(callback: (progress: AnalysisProgress) => void): () => void {
    const id = Math.random().toString(36);
    this.callbacks.set(id, callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(id);
    };
  }

  private notifyCallbacks() {
    if (!this.currentJob) return;
    
    const progress: AnalysisProgress = {
      jobId: this.currentJob.id,
      total: this.currentJob.documentMap.length,
      completed: this.currentJob.currentIndex,
      status: this.currentJob.status,
      results: this.currentJob.results,
      currentData: this.currentJob.currentData
    };

    this.callbacks.forEach(callback => callback(progress));
  }
}

export interface AnalysisProgress {
  jobId: string;
  total: number;
  completed: number;
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  results: AnalysisResult[];
  currentData: Record<string, string>[];
}

export const backgroundAnalyzer = BackgroundAnalyzer.getInstance();

// Auto-resume intentionally disabled to prevent unexpected background operations on page load
if (typeof window !== 'undefined') {
  // Resume analysis on page load with better logging
  window.addEventListener('load', () => {
    console.log('Page loaded - checking for background analysis to resume');
    const resumed = backgroundAnalyzer.resumeFromStorage();
    if (resumed) {
      console.log('⚡ Background analysis resumed successfully');
    } else {
      console.log('No background analysis to resume');
    }
  });
  
  // Also try to resume on DOMContentLoaded for faster startup
  window.addEventListener('DOMContentLoaded', () => {
    backgroundAnalyzer.resumeFromStorage();
  });
  
  // Prevent page unload during analysis
  window.addEventListener('beforeunload', (e) => {
    const job = backgroundAnalyzer.getJobStatus();
    if (job && job.status === 'running') {
      e.preventDefault();
      e.returnValue = 'Document analysis is in progress. Leaving now will cancel the analysis. Are you sure?';
      return e.returnValue;
    }
  });
  
  // Prevent navigation during analysis (for modern browsers)
  let navigationWarningShown = false;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    const job = backgroundAnalyzer.getJobStatus();
    if (job && job.status === 'running' && !navigationWarningShown) {
      navigationWarningShown = true;
      if (!confirm('Document analysis is in progress. Navigating away will pause the analysis. Continue?')) {
        navigationWarningShown = false;
        return;
      }
      navigationWarningShown = false;
    }
    return originalPushState.apply(this, args);
  };
  
  history.replaceState = function(...args) {
    const job = backgroundAnalyzer.getJobStatus();
    if (job && job.status === 'running' && !navigationWarningShown) {
      navigationWarningShown = true;
      if (!confirm('Document analysis is in progress. Navigating away will pause the analysis. Continue?')) {
        navigationWarningShown = false;
        return;
      }
      navigationWarningShown = false;
    }
    return originalReplaceState.apply(this, args);
  };
}