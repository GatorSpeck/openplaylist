import { Alert, Snackbar as MUISnackbar } from '@mui/material';

const Snackbar = ({ open, message, severity, onClose }) => {
  return (
    <MUISnackbar
      open={open}
      autoHideDuration={6000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert onClose={onClose} severity={severity}>
        {message}
      </Alert>
    </MUISnackbar>
  );
};

export default Snackbar;