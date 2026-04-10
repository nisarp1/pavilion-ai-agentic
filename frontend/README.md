# PavilionEnd Frontend

React SPA frontend for PavilionEnd CMS.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file if you need to point the frontend at a non-default API host:
```bash
cp .env.example .env
# update VITE_API_BASE_URL inside .env if needed
```

3. Start development server:
```bash
npm run dev
```

The app will be available at http://localhost:3001 by default (see `vite.config.js`).

## Build

To build for production:
```bash
npm run build
```

## Features

- React 18 with Hooks
- Redux Toolkit for state management
- React Router for navigation
- CKEditor 5 for rich text editing
- Tailwind CSS for styling
- Axios for API calls
- JWT authentication

## Environment variables

The frontend reads the following variables from `.env` (or the shell):

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base URL used for all API requests. Set this to your backend root (e.g. `http://localhost:8000/api`) when the frontend is served from a different origin and no dev proxy is available. |

