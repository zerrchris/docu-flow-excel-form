import React from 'react';

interface TableRowWrapperProps {
  children: React.ReactNode;
}

/**
 * Simple wrapper component to avoid React.Fragment warnings when Lovable runtime
 * tries to add data-lov-id attributes. This prevents high CPU usage from repeated warnings.
 */
const TableRowWrapper: React.FC<TableRowWrapperProps> = ({ children }) => {
  return <>{children}</>;
};

export default TableRowWrapper;