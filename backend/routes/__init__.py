from fastapi import APIRouter

from .playlists import router as playlists_router

router = APIRouter()

router.include_router(playlists_router, prefix="/playlists", tags=["playlists"])
