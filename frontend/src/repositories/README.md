# Frontend Repositories

This folder is the frontend API boundary. Repositories encapsulate HTTP calls and request/response shaping.

## Modules

- `PlaylistRepository.tsx`
- `LibraryRepository.tsx`
- `YouTubeRepository.tsx`
- `PlexRepository.tsx`
- `LastFMRepository.tsx`
- `OpenAIRepository.tsx`
- `JobRepository.tsx`

## Notes

- Keep endpoint details in this layer rather than components.
- Preserve response shape compatibility with backend routes.
