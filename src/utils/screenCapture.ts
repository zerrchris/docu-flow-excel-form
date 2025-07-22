/**
 * Screen capture utilities using the browser's Screen Capture API
 */

export interface CaptureResult {
  blob: Blob;
  file: File;
  timestamp: number;
  previewUrl: string;
}

/**
 * Starts a screen capture session and returns a single screenshot
 */
export const captureScreen = async (): Promise<CaptureResult> => {
  try {
    // Request screen capture permission
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    // Create video element to capture the stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    // Wait for video to be ready
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Draw the video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Stop the stream
    stream.getTracks().forEach(track => track.stop());

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, 'image/png', 1.0);
    });

    // Create file from blob
    const timestamp = Date.now();
    const file = new File([blob], `screenshot-${timestamp}.png`, {
      type: 'image/png',
      lastModified: timestamp
    });

    // Create preview URL
    const previewUrl = URL.createObjectURL(blob);

    return {
      blob,
      file,
      timestamp,
      previewUrl
    };

  } catch (error) {
    console.error('Screen capture failed:', error);
    
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Screen capture permission denied. Please allow screen sharing to continue.');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Screen capture is not supported in this browser.');
      } else if (error.name === 'AbortError') {
        throw new Error('Screen capture was cancelled.');
      }
    }
    
    throw new Error('Failed to capture screen. Please try again.');
  }
};

/**
 * Checks if screen capture is supported in the current browser
 */
export const isScreenCaptureSupported = (): boolean => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
};

/**
 * Cleanup function to revoke object URLs
 */
export const cleanupPreviewUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};