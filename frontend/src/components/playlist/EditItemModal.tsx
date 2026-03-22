import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import PlaylistEntry from '../../lib/PlaylistEntry';

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PlaylistEntry | null;
  onSave: (editedItem: PlaylistEntry) => void;
}

const EditItemModal: React.FC<EditItemModalProps> = ({ isOpen, onClose, item, onSave }) => {
  if (!item) return null;

  const [editedItem, setEditedItem] = useState<PlaylistEntry>(item);

  const isAlbum = editedItem.getEntryType() === 'requested_album' || editedItem.getEntryType() === 'album';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedItem((prev: PlaylistEntry) => {
      let next = new PlaylistEntry(prev);
      next.details[name] = value;
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(editedItem);
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={`Edit ${isAlbum ? 'Album' : 'Track'} Details`}>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="title" className="text-sm font-medium text-text dark:text-text-dark">{isAlbum ? 'Album Title' : 'Track Title'}</label>
          <input
            id="title"
            name="title"
            type="text"
            value={editedItem.getTitle() || ''}
            onChange={handleChange}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
            required
          />
        </div>
        
        <div className="flex flex-col gap-2">
          <label htmlFor="artist" className="text-sm font-medium text-text dark:text-text-dark">Artist</label>
          <input
            id="artist"
            name="artist"
            type="text"
            value={editedItem.getArtist() || ''}
            onChange={handleChange}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
            required
          />
        </div>
        
        {!isAlbum && (
          <div className="flex flex-col gap-2">
            <label htmlFor="album" className="text-sm font-medium text-text dark:text-text-dark">Album</label>
            <input
              id="album"
              name="album"
              type="text"
              value={editedItem.getAlbum() || ''}
              onChange={handleChange}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
            />
          </div>
        )}
        
        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-muted dark:border-border-dark dark:bg-surface-dark dark:text-text-dark dark:hover:bg-surface-dark-elevated"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-text-dark transition hover:bg-accent-hover"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditItemModal;