import React, { useEffect } from 'react';

const Modal = ({ children, title, open, onClose }) => {
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

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded border border-black/10 bg-surface text-text shadow-lg dark:border-white/20 dark:bg-surface-dark-elevated dark:text-text-dark"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/15">
          <h2 className="m-0 text-lg font-semibold">{title}</h2>
          <button
            className="rounded px-2 text-2xl leading-none text-text/70 transition hover:bg-black/5 hover:text-text dark:text-text-dark/70 dark:hover:bg-white/10 dark:hover:text-text-dark"
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
};

export default Modal;