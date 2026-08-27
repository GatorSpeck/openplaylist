import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ContextMenu = ({ x, y, options, onClose }) => {
  const [position, setPosition] = useState({ x, y });
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let newY = y;
    let newX = x;

    // Check vertical overflow
    if (y + rect.height > viewport.height) {
      newY = Math.max(0, viewport.height - rect.height);
    }

    // Check horizontal overflow
    if (x + rect.width > viewport.width) {
      newX = Math.max(0, viewport.width - rect.width);
    }

    setPosition({ x: newX, y: newY });
  }, [x, y]);

  const handleItemClick = (onClick) => {
    onClick();
    onClose();
  };

  const menuMarkup = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3999,
      }}
      onMouseDown={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div 
        ref={menuRef}
        className="context-menu min-w-40 overflow-hidden rounded border border-border bg-surface py-1 text-text shadow-sm dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark"
        style={{ 
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 4000,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((option, index) => option ? (
          <div
            key={index}
            className="context-menu-item cursor-pointer px-4 py-2 hover:bg-surface-subtle dark:hover:bg-surface-dark"
            onClick={() => handleItemClick(option.onClick)}
          >
            {option.label}
          </div>
        ) : null)}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return menuMarkup;
  }

  return createPortal(menuMarkup, document.body);
};

export default ContextMenu;