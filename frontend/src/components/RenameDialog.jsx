import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import { useState, } from 'react';

const RenameDialog = ({ open, onClose, onConfirm, initialName }) => {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(name);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Rename Playlist</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Playlist Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="primary">
            Rename
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default RenameDialog;