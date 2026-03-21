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
        className="context-menu"
        style={{ 
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 4000,
          background: 'white',
          color: 'black',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '8px 0',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((option, index) => option ? (
          <div
            key={index}
            className="context-menu-item"
            onClick={() => handleItemClick(option.onClick)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer'
            }}
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