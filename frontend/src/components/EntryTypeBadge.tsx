import MusicNoteIcon from '@mui/icons-material/MusicNote';
import RadioIcon from '@mui/icons-material/Radio';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import SearchIcon from '@mui/icons-material/Search';

const EntryTypeBadge = ({ type }) => {
  const config = {
    music_file: {
      icon: <MusicNoteIcon />,
      colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      label: 'Local Music File'
    },
    lastfm: {
      icon: <RadioIcon />,
      colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      label: 'Last.FM Track'
    },
    nested_playlist: {
      icon: <PlaylistPlayIcon />,
      colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      label: 'Nested Playlist'
    },
    requested: {
      icon: <SearchIcon />,
      colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      label: 'Requested Track'
    }
  };

  if (type === 'requested_album') {
    type = "requested";
  }

  const { icon, label, colorClass } = config[type] || config.music_file;

  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${colorClass}`}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
};

export default EntryTypeBadge;