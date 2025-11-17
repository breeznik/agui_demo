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
    full_name: Optional[str] = Field(None, description="user's full name")
    email: Optional[str] = Field(None, description="user's email")
    human_input: bool = Field(
        False, description="make it true to ask human question false to continue. don't make it false untill you gett all the information - FUll Name and email"
    )
    message: Optional[str] = Field(None, description="AI messages to human")


class State(MessagesState):
    userinfo: UserInfo
    current_node: str
    should_interrupt: bool


async def node1(state: State):
    messages = state.get("messages", [])
    state["current_node"] = "node1"
    state["should_interrupt"] = False

    instruction = "collect user full username and email from client"
    sm = SystemMessage(instruction)
    slm = local_model.with_structured_output(UserInfoStruct)
    response: UserInfoStruct = await slm.ainvoke(messages + [sm])
    print("AI Response", response)

    user_info = state.get("userinfo", {})
    user_info["full_name"] = response.full_name or ""
    user_info["email"] = response.email or ""
    state["userinfo"] = user_info

    if response.human_input:
        ai_message = response.message if response.message else ""
        state["messages"] = [AIMessage(content=ai_message)]
        state["should_interrupt"] = True
        print("Setting should_interrupt to True")
        return state

    state["current_node"] = "node2"
    return state


async def node2(state: State):
    # dummy node
    messages = state.get("messages", [])
    am = AIMessage("in dummy node")
    messages.append(am)

    return {"messages": messages}


async def interrupt_node(state: State):
    """Interrupt node to get human input and resume processing."""
    print("IN INTERRUPT NODE")
    human_msg = interrupt(value=state['messages'][-1].content if state.get('messages') else "Please provide the requested information")
    state['messages'] = [HumanMessage(content=human_msg)]
    state['should_interrupt'] = False
    return state


def interrupt_or_continue(state: State):
    """Conditional edge to determine if we should interrupt or continue."""
    if state.get('should_interrupt', False):
        return "interrupt_node"
    return state.get("current_node", "node2")


def router(state: State):
    return state["current_node"]


graph_builder = StateGraph(State)

graph_builder.add_node("node1", node1)
graph_builder.add_node("node2", node2)
graph_builder.add_node("interrupt_node", interrupt_node)

graph_builder.set_entry_point("node1")
graph_builder.add_conditional_edges("node1", interrupt_or_continue, ["node1", "node2", "interrupt_node"])
graph_builder.add_edge("interrupt_node", "node1")
graph_builder.add_edge("node2", END)

demo_graph = graph_builder.compile(memory)
