# AG UI Demo

A minimal demo showing how AG-UI connects an AI-agent backend with a frontend interface using LangGraph and React.

> Work in progress.

## Overview

**Backend stack**  
- FastAPI  
- LangGraph  
- AG-UI protocol (agent ↔ UI events)

**Frontend stack**  
- React.js (in `frontend/`)
- Vanilla JavaScript (in `frontend-vanilla/`)
- AG-UI client (`httpAgent`)

### What AG-UI is  
AG-UI is an **event-based protocol** that defines how an AI agent and a UI exchange messages, intents, and actions.  
It standardizes:
- Agent messages  
- UI → agent intents  
- Agent-driven UI actions  

Docs & reference:  
- [AG-UI Documentation](https://docs.ag-ui.com)  
- [Reference project](https://github.com/rrazvd/ag-ui-adk-react-chat)  

This demo implements the basic AG-UI flow using LangGraph + React.  
Tool-calls and HITL will be added later.

## Prerequisites
- Python 3.10+  
- Node.js 16+  
- Poetry  

## Backend Setup

```bash
cd backend
poetry install
```

Create `.env`:

```env
OPENROUTER_URL=your_openrouter_url
OPENROUTER_API_KEY=your_api_key
```

Run backend:

```bash
poetry run dev
```

## Frontend Setup

### React Version (frontend/)

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`

### Vanilla JavaScript Version (frontend-vanilla/)

```bash
cd frontend-vanilla
npm install
npm run dev
```

Runs on `http://localhost:5174`

Both frontends connect to the same backend and provide identical functionality.

## Project Structure

```
agui_demo/
├── backend/
│   ├── src/
│   │   ├── app.py
│   │   └── graph.py
│   └── pyproject.toml
├── frontend/                    # React version
│   ├── src/
│   │   ├── Chat/
│   │   │   └── ChatInterface.jsx
│   │   └── main.jsx
│   └── package.json
└── frontend-vanilla/            # Vanilla JS version
    ├── src/
    │   ├── main.js
    │   └── styles.css
    ├── index.html
    └── package.json
```

## Features

* Basic AG-UI agent ↔ UI communication
* Simple LangGraph workflow
* Two frontend implementations:
  - **React**: Modern component-based UI
  - **Vanilla JS**: Pure HTML/CSS/JS with no framework dependencies
* HITL (Human-In-The-Loop)
* Real-time message streaming
* Agent interrupt handling
