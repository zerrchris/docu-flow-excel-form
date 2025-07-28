import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

// Configure PDF.js worker - use CDN worker for better compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

console.log('PDF.js configured with worker:', pdfjsLib.GlobalWorkerOptions.workerSrc);

export interface PDFPage {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  blob: Blob;
}

/**
 * Convert a PDF file to image blobs (one per page)
 * @param file - The PDF file to convert
 * @param scale - Scale factor for the output images (default: 2 for high quality)
 * @returns Array of image blobs, one per page
 */
export const convertPDFToImages = async (file: File, scale: number = 2): Promise<PDFPage[]> => {
  try {
    console.log('🔧 PDF_CONVERSION: Starting PDF to image conversion...', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });
    
    // Validate file
    if (!file || file.size === 0) {
      throw new Error('Invalid file: File is empty or undefined');
    }
    
    if (!isPDF(file)) {
      throw new Error('Invalid file: File is not a PDF');
    }
    
    console.log('🔧 PDF_CONVERSION: File validation passed, reading array buffer...');
    
    // Convert file to array buffer with timeout
    const arrayBuffer = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File reading timeout')), 10000)
      )
    ]);
    
    console.log('🔧 PDF_CONVERSION: File read successfully, size:', arrayBuffer.byteLength);
    
    console.log('🔧 PDF_CONVERSION: Loading PDF document...');
    
    // Load the PDF document with timeout
    const pdf = await Promise.race([
      pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true,
        verbosity: 0, // Reduce console noise
      }).promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('PDF loading timeout')), 20000)
      )
    ]);
    
    console.log(`PDF loaded with ${pdf.numPages} pages`);
    
    if (pdf.numPages === 0) {
      throw new Error('PDF has no pages');
    }
    
    const pages: PDFPage[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`Processing page ${pageNum}/${pdf.numPages}`);
      
      const page = await pdf.getPage(pageNum);
      
      // Get viewport for the page
      const viewport = page.getViewport({ scale });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error(`Failed to get canvas context for page ${pageNum}`);
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error(`Failed to create blob for page ${pageNum}`));
            }
          },
          'image/png',
          0.95
        );
      });
      
      pages.push({
        canvas,
        pageNumber: pageNum,
        blob
      });
      
      console.log(`Page ${pageNum} converted successfully`);
    }
    
    console.log(`PDF conversion complete: ${pages.length} pages converted`);
    return pages;
    
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Create a File object from a blob with a specific name
 */
export const createFileFromBlob = (blob: Blob, fileName: string): File => {
  return new File([blob], fileName, { type: blob.type });
};

/**
 * Check if a file is a PDF
 */
export const isPDF = (file: File): boolean => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};