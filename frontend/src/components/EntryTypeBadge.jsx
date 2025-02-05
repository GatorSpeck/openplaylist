import { Chip } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import RadioIcon from '@mui/icons-material/Radio';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import SearchIcon from '@mui/icons-material/Search';

const EntryTypeBadge = ({ type }) => {
  const config = {
    music_file: {
      icon: <MusicNoteIcon />,
      label: '',
      color: 'primary'
    },
    lastfm: {
      icon: <RadioIcon />,
      label: '',
      color: 'error'
    },
    nested_playlist: {
      icon: <PlaylistPlayIcon />,
      label: '',
      color: 'success'
    },
    requested: {
      icon: <SearchIcon />,
      label: '',
      color: 'warning'
    }
  };

  const { icon, label, color } = config[type] || config.music_file;

  return (
    <Chip
      icon={icon}
      label={label}
      color={color}
      size="small"
    />
  );
};

export default EntryTypeBadge;