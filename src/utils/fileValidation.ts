/**
 * Comprehensive file validation utilities for document uploads
 */

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  fileInfo?: {
    type: 'image' | 'document' | 'unknown';
    size: string;
    extension: string;
  };
}

// Supported file formats configuration
export const SUPPORTED_FORMATS = {
  images: {
    types: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg'],
    maxSize: 50 * 1024 * 1024, // 50MB
    description: 'Images (JPG, PNG, GIF, WebP, BMP, TIFF, SVG)'
  },
  documents: {
    types: [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    extensions: ['.pdf', '.doc', '.docx', '.txt'],
    maxSize: 50 * 1024 * 1024, // 50MB
    description: 'Documents (PDF, DOC, DOCX, TXT)'
  }
};

// Dangerous file extensions that should never be allowed
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.jar', 
  '.zip', '.rar', '.7z', '.tar', '.gz', '.js', '.vbs', 
  '.ps1', '.sh', '.app', '.dmg', '.deb', '.rpm'
];

/**
 * Format file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(lastDotIndex).toLowerCase() : '';
};

/**
 * Determine file type category
 */
export const getFileTypeCategory = (file: File): 'image' | 'document' | 'unknown' => {
  const extension = getFileExtension(file.name);
  
  if (SUPPORTED_FORMATS.images.extensions.includes(extension) || 
      SUPPORTED_FORMATS.images.types.includes(file.type) ||
      file.type.startsWith('image/')) {
    return 'image';
  }
  
  if (SUPPORTED_FORMATS.documents.extensions.includes(extension) || 
      SUPPORTED_FORMATS.documents.types.includes(file.type)) {
    return 'document';
  }
  
  return 'unknown';
};

/**
 * Check if file extension is potentially dangerous
 */
export const isDangerousFile = (filename: string): boolean => {
  const lowerName = filename.toLowerCase();
  return DANGEROUS_EXTENSIONS.some(ext => lowerName.includes(ext));
};

/**
 * Comprehensive file validation
 */
export const validateFile = (file: File): FileValidationResult => {
  console.log('🔧 FileValidation: Validating file:', {
    name: file.name,
    type: file.type,
    size: file.size
  });

  const fileExtension = getFileExtension(file.name);
  const fileType = getFileTypeCategory(file);
  const formattedSize = formatFileSize(file.size);

  // Basic file info
  const fileInfo = {
    type: fileType,
    size: formattedSize,
    extension: fileExtension
  };

  // Check for empty file
  if (file.size === 0) {
    return {
      isValid: false,
      error: `File "${file.name}" is empty (0 bytes). Please select a valid file with content.`,
      fileInfo
    };
  }

  // Check for dangerous file types
  if (isDangerousFile(file.name)) {
    return {
      isValid: false,
      error: `File "${file.name}" contains potentially dangerous content. Only document and image files are allowed for security reasons.`,
      fileInfo
    };
  }

  // Check for invalid filename characters
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      isValid: false,
      error: `File "${file.name}" contains invalid characters in the filename. Please rename the file using only letters, numbers, spaces, hyphens, and underscores.`,
      fileInfo
    };
  }

  // Check file size based on type
  let maxSize = 50 * 1024 * 1024; // Default 50MB
  let formatCategory = '';

  if (fileType === 'image') {
    maxSize = SUPPORTED_FORMATS.images.maxSize;
    formatCategory = 'image';
  } else if (fileType === 'document') {
    maxSize = SUPPORTED_FORMATS.documents.maxSize;
    formatCategory = 'document';
  }

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File "${file.name}" is too large (${formattedSize}). Maximum size for ${formatCategory} files is ${formatFileSize(maxSize)}.`,
      fileInfo
    };
  }

  // Check if file type is supported
  if (fileType === 'unknown') {
    const allExtensions = [...SUPPORTED_FORMATS.images.extensions, ...SUPPORTED_FORMATS.documents.extensions];
    const allDescriptions = [SUPPORTED_FORMATS.images.description, SUPPORTED_FORMATS.documents.description];
    
    return {
      isValid: false,
      error: `File "${file.name}" has an unsupported format${fileExtension ? ` (${fileExtension})` : ''}. Please upload one of the following: ${allDescriptions.join(', ')}.`,
      fileInfo
    };
  }

  // Generate warnings for specific cases
  let warning: string | undefined;

  if (fileType === 'image') {
    if (file.type === 'image/gif' && file.size > 10 * 1024 * 1024) {
      warning = `Large GIF file (${formattedSize}) may take longer to process and could impact performance.`;
    } else if (file.type === 'image/svg+xml') {
      warning = "SVG files are supported, but raster images (PNG, JPG) typically provide better results for document analysis.";
    } else if (file.type === 'image/bmp' || file.type === 'image/tiff') {
      warning = "BMP and TIFF files are supported, but PNG or JPG formats are recommended for better compatibility and smaller file sizes.";
    }
  } else if (fileType === 'document') {
    if (file.type === 'application/pdf') {
      warning = "PDF files are supported, but converting to an image format (PNG/JPG) may provide better analysis results.";
    } else if (file.type === 'application/msword') {
      warning = "Older Word document format (.doc) detected. Consider using the newer .docx format for better compatibility.";
    }
  }

  console.log('🔧 FileValidation: File validation passed:', file.name, 'Type:', fileType);

  return {
    isValid: true,
    warning,
    fileInfo
  };
};

/**
 * Validate multiple files at once
 */
export const validateMultipleFiles = (files: File[]): {
  validFiles: File[];
  invalidFiles: Array<{ file: File; error: string }>;
  warnings: Array<{ file: File; warning: string }>;
} => {
  const validFiles: File[] = [];
  const invalidFiles: Array<{ file: File; error: string }> = [];
  const warnings: Array<{ file: File; warning: string }> = [];

  for (const file of files) {
    const validation = validateFile(file);
    
    if (validation.isValid) {
      validFiles.push(file);
      if (validation.warning) {
        warnings.push({ file, warning: validation.warning });
      }
    } else {
      invalidFiles.push({ file, error: validation.error! });
    }
  }

  return { validFiles, invalidFiles, warnings };
};

/**
 * Check if MIME type matches file extension
 */
export const isMimeTypeConsistent = (file: File): boolean => {
  const extension = getFileExtension(file.name);
  const mimeType = file.type;

  // Common MIME type and extension mappings
  const mimeExtensionMap: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/bmp': ['.bmp'],
    'image/tiff': ['.tiff', '.tif'],
    'image/svg+xml': ['.svg'],
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt']
  };

  if (mimeExtensionMap[mimeType]) {
    return mimeExtensionMap[mimeType].includes(extension);
  }

  // If MIME type is not in our map but starts with image/, check if extension is image-related
  if (mimeType.startsWith('image/')) {
    return SUPPORTED_FORMATS.images.extensions.includes(extension);
  }

  return true; // Allow files we can't verify
};