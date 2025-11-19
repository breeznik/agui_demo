from langgraph.graph import StateGraph, END, MessagesState
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv
from datetime import datetime
import os

load_dotenv()
base_url: str = os.getenv("OPENROUTER_URL")
api_key: str = os.getenv("OPENROUTER_API_KEY")

memory = MemorySaver()
llm = ChatOpenAI(model="gpt-4o-mini", api_key=api_key, base_url=base_url)

class State(MessagesState):
    route: str
    should_interrupt: bool
    current_booking: dict
    cart: list
    system_date: str

async def emit_event(state: State, name: str, info: dict | None = None):
    payload = {
        "event": name,
        "info": info or {},
        "state": {
            "route": state.get("route"),
            "should_interrupt": state.get("should_interrupt", False),
            "current_booking": state.get("current_booking", {}),
            "cart": state.get("cart", []),
            "system_date": state.get("system_date"),
        },
    }
    await adispatch_custom_event(name, payload)

async def interrupt_node(state: State):
    state["should_interrupt"] = False
    await emit_event(state, "interrupt", {"route": state.get("route")})
    prompt = state.get("messages", [AIMessage(content="Please provide the requested info.")])[-1].content
    human_reply = interrupt(value=prompt)
    state["messages"] = [HumanMessage(content=human_reply)]
    return state

class ScheduleAction(BaseModel):
    """Schedule agent collects trip details and shows flights."""
    human_input: bool = Field(False, description="True if need user response")
    message: Optional[str] = Field(None, description="Message to show user")
    trip_type: Optional[str] = Field(None, description="one-way or roundtrip")
    destination: Optional[str] = Field(None, description="destination city/airport")
    date: Optional[str] = Field(None, description="departure date YYYY-MM-DD")
    passengers: Optional[int] = Field(None, description="number of passengers")
    selected_flight: Optional[str] = Field(None, description="selected flight A, B, or C")
    ready_for_contact: bool = Field(False, description="True when schedule complete and flight selected")

class ContactAction(BaseModel):
    """Contact agent collects passenger details."""
    human_input: bool = Field(False, description="True if need user response")
    message: Optional[str] = Field(None, description="Message to show user")
    passenger_name: Optional[str] = Field(None, description="passenger full name")
    passenger_email: Optional[str] = Field(None, description="passenger email address")
    ready_for_confirmation: bool = Field(False, description="True when contact info complete")

class ConfirmAction(BaseModel):
    """Confirmation agent handles booking confirmation and cart."""
    action: str = Field(description="'confirm' | 'add_to_cart' | 'show_cart' | 'complete'")
    human_input: bool = Field(False, description="True if need user response")
    message: Optional[str] = Field(None, description="Message to show user")

SCHEDULE_SYSTEM = """You are Breeze, a friendly flight booking assistant. Today is {system_date}.

Current booking: {current_booking}

ALWAYS set human_input=true and include a message when responding, UNLESS you're setting ready_for_contact=true.

IF current_booking is empty or has no fields:
- Greet warmly: "Hello! ✈️ I'm Breeze, your friendly flight booking assistant. I'm here to help you find the perfect flight for your journey. Let's get started! Where would you like to fly to?"
- Set human_input=true

IF missing ANY of: trip_type, destination, date, or passengers:
- Extract from user message carefully:
  * "one way"/"oneway"/"oney" = trip_type: "one-way"
  * "jodhpur" = destination
  * "tomorrow" = calculate tomorrow's date based on {system_date}
  * "1 adult" = passengers: 1
- Acknowledge what you got warmly
- Ask for missing info with examples
- Set human_input=true

IF current_booking already has selected_flight field (even if showing in current_booking):
- SKIP showing flights again
- Check if user is responding with A/B/C or similar selection
- If yes, extract it and set selected_flight, ready_for_contact=true, human_input=false
- If not a selection, just set ready_for_contact=true, human_input=false

IF you have ALL of (trip_type AND destination AND date AND passengers) BUT selected_flight is missing or None in current_booking:
- You MUST show flights even if you just collected the last field
- The 'message' field MUST contain the following introduction followed by the flight options:
  "Perfect! Let me find the best flights for you to [destination] on [date]. Here are your options:
  
  ## ✈️ Available Flights
  
  **Option A: IndiGo 6E-2134** 🟢
  - Departure: 08:30 AM → Arrival: 09:45 AM
  - Duration: 1h 15m
  - Price: ₹3,200
  - Aircraft: Airbus A320
  
  **Option B: Air India AI-445** 🔵
  - Departure: 11:00 AM → Arrival: 12:15 PM
  - Duration: 1h 15m
  - Price: ₹4,800
  - Aircraft: Boeing 737
  
  **Option C: SpiceJet SG-892** 🟡
  - Departure: 15:30 PM → Arrival: 16:50 PM
  - Duration: 1h 20m
  - Price: ₹2,900
  - Aircraft: Airbus A320
  
  Which flight works best for you? Please choose **A**, **B**, or **C**. 😊"
- Set human_input=true
- DO NOT set ready_for_contact=true yet

IF user message contains selection like "A", "B", "C", "option A", "flight B", "c", etc:
- Extract the letter (A, B, or C - uppercase)
- Set selected_flight to the uppercase letter
- Set ready_for_contact=true
- Set human_input=false
- Leave message empty or null

Extract and fill: trip_type, destination, date, passengers, selected_flight"""

CONTACT_SYSTEM = """You are Breeze, a friendly flight booking assistant.

Current booking: {current_booking}

IF missing passenger_name OR passenger_email:
- Extract from user message if provided ("John Doe, john@email.com" or "Name: X, Email: Y" or "nikhil rao, email@example.com")
- Your message MUST be: "Great choice! To complete your booking, I just need a couple of details from you. Please provide your **full name** and **email address**. 📧 (I'll send your booking confirmation there!)"
- Set human_input=true
- Set ready_for_confirmation=false

IF you have both passenger_name AND passenger_email:
- Set ready_for_confirmation=true
- Set human_input=false
- Leave message empty or null

Extract and fill: passenger_name, passenger_email"""

CONFIRM_SYSTEM = """You are Breeze, a friendly flight booking assistant.

Current booking: {current_booking}
Cart: {cart} ({cart_count} items)
Last user message: {{last_message}}

CRITICAL: Follow these rules IN ORDER:

1. IF current_booking has data (not empty):
   a) Check if the last user message is a confirmation response (yes/confirm/ok/looks good/correct/perfect/approve/confirm it/mark it done/etc):
      - Set action='add_to_cart', human_input=true
      - Message: "🎉 Awesome! Your booking has been confirmed and added to your cart!\n\nWould you like to:\n- **Book another flight** ✈️\n- **Finish and stop** 🎯\n\nJust let me know!"
   
   b) Otherwise (first time or user asking questions):
      - The 'message' field MUST contain the complete booking summary
      - Format: "## 📋 Your Booking Summary\n\n**Flight Details:**\n- Route: Delhi → [destination]\n- Date: [date]\n- Flight: SpiceJet SG-892 (Option [selected_flight])\n- Passengers: [passengers]\n\n**Passenger Information:**\n- Name: [passenger_name]\n- Email: [passenger_email]\n\n**Total Price: ₹2,900**\n\nEverything looks good? Type **'yes'** to confirm your booking! ✅"
      - Set action='confirm', human_input=true

2. IF current_booking is empty AND cart has items:
   a) User just said words indicating they want another booking (another/more/book another/yes/sure/let's go/etc):
      - Set action='add_to_cart', human_input=false, message=null
      - This will start a NEW booking
   
   b) User just said words indicating they want to finish (finish/done/no/complete/stop/that's all/i'm done/etc):
      - Set action='complete', human_input=false, message=null
   
   c) NO clear user response yet (first time after adding to cart):
      - Set action='add_to_cart', human_input=true
      - Message: "🎉 Awesome! Your booking has been confirmed and added to your cart!\n\nWould you like to:\n- **Book another flight** ✈️\n- **Finish and stop** 🎯\n\nJust let me know!"

Actions: 'confirm', 'add_to_cart', 'show_cart', 'complete'"""

async def schedule_agent(state: State):
    """Collects schedule info and shows flight options."""
    if not state.get("system_date"):
        state["system_date"] = datetime.now().strftime("%Y-%m-%d")
    if not state.get("current_booking"):
        state["current_booking"] = {}
    
    state["route"] = "schedule"
    await emit_event(state, "schedule:start")
    
    messages = state.get("messages", [])
    current = state.get("current_booking", {})
    
    system_msg = SystemMessage(SCHEDULE_SYSTEM.format(
        system_date=state["system_date"],
        current_booking=current if current else "empty"
    ))
    
    slm = llm.with_structured_output(ScheduleAction)
    result: ScheduleAction = await slm.ainvoke(messages + [system_msg])
    
    # Update schedule fields only if provided
    if result.trip_type:
        state["current_booking"]["trip_type"] = result.trip_type
    if result.destination:
        state["current_booking"]["destination"] = result.destination
    if result.date:
        state["current_booking"]["date"] = result.date
    if result.passengers is not None:
        state["current_booking"]["passengers"] = result.passengers
    if result.selected_flight:
        # Ensure uppercase
        state["current_booking"]["selected_flight"] = result.selected_flight.upper()
    
    # Check current state after updates
    has_schedule = (
        state["current_booking"].get("trip_type") and
        state["current_booking"].get("destination") and
        state["current_booking"].get("date") and
        state["current_booking"].get("passengers") is not None
    )
    has_flight = state["current_booking"].get("selected_flight")
    
    # Decision logic
    if result.ready_for_contact or (has_schedule and has_flight):
        # All done with schedule, move to contact
        state["route"] = "contact"
        state["should_interrupt"] = False
        await emit_event(state, "schedule:complete", state["current_booking"])
    elif result.human_input and result.message:
        # LLM needs user input, show message and wait
        state["messages"] = [AIMessage(content=result.message)]
        state["should_interrupt"] = True
        state["route"] = "schedule"
    else:
        # LLM didn't set human_input but we're not ready for contact - re-run
        state["route"] = "schedule"
        state["should_interrupt"] = False
    
    return state

async def contact_agent(state: State):
    """Collects passenger contact details."""
    state["route"] = "contact"
    await emit_event(state, "contact:start")
    
    messages = state.get("messages", [])
    current = state.get("current_booking", {})
    
    system_msg = SystemMessage(CONTACT_SYSTEM.format(
        current_booking=current if current else "empty"
    ))
    
    slm = llm.with_structured_output(ContactAction)
    result: ContactAction = await slm.ainvoke(messages + [system_msg])
    
    # Update contact fields
    if result.passenger_name:
        state["current_booking"]["passenger_name"] = result.passenger_name
    if result.passenger_email:
        state["current_booking"]["passenger_email"] = result.passenger_email
    
    # Check if we have both fields now
    has_name = state["current_booking"].get("passenger_name")
    has_email = state["current_booking"].get("passenger_email")
    
    if result.ready_for_confirmation or (has_name and has_email):
        state["route"] = "confirm"
        state["should_interrupt"] = False
        await emit_event(state, "contact:complete", state["current_booking"])
    elif result.human_input and result.message:
        state["messages"] = [AIMessage(content=result.message)]
        state["should_interrupt"] = True
        state["route"] = "contact"
    else:
        state["route"] = "contact"
        state["should_interrupt"] = False
    
    return state

async def confirm_agent(state: State):
    """Confirms booking and manages cart."""
    if not state.get("cart"):
        state["cart"] = []
    
    state["route"] = "confirm"
    await emit_event(state, "confirm:start")
    
    messages = state.get("messages", [])
    current = state.get("current_booking", {})
    cart = state.get("cart", [])
    
    system_msg = SystemMessage(CONFIRM_SYSTEM.format(
        current_booking=current if current else "empty",
        cart=cart,
        cart_count=len(cart)
    ))
    
    slm = llm.with_structured_output(ConfirmAction)
    result: ConfirmAction = await slm.ainvoke(messages + [system_msg])
    
    if result.action == "confirm":
        # First time - show booking summary and ask for confirmation
        if result.human_input and result.message:
            state["messages"] = [AIMessage(content=result.message)]
            state["should_interrupt"] = True
            state["route"] = "confirm"
        else:
            # Re-run if LLM didn't provide message
            state["route"] = "confirm"
            state["should_interrupt"] = False
    
    elif result.action == "add_to_cart":
        # Check if booking was already added (to prevent duplicates)
        booking_already_added = (
            not state["current_booking"] and 
            len(state["cart"]) > 0
        )
        
        # Add current booking to cart if not already added
        if state["current_booking"] and not booking_already_added:
            state["cart"].append(state["current_booking"].copy())
            await emit_event(state, "cart:added", {"cart": state["cart"]})
            # Clear current booking
            state["current_booking"] = {}
        
        if result.human_input and result.message:
            # First time asking - show message and wait for response
            state["messages"] = [AIMessage(content=result.message)]
            state["should_interrupt"] = True
            state["route"] = "confirm"
        elif not result.human_input:
            # User chose to book another - clear messages and go to schedule
            state["messages"] = []
            state["route"] = "schedule"
            state["should_interrupt"] = False
        else:
            # Shouldn't get here, but stay in confirm to be safe
            state["route"] = "confirm"
            state["should_interrupt"] = True if result.message else False
            if result.message:
                state["messages"] = [AIMessage(content=result.message)]
    
    elif result.action == "complete":
        # Add current booking to cart if not already added
        if state["current_booking"] and state["current_booking"] not in state["cart"]:
            state["cart"].append(state["current_booking"].copy())
            await emit_event(state, "cart:added", {"cart": state["cart"]})
        
        # Show final summary
        cart_count = len(state["cart"])
        summary_msg = f"## 🎉 All Done!\n\n**Total bookings:** {cart_count}\n\nThank you for using Breeze! ✈️\n\nYour confirmation has been sent to your email.\n\n---\n\n*Thank you for using this demo!*"
        state["messages"] = [AIMessage(content=summary_msg)]
        state["route"] = "END"
        state["should_interrupt"] = False
        await emit_event(state, "booking:complete", {"cart": state["cart"]})
    
    elif result.human_input and result.message:
        # Generic case - show message and wait for user response
        state["messages"] = [AIMessage(content=result.message)]
        state["should_interrupt"] = True
        state["route"] = "confirm"
    else:
        # Re-run confirm without interrupt
        state["route"] = "confirm"
        state["should_interrupt"] = False
    
    return state

def route_or_interrupt(state: State):
    if state.get("should_interrupt", False):
        return "interrupt_node"
    route = state.get("route", "schedule")
    if route == "END":
        return END
    return route

def route_from_interrupt(state: State):
    return state.get("route", "schedule")

graph_builder = StateGraph(State)
graph_builder.add_node("schedule", schedule_agent)
graph_builder.add_node("contact", contact_agent)
graph_builder.add_node("confirm", confirm_agent)
graph_builder.add_node("interrupt_node", interrupt_node)

graph_builder.set_entry_point("schedule")
graph_builder.add_conditional_edges("schedule", route_or_interrupt, ["schedule", "contact", "interrupt_node"])
graph_builder.add_conditional_edges("contact", route_or_interrupt, ["contact", "confirm", "interrupt_node"])
graph_builder.add_conditional_edges("confirm", route_or_interrupt, ["confirm", "schedule", "interrupt_node", END])
graph_builder.add_conditional_edges("interrupt_node", route_from_interrupt, ["schedule", "contact", "confirm"])

demo_graph = graph_builder.compile(memory)
