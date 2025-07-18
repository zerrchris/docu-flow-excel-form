import jsPDF from 'jspdf';

export interface CombineOptions {
  type: 'pdf' | 'vertical' | 'grid';
  maxWidth?: number;
  quality?: number;
}

export const combineImages = async (
  files: File[], 
  options: CombineOptions = { type: 'pdf' }
): Promise<{ file: File; previewUrl: string }> => {
  if (files.length === 0) {
    throw new Error('No files provided');
  }

  if (files.length === 1) {
    // Single file, return as-is
    const previewUrl = URL.createObjectURL(files[0]);
    return { file: files[0], previewUrl };
  }

  switch (options.type) {
    case 'pdf':
      return await combineImagesToPdf(files, options);
    case 'vertical':
      return await combineImagesVertically(files, options);
    case 'grid':
      return await combineImagesGrid(files, options);
    default:
      throw new Error('Invalid combination type');
  }
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

const combineImagesToPdf = async (
  files: File[], 
  options: CombineOptions
): Promise<{ file: File; previewUrl: string }> => {
  const pdf = new jsPDF();
  let isFirstPage = true;

  for (const file of files) {
    if (!isFirstPage) {
      pdf.addPage();
    }
    
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Calculate dimensions to fit PDF page
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgRatio = img.width / img.height;
    const pdfRatio = pdfWidth / pdfHeight;
    
    let width, height;
    if (imgRatio > pdfRatio) {
      width = pdfWidth - 20; // 10mm margin on each side
      height = width / imgRatio;
    } else {
      height = pdfHeight - 20; // 10mm margin on top/bottom
      width = height * imgRatio;
    }
    
    canvas.width = width * 2; // Higher resolution
    canvas.height = height * 2;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const imgData = canvas.toDataURL('image/jpeg', options.quality || 0.8);
    pdf.addImage(imgData, 'JPEG', 10, 10, width, height);
    
    URL.revokeObjectURL(img.src);
    isFirstPage = false;
  }

  const pdfBlob = pdf.output('blob');
  const combinedFile = new File([pdfBlob], `combined-images-${Date.now()}.pdf`, {
    type: 'application/pdf',
  });
  
  const previewUrl = URL.createObjectURL(combinedFile);
  return { file: combinedFile, previewUrl };
};

const combineImagesVertically = async (
  files: File[], 
  options: CombineOptions
): Promise<{ file: File; previewUrl: string }> => {
  const images = await Promise.all(files.map(loadImage));
  const maxWidth = options.maxWidth || Math.max(...images.map(img => img.width));
  
  // Calculate total height and scale images
  let totalHeight = 0;
  const scaledImages: { img: HTMLImageElement; width: number; height: number }[] = [];
  
  for (const img of images) {
    const ratio = maxWidth / img.width;
    const scaledWidth = maxWidth;
    const scaledHeight = img.height * ratio;
    scaledImages.push({ img, width: scaledWidth, height: scaledHeight });
    totalHeight += scaledHeight;
  }
  
  // Create combined canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  
  // Draw images vertically
  let currentY = 0;
  for (const { img, width, height } of scaledImages) {
    ctx.drawImage(img, 0, currentY, width, height);
    currentY += height;
    URL.revokeObjectURL(img.src);
  }
  
  // Convert to file
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(resolve as BlobCallback, 'image/jpeg', options.quality || 0.8);
  });
  
  const combinedFile = new File([blob!], `combined-vertical-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
  
  const previewUrl = URL.createObjectURL(combinedFile);
  return { file: combinedFile, previewUrl };
};

const combineImagesGrid = async (
  files: File[], 
  options: CombineOptions
): Promise<{ file: File; previewUrl: string }> => {
  const images = await Promise.all(files.map(loadImage));
  const cols = Math.ceil(Math.sqrt(files.length));
  const rows = Math.ceil(files.length / cols);
  
  // Find consistent cell size
  const cellWidth = Math.max(...images.map(img => img.width)) / 2;
  const cellHeight = Math.max(...images.map(img => img.height)) / 2;
  
  // Create combined canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = cellWidth * cols;
  canvas.height = cellHeight * rows;
  
  // Draw images in grid
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    const x = col * cellWidth;
    const y = row * cellHeight;
    
    // Scale image to fit cell while maintaining aspect ratio
    const imgRatio = img.width / img.height;
    const cellRatio = cellWidth / cellHeight;
    
    let drawWidth, drawHeight, drawX, drawY;
    if (imgRatio > cellRatio) {
      drawWidth = cellWidth;
      drawHeight = cellWidth / imgRatio;
      drawX = x;
      drawY = y + (cellHeight - drawHeight) / 2;
    } else {
      drawWidth = cellHeight * imgRatio;
      drawHeight = cellHeight;
      drawX = x + (cellWidth - drawWidth) / 2;
      drawY = y;
    }
    
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    URL.revokeObjectURL(img.src);
  }
  
  // Convert to file
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(resolve as BlobCallback, 'image/jpeg', options.quality || 0.8);
  });
  
  const combinedFile = new File([blob!], `combined-grid-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
  
  const previewUrl = URL.createObjectURL(combinedFile);
  return { file: combinedFile, previewUrl };
};