from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import os
import logging
from repositories.spotify_repository import SpotifyRepository, get_spotify_repository, SpotifyTokenManager
from typing import Optional
import urllib.parse

# Add this to your routes.py file
spotify_router = APIRouter(prefix="/spotify", tags=["spotify"])

@spotify_router.get("/login")
def spotify_login(username: Optional[str] = None):
    """Start the Spotify OAuth login flow"""
    try:
        # Create a new repository instance for the login process
        spotify_repo = SpotifyRepository(username=username)
        
        # Get the authorization URL
        auth_url = spotify_repo.get_auth_url()
        logging.info(f"Generated Spotify auth URL: {auth_url}")
        
        # Redirect to Spotify for authentication
        return RedirectResponse(url=auth_url)
    except Exception as e:
        logging.error(f"Error starting Spotify login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start login: {str(e)}")

@spotify_router.get("/callback")
async def spotify_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),  # Make state optional
    error: Optional[str] = None,
    username: Optional[str] = None
):
    """Handle the Spotify OAuth callback"""
    if error:
        logging.error(f"Spotify authentication error: {error}")
        return {"error": error, "message": "Authentication failed"}
    
    try:
        logging.info(f"Received Spotify callback with code: {code[:5]}...")
        
        # Initialize repository and handle the callback
        spotify_repo = SpotifyRepository(username=username)
        success = spotify_repo.handle_oauth_callback(code)
        
        if not success:
            logging.error("Failed to authenticate with Spotify")
            raise HTTPException(status_code=400, detail="Failed to authenticate with Spotify")
        
        # Get user info to confirm authentication
        user_info = spotify_repo.get_current_user()
        logging.info(f"Successfully authenticated Spotify user: {user_info.get('display_name')}")
        
        # Redirect to a success page or return the user info
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        success_url = f"{frontend_url}/spotify-connected?username={urllib.parse.quote(user_info.get('display_name', 'User'))}"
        logging.info(f"Redirecting to: {success_url}")
        
        return RedirectResponse(url=success_url)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error processing Spotify callback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing authentication: {str(e)}")

@spotify_router.get("/me")
def get_spotify_me(spotify: SpotifyRepository = Depends(get_spotify_repository)):
    """Get the current Spotify user's information"""
    if not spotify.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
    
    return spotify.get_current_user()

@spotify_router.get("/playlists")
def get_spotify_playlists(spotify: SpotifyRepository = Depends(get_spotify_repository)):
    """Get the current user's playlists"""
    if not spotify.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
    
    current_user = spotify.get_current_user()
    return spotify.sp.user_playlists(current_user["id"])

@spotify_router.get("/playlist/{playlist_id}")
def get_spotify_playlist(playlist_id: str, spotify: SpotifyRepository = Depends(get_spotify_repository)):
    """Get a specific Spotify playlist"""
    if not spotify.is_authenticated():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")
    
    return spotify.get_playlist(playlist_id)

@spotify_router.get("/logout")
def spotify_logout(username: Optional[str] = None):
    """Log out from Spotify (clear token cache)"""
    token_manager = SpotifyTokenManager(username=username)
    token_manager.clear_token()
    return {"status": "success", "message": "Logged out successfully"}

@spotify_router.get("/status")
def spotify_status(username: Optional[str] = None):
    """Get the current Spotify authentication status"""
    result = {
        "authenticated": False,
        "error": None,
        "user": None,
    }
    
    try:
        spotify_repo = SpotifyRepository(username=username)
        
        if spotify_repo.is_authenticated():
            user_info = spotify_repo.get_current_user()
            result["authenticated"] = True
            result["user"] = {
                "id": user_info.get("id"),
                "display_name": user_info.get("display_name"),
                "email": user_info.get("email"),
            }
        else:
            if spotify_repo.token_manager:
                # Try to get the auth URL for the frontend to use
                result["auth_url"] = spotify_repo.get_auth_url()
            else:
                result["error"] = "No token manager available"
    except Exception as e:
        result["error"] = str(e)
        logging.error(f"Error checking Spotify status: {e}")
    
    return result