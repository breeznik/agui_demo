from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from typing import TypedDict, Literal, Any
from pydantic import BaseModel, Field
from typing import Optional
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import os
from langgraph.types import interrupt
from langgraph.graph import MessagesState

load_dotenv()
base_url: str = os.getenv("OPENROUTER_URL")
api_key: str = os.getenv("OPENROUTER_API_KEY")

memory = MemorySaver()

local_model = ChatOpenAI(model="gpt-4o-mini", api_key=api_key, base_url=base_url)


class UserInfo(TypedDict):
    full_name: str
    email: str
    ask: bool


class UserInfoStruct(BaseModel):
    # full_name: Optional[str] = Field(None, description="user's full name")
    # email: Optional[str] = Field(None, description="user's email")
    human_input: bool = Field(
        False, description="make it true to ask human question false to continue."
    )
    message: Optional[str] = Field(None, description="AI messages to human")


class State(MessagesState):
    userinfo: UserInfo
    current_node: str


async def node1(state: State):
    messages = state.get("messages", [])
    state["current_node"] = "node1"

    instruction = "write 500 words pargraph on any topic"
    sm = SystemMessage(instruction)
    slm = local_model.with_structured_output(UserInfoStruct)
    response: UserInfoStruct = await slm.ainvoke(messages + [sm])
    print("AI Response", response)

    user_info = state.get("userinfo", {})
    user_info["full_name"] = response.full_name or ""
    user_info["email"] = response.email or ""
    state["userinfo"] = user_info

    if response.human_input:
        print("running before interrupt")
        print("printing messages", messages)
        result = interrupt(response.message)
        print("after interrupt")
        state["messages"].append(AIMessage(response.message))
        state["messages"].append(HumanMessage(result))
        state["current_node"] = "node1"
        return state

    state["current_node"] = "node2"
    return state


async def node2(state: State):
    # dummy node
    messages = state.get("messages", [])
    am = AIMessage("in dummy node")
    messages.append(am)

    return {"messages": messages}


def router(state: State):
    return state["current_node"]


graph_builder = StateGraph(State)

graph_builder.add_node("node1", node1)
graph_builder.add_node("node2", node2)
graph_builder.set_entry_point("node1")
graph_builder.add_conditional_edges("node1", router, ["node1", "node2"])
graph_builder.add_edge("node2", END)

demo_graph = graph_builder.compile(memory)
