import React, { useState, useEffect, useRef } from 'react';

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

  useEffect(() => {
    // Add click outside handler
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);

    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleItemClick = (onClick) => {
    onClick();
    onClose();
  };

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ 
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: 'white',
        color: 'black',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '8px 0',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}
    >
      {options.map((option, index) => option ? (
        <div
          key={index}
          className="context-menu-item"
          onClick={option.onClick}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            ':hover': {
              backgroundColor: '#f5f5f5'
            }
          }}
        >
          {option.label}
        </div>
      ) : null)}
    </div>
  );
};

export default ContextMenu;