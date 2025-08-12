import React from 'react';

interface LogoMarkProps {
  className?: string;
  title?: string;
}

// RP monogram inside a shield using currentColor so it follows theme tokens
const LogoMark: React.FC<LogoMarkProps> = ({ className = 'h-8 w-8', title = 'RunsheetPro logo' }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Shield */}
      <path
        d="M32 4l22 8v14c0 14-9.5 27-22 32C19.5 53 10 40 10 26V12l22-8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Subtle inner shield accent */}
      <path
        d="M32 9l17 6v11.5C49 39 41.5 49.5 32 53.5 22.5 49.5 15 39 15 26.5V15l17-6z"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      {/* RP monogram */}
      {/* R */}
      <path
        d="M22 20h12c4 0 7 3 7 7s-3 7-7 7h-6v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M28 34l8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* P */}
      <path
        d="M36 22h9c3 0 5 2.2 5 5s-2 5-5 5h-9V22z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default LogoMark;
