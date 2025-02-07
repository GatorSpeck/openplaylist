import { Chip, Tooltip } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import RadioIcon from '@mui/icons-material/Radio';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import SearchIcon from '@mui/icons-material/Search';

const EntryTypeBadge = ({ type }) => {
  const config = {
    music_file: {
      icon: <MusicNoteIcon />,
      color: 'primary',
      label: 'Local Music File'
    },
    lastfm: {
      icon: <RadioIcon />,
      color: 'error',
      label: 'Last.FM Track'
    },
    nested_playlist: {
      icon: <PlaylistPlayIcon />,
      color: 'success',
      label: 'Nested Playlist'
    },
    requested: {
      icon: <SearchIcon />,
      color: 'warning',
      label: 'Requested Track'
    }
  };

  const { icon, label, color } = config[type] || config.music_file;

  return (
    <Tooltip title={label}>
      <Chip
        icon={icon}
        color={color}
        size="small"
      />
    </Tooltip>
  );
};

export default EntryTypeBadge;