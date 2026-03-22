import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const SIZE_CLASSES = {
  md: 'max-w-[600px]',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

const Modal = ({ children, title, open, onClose, size = 'md' }) => {
  const maxWidthClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.keyCode === 27) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!open) return null;

  const handleBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalMarkup = (
    <div
      className="z-[5000] flex items-center justify-center overflow-y-auto bg-surface-muted0 px-4 py-6"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[calc(100vh-3rem)] overflow-y-auto rounded border border-border bg-surface text-text shadow-lg dark:border-border-dark dark:bg-surface-dark-elevated dark:text-text-dark`}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border-dark">
          <h2 className="m-0 text-lg font-semibold">{title}</h2>
          <button
            className="rounded px-2 text-2xl leading-none text-text/70 transition hover:bg-surface-muted hover:text-text dark:text-text-dark/70 dark:hover:bg-surface-dark-elevated dark:hover:text-text-dark"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalMarkup;
  }

  return createPortal(modalMarkup, document.body);
};

export default Modal;