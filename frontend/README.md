# Frontend

This folder contains the OpenPlaylist React application built with Vite.

## Key Directories

- `src/components/`: feature-oriented UI components
- `src/repositories/`: frontend API boundary for backend calls
- `src/contexts/`: app-level React context providers
- `src/lib/`: shared utilities and hooks
- `src/styles/`: CSS assets for app features and shared surfaces
- `public/`: static assets served directly

## Local Development

Install and run from this folder:

```bash
npm install
npm run dev
```

## Testing And Linting

```bash
npm test
npm run lint
```

## Editing Guidelines

- Keep endpoint and payload shaping logic in `src/repositories/`, not component bodies.
- Preserve performance-sensitive playlist flows in `src/components/playlist/`.
- Maintain dark-mode compatibility for controls, dialogs, and tables.
