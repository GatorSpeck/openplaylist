import { Chip } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import RadioIcon from '@mui/icons-material/Radio';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import SearchIcon from '@mui/icons-material/Search';

const EntryTypeBadge = ({ type }) => {
  const config = {
    music_file: {
      icon: <MusicNoteIcon />,
      color: 'primary'
    },
    lastfm: {
      icon: <RadioIcon />,
      color: 'error'
    },
    nested_playlist: {
      icon: <PlaylistPlayIcon />,
      color: 'success'
    },
    requested: {
      icon: <SearchIcon />,
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