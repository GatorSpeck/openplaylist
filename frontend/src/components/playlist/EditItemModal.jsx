import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import '../../styles/EditItemModal.css';

const EditItemModal = ({ isOpen, onClose, item, onSave }) => {
  const [editedItem, setEditedItem] = useState({ title: '', artist: '', album: '' });
  const isAlbum = item?.entry_type === 'requested_album' || item?.entry_type === 'album';

  useEffect(() => {
    if (item) {
      setEditedItem({
        title: item.title || '',
        artist: item.artist || '',
        album: item.album || ''
      });
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedItem(prev => ({ ...prev, [name]: value }));
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
            value={editedItem.title}
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
            value={editedItem.artist}
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
              value={editedItem.album}
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