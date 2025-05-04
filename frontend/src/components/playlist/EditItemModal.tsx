import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import '../../styles/EditItemModal.css';
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
      <form onSubmit={handleSubmit} className="edit-form">
        <div className="form-group">
          <label htmlFor="title">{isAlbum ? 'Album Title' : 'Track Title'}</label>
          <input
            id="title"
            name="title"
            type="text"
            value={editedItem.getTitle() || ''}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="artist">Artist</label>
          <input
            id="artist"
            name="artist"
            type="text"
            value={editedItem.getArtist() || ''}
            onChange={handleChange}
            required
          />
        </div>
        
        {!isAlbum && (
          <div className="form-group">
            <label htmlFor="album">Album</label>
            <input
              id="album"
              name="album"
              type="text"
              value={editedItem.getAlbum() || ''}
              onChange={handleChange}
            />
          </div>
        )}
        
        <div className="form-actions">
          <button type="button" onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button type="submit" className="save-button">
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditItemModal;