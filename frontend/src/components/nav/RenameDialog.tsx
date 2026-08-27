import React, { useState } from 'react';
import Modal from '../common/Modal';

const RenameDialog = ({ open, onClose, onConfirm, initialName }) => {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(name);
  };

  return (
    <Modal open={open} onClose={onClose} title="Rename Playlist">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text dark:text-text-dark">Playlist Name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text/50 focus:outline-none focus:ring-1 focus:ring-accent dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark/50"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-sm text-text transition hover:bg-surface-muted dark:border-border-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-text-dark transition hover:bg-accent/90"
          >
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RenameDialog;