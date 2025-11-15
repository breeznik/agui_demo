from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint, LangGraphAgent
import os
import uvicorn
from src.graph import demo_graph

app = FastAPI(title="langgraph demo with agui")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or ["http://localhost:3000"] for security
    allow_credentials=True,  # Add this for cookies/SSE if needed
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = LangGraphAgent(name="graphwrapper", graph=demo_graph)

add_langgraph_fastapi_endpoint(app, agent, "/agent")

def main():
    """Run the uvicorn server."""
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("src.app:app", host="0.0.0.0", port=port, reload=True)
