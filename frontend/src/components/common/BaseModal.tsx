import React from 'react';
import { createPortal } from 'react-dom';

const BaseModal = ({ title, options, onClose, onBackdropClick }) => {
  const handleBackdropMouseDown = (e) => {
    // Only close if clicking on the backdrop, not the content.
    if (e.target === e.currentTarget) {
      if (onBackdropClick) {
        onBackdropClick();
      } else {
        onClose();
      }
    }
  };

  const modalMarkup = (
    <div
      className="z-[5000] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="w-full max-w-[500px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded border border-black/10 bg-surface p-5 text-text shadow-lg dark:border-white/20 dark:bg-surface-dark-elevated dark:text-text-dark" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button
            className="rounded px-2 text-2xl leading-none text-text/70 transition hover:bg-black/5 hover:text-text dark:text-text-dark/70 dark:hover:bg-white/10 dark:hover:text-text-dark"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {title ? <h2 className="mb-4 mt-0 text-lg font-semibold">{title}</h2> : null}
        <div className="flex flex-col gap-2">
            {options.map((option, index) => (
                <button
                  key={index}
                  className="w-full rounded border border-black/15 bg-surface-subtle px-3 py-2 text-left text-sm !text-text transition hover:bg-surface-muted dark:border-white/20 dark:bg-surface-dark dark:!text-text-dark dark:hover:bg-surface-dark-elevated"
                  onClick={() => {
                    option.action();
                    onClose();
                  }}
                >
                  {option.label}
                </button>
            ))}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalMarkup;
  }

  return createPortal(modalMarkup, document.body);
};

export default BaseModal;