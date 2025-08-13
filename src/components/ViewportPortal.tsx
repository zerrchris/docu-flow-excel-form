import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ViewportPortalProps {
  children: React.ReactNode;
}

// Renders children into document.body to ensure true fullscreen overlay
// Useful to avoid position: fixed being constrained by transformed ancestors
const ViewportPortal: React.FC<ViewportPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
};

export default ViewportPortal;
