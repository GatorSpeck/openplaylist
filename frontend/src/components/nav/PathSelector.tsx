import React, { useState, useEffect } from 'react';
import { 
  List, 
  ListItem, 
  ListItemText, 
  IconButton, 
  Button, 
  TextField,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Breadcrumbs,
  Link,
  Paper
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import axios from 'axios';

const PathSelector = ({ paths, onChange, isLoading }) => {
  const [newPath, setNewPath] = useState('');
  const [pathError, setPathError] = useState('');
  const [browseDirOpen, setBrowseDirOpen] = useState(false);
  const [currentBrowsePath, setCurrentBrowsePath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [pathHistory, setPathHistory] = useState([]);
  
  // Fetch directories when the browse modal opens or current path changes
  useEffect(() => {
    if (browseDirOpen) {
      fetchDirectories(currentBrowsePath);
    }
  }, [browseDirOpen, currentBrowsePath]);
  
  const fetchDirectories = async (path) => {
    setBrowseLoading(true);
    try {
      const response = await axios.get('/api/browse/directories', {
        params: { current_path: path }
      });
      
      setDirectories(response.data.directories || []);
      setCurrentBrowsePath(response.data.current_path || '');
      
      // Add current path to history if it's new
      if (path && !pathHistory.includes(path)) {
        setPathHistory([...pathHistory, path]);
      }
    } catch (error) {
      console.error('Error fetching directories:', error);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleAddPath = () => {
    if (!newPath.trim()) {
      setPathError('Path cannot be empty');
      return;
    }
    
    // Check if path already exists in the list
    if (paths.includes(newPath.trim())) {
      setPathError('Path already exists');
      return;
    }
    
    // Add the new path
    const updatedPaths = [...paths, newPath.trim()];
    onChange(updatedPaths);
    setNewPath('');
    setPathError('');
  };

  const handleRemovePath = (indexToRemove) => {
    const updatedPaths = paths.filter((_, index) => index !== indexToRemove);
    onChange(updatedPaths);
  };

  const handleBrowse = async () => {
    setBrowseDirOpen(true);
    setCurrentBrowsePath('');
    setPathHistory([]);
  };
  
  const handleDirectoryClick = (dirPath) => {
    setCurrentBrowsePath(dirPath);
  };
  
  const handleParentDirectory = () => {
    if (!currentBrowsePath) return;
    
    const parts = currentBrowsePath.split('/');
    parts.pop(); // Remove the last part
    const parentPath = parts.join('/');
    
    // Handle root directory case
    setCurrentBrowsePath(parentPath || '/');
  };
  
  const handleSelectPath = () => {
    setNewPath(currentBrowsePath);
    setBrowseDirOpen(false);
  };
  
  const handleBreadcrumbClick = (path, index) => {
    // Navigate to the selected breadcrumb
    setCurrentBrowsePath(path);
    
    // Update history by truncating at the clicked index
    setPathHistory(pathHistory.slice(0, index + 1));
  };
  
  // Generate breadcrumbs from the current path
  const renderBreadcrumbs = () => {
    if (!currentBrowsePath) return null;
    
    const parts = currentBrowsePath.split('/').filter(part => part);
    const breadcrumbs = [];
    
    // Add root
    breadcrumbs.push(
      <Link 
        key="root" 
        color="inherit" 
        onClick={() => handleDirectoryClick('/')}
        sx={{ cursor: 'pointer' }}
      >
        /
      </Link>
    );
    
    // Add each path segment
    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath = `${currentPath}/${part}`;
      breadcrumbs.push(
        <Link 
          key={index} 
          color="inherit" 
          onClick={() => handleDirectoryClick(currentPath)}
          sx={{ cursor: 'pointer' }}
        >
          {part}
        </Link>
      );
    });
    
    return (
      <Breadcrumbs 
        separator={<NavigateNextIcon fontSize="small" />} 
        aria-label="breadcrumb"
        sx={{ mb: 2 }}
      >
        {breadcrumbs}
      </Breadcrumbs>
    );
  };

  return (
    <div>
      <h3>Music Library Paths</h3>
      <p>Select directories to be scanned for music files</p>
      
      {isLoading ? (
        <CircularProgress />
      ) : (
        <>
          <List>
            {paths.length === 0 && (
              <ListItem>
                <ListItemText primary="No paths configured. Add a path below." />
              </ListItem>
            )}
            
            {paths.map((path, index) => (
              <ListItem key={index} secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleRemovePath(index)}>
                  <DeleteIcon />
                </IconButton>
              }>
                <ListItemText primary={path} />
              </ListItem>
            ))}
          </List>
          
          <div style={{ display: 'flex', marginTop: '16px', gap: '8px' }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Add directory path"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              error={!!pathError}
              helperText={pathError}
            />
            <Tooltip title="Browse directories">
              <Button 
                variant="contained" 
                onClick={handleBrowse}
              >
                Browse
              </Button>
            </Tooltip>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddPath}
            >
              Add
            </Button>
          </div>
          
          {/* Directory Browser Dialog */}
          <Dialog 
            open={browseDirOpen} 
            onClose={() => setBrowseDirOpen(false)}
            fullWidth
            maxWidth="md"
          >
            <DialogTitle>Browse Directories</DialogTitle>
            <DialogContent>
              {browseLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                  <CircularProgress />
                </div>
              ) : (
                <>
                  {renderBreadcrumbs()}
                  
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2">Current Path: {currentBrowsePath || '/'}</Typography>
                  </Paper>
                  
                  <Button
                    startIcon={<ArrowUpwardIcon />}
                    onClick={handleParentDirectory}
                    sx={{ mb: 2 }}
                    disabled={currentBrowsePath === '/'}
                  >
                    Parent Directory
                  </Button>
                  
                  <List sx={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                    {directories.length === 0 ? (
                      <ListItem>
                        <ListItemText primary="No directories found in this location" />
                      </ListItem>
                    ) : (
                      directories.map((dir, index) => (
                        <ListItem 
                          button 
                          key={index} 
                          onClick={() => handleDirectoryClick(dir.path)}
                          sx={{
                            '&:hover': {
                              backgroundColor: '#f5f5f5',
                            }
                          }}
                        >
                          <FolderIcon sx={{ mr: 2, color: '#FFC107' }} />
                          <ListItemText primary={dir.name} secondary={dir.path} />
                        </ListItem>
                      ))
                    )}
                  </List>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setBrowseDirOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSelectPath} 
                variant="contained" 
                color="primary"
                disabled={!currentBrowsePath}
              >
                Select This Directory
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default PathSelector;