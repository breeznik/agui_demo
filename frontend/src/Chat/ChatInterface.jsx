import { HttpAgent } from "@ag-ui/client";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ChatInterface.module.css";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://localhost:8000/agent";
const THREAD_ID = uuidv4();
const MAX_EVENTS = 50;
const MAX_STATE_HISTORY = 25;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID with timestamp and random component
 */
const generateUniqueId = (prefix = "id") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Formats snake_case keys to Title Case
 */
const formatKey = (key) => {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Component to render state values based on their type
 */
const StateValue = ({ value }) => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return <span className={styles.stateValSimple}>—</span>;
  }

  // Handle boolean
  if (typeof value === "boolean") {
    return <span className={styles.stateValBoolean}>{value.toString()}</span>;
  }

  // Handle array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className={styles.stateValSimple}>Empty</span>;
    }
    return (
      <div className={styles.stateValArray}>
        {value.map((item, idx) => (
          <div key={idx} className={styles.stateArrayItem}>
            {typeof item === "object" && item !== null ? (
              Object.entries(item).map(([k, v]) => (
                <div key={k}>
                  <span className={styles.stateObjectKey}>{k}:</span>{" "}
                  <span className={styles.stateObjectValue}>
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))
            ) : (
              <span className={styles.stateObjectValue}>{String(item)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Handle object
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className={styles.stateValSimple}>Empty</span>;
    }
    return (
      <div className={styles.stateValObject}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className={styles.stateObjectKey}>{k}:</span>{" "}
            <span className={styles.stateObjectValue}>
              {typeof v === "object" && v !== null
                ? JSON.stringify(v)
                : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Handle primitives (string, number)
  return <span className={styles.stateValSimple}>{String(value)}</span>;
};

/**
 * Finds the index of the first unescaped quote in a string
 */
const findUnescapedQuote = (str) => {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '"') continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && str[j] === "\\"; j--) backslashes++;
    if (backslashes % 2 === 0) return i;
  }
  return -1;
};

/**
 * Unescapes JSON string fragments
 */
const unescapeJson = (str) =>
  str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\\"/g, '"');

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ChatInterface = () => {
  // Agent configuration
  const [agentUrl, setAgentUrl] = useState(DEFAULT_AGENT_URL);
  const agentRef = useRef(null);
  
  // Message state
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState([]);
  const messageBufferRef = useRef({});
  
  // Event and state tracking
  const [events, setEvents] = useState([]);
  const [statePanel, setStatePanel] = useState({});
  
  // Agent status
  const [isLoading, setIsLoading] = useState(false);
  const [interrupted, setInterrupted] = useState(null);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Auto-scroll refs
  const messagesEndRef = useRef(null);
  const eventsEndRef = useRef(null);
  const textareaRef = useRef(null);

  // ============================================================================
  // AGENT INITIALIZATION
  // ============================================================================

  useEffect(() => {
    const agent = new HttpAgent({
      url: agentUrl,
      threadId: THREAD_ID,
      initialMessages: [],
    });

    agentRef.current = agent;

    return () => {
      agentRef.current?.abortRun?.();
      agentRef.current = null;
    };
  }, [agentUrl]);

  // ============================================================================
  // AUTO-SCROLL EFFECTS
  // ============================================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // ============================================================================
  // AUTOFOCUS EFFECT
  // ============================================================================

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || !agentRef.current || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    // Add to agent's message history and UI
    agentRef.current.messages.push({
      role: "user",
      content: trimmed,
      id: userMessage.id,
    });
    setMessages((prev) => [...prev, userMessage]);
    setMessageText("");
    setIsLoading(true);

    // Build payload for interrupted resume
    const payload = interrupted
      ? {
          resume: { interruptId: interrupted, payload: trimmed },
          forwardedProps: { command: { resume: trimmed } },
        }
      : {};

    if (interrupted) setInterrupted(null);

    try {
      const result = await agentRef.current.runAgent(payload, {
        onRunStartedEvent: () => setIsLoading(true),
        onRunFinishedEvent: () => (messageBufferRef.current = {}),
        onRunErrorEvent: () => {
          messageBufferRef.current = {};
          setIsLoading(false);
        },
        onRunFinalized: () => setIsLoading(false),
        onTextMessageStartEvent: handleMessageStart,
        onTextMessageContentEvent: handleMessageContent,
        onTextMessageEndEvent: handleMessageEnd,
        onCustomEvent: handleCustomEvent,
      });

      // Add any non-streamed messages from result
      addNonStreamedMessages(result?.newMessages);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
    }
  };

  // ============================================================================
  // MESSAGE STREAMING HANDLERS
  // ============================================================================

  const handleMessageStart = (params) => {
    const messageId = params.event.messageId;
    
    messageBufferRef.current[messageId] = {
      buf: "",
      capturing: false,
      capturedText: "",
      done: false,
    };

    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        text: "",
        sender: "agent",
        timestamp: new Date(),
      },
    ]);
  };

  const handleMessageContent = (params) => {
    const { messageId, delta } = params.event;
    const state = messageBufferRef.current[messageId];
    if (!state || state.done) return;

    // Extract chunk from various possible formats
    let chunk = "";
    if (typeof delta === "string") {
      chunk = delta;
    } else {
      const rawChunk = params.event?.rawEvent?.data?.chunk?.content;
      if (typeof rawChunk === "string") {
        chunk = rawChunk;
      } else if (Array.isArray(rawChunk)) {
        chunk = rawChunk
          .map((p) =>
            typeof p === "string"
              ? p
              : p?.text || p?.content || ""
          )
          .join("");
      } else if (rawChunk && typeof rawChunk === "object") {
        chunk = rawChunk.text || rawChunk.content || "";
      }
    }

    if (!chunk) return;
    state.buf += chunk;

    // Start capturing when we find "message":"
    if (!state.capturing) {
      const startMatch = state.buf.match(/\"message\"\s*:\s*\"/);
      if (!startMatch) return;

      state.capturing = true;
      const startIndex = state.buf.indexOf(startMatch[0]) + startMatch[0].length;
      const afterStart = state.buf.slice(startIndex);
      const endIdx = findUnescapedQuote(afterStart);
      const fragment = endIdx >= 0 ? afterStart.slice(0, endIdx) : afterStart;
      const text = unescapeJson(fragment);
      
      if (text) {
        state.capturedText += text;
        updateMessageText(messageId, state.capturedText);
      }
      if (endIdx >= 0) state.done = true;
      return;
    }

    // Continue capturing until closing quote
    const endIdx = findUnescapedQuote(chunk);
    const fragment = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
    const text = unescapeJson(fragment);
    
    if (text) {
      state.capturedText += text;
      updateMessageText(messageId, state.capturedText);
    }
    if (endIdx >= 0) state.done = true;
  };

  const handleMessageEnd = (params) => {
    delete messageBufferRef.current[params.event.messageId];
  };

  const normalizeText = (text) => {
    if (!text) return "";
    return text
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .replace(/\\\"/g, '"');
  };

  const updateMessageText = (messageId, text) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: normalizeText(text) } : m))
    );
  };

  // ============================================================================
  // CUSTOM EVENT HANDLER
  // ============================================================================

  const handleCustomEvent = (params) => {
    const eventName = params.event?.name || "event";
    
    // Handle interrupt events
    if (eventName === "on_interrupt") {
      const id = params.event.rawEvent.split("id='")[1]?.split("'")[0];
      setInterrupted(id);
      addEvent({
        name: "Agent interrupted",
        detail: id,
      });
      return;
    }

    // Extract event data
    const payload = params.event?.value || {};
    const detail = payload?.info || params.event?.rawEvent || "";
    const progress = typeof payload?.progress === "number" ? payload.progress : undefined;
    const stage = payload?.stage;

    // Add to event ticker
    addEvent({ name: eventName, detail, stage, progress });

    // Update state panel if state data provided
    if (payload?.state && typeof payload.state === "object") {
      setStatePanel(payload.state);
    }
  };

  const addEvent = (eventData) => {
    setEvents((prev) =>
      [
        ...prev,
        {
          id: generateUniqueId("evt"),
          timestamp: new Date(),
          ...eventData,
        },
      ].slice(-MAX_EVENTS)
    );
  };

  // ============================================================================
  // NON-STREAMED MESSAGE HANDLER
  // ============================================================================

  const addNonStreamedMessages = (newMessages) => {
    if (!newMessages || newMessages.length === 0) return;

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const existingTexts = new Set(
        prev.map((m) => m.text?.trim()).filter(Boolean)
      );

      const toAdd = newMessages
        .filter((msg) => {
          if (existingIds.has(msg.id)) return false;
          if (!msg.content || !msg.content.trim()) return false;
          if (existingTexts.has(normalizeText(msg.content).trim())) return false;
          if (msg.role === "user") return false;
          return true;
        })
        .map((msg) => ({
          id: msg.id,
          text: normalizeText(msg.content),
          sender: "agent",
          timestamp: new Date(),
        }));

      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  };

  // ============================================================================
  // UI HANDLERS
  // ============================================================================

  const handleSendClick = () => {
    if (isLoading) {
      agentRef.current?.abortRun();
      setIsLoading(false);
    } else {
      sendMessage(messageText);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendClick();
    }
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    
    if (wordCount <= 50) {
      setMessageText(text);
    }
  };

  const isSendEnabled = messageText.trim().length > 0 && !isLoading;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={styles.appShell}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <div className={styles.headerTitle}>AG-UI Demo</div>
            <div className={styles.headerSubtitle}>Agentic UI Framework</div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.headerUrl}>{agentUrl}</div>
            <div className={styles.statusPill}>
              <span className={`${styles.statusDot} ${isLoading ? styles.statusDotActive : ""}`} />
              {isLoading ? "Processing" : "Ready"}
            </div>
            <button 
              className={styles.toggleSidebarButton}
              onClick={() => setShowSidebar(!showSidebar)}
              title="Toggle sidebar"
            >
              📊
            </button>
            <button 
              className={styles.settingsButton}
              onClick={() => setShowSettings(!showSettings)}
              title="Toggle settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Chat Column */}
        <div className={styles.chatColumn}>
          {/* Messages */}
          <div className={styles.messageBoard}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>💬</div>
                <div>Start a conversation with your agent</div>
              </div>
            ) : (
              messages
                .filter((msg) => msg.text && msg.text.trim())
                .map((msg) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div 
                      key={msg.id} 
                      className={`${styles.message} ${isUser ? styles.messageUser : styles.messageAgent}`}
                    >
                      <div className={styles.markdownContent}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <div className={styles.messageMeta}>
                        {isUser ? "You" : "Agent"}
                        {msg.timestamp && ` • ${msg.timestamp.toLocaleTimeString()}`}
                      </div>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className={styles.composerShell}>
            <div className={styles.composerMain}>
              <div className={styles.textareaWrapper}>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  placeholder="Type your message..."
                  value={messageText}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading}
                  rows={1}
                />
              </div>
              <button
                type="button"
                className={`${styles.sendButton} ${isLoading ? styles.sendButtonAbort : ""}`}
                onClick={handleSendClick}
                disabled={!isSendEnabled && !isLoading}
              >
                {isLoading ? "⏹ Abort" : "Send →"}
              </button>
            </div>
            
            {showSettings && (
              <div className={styles.composerFooter}>
                <span className={styles.urlLabel}>Agent URL</span>
                <input
                  className={styles.urlInput}
                  type="text"
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  placeholder="http://localhost:8000/agent"
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Overlay for Mobile */}
        {showSidebar && (
          <div 
            className={`${styles.sidebarOverlay} ${showSidebar ? styles.open : ""}`}
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Sidebar Column */}
        <div className={`${styles.sidebarColumn} ${showSidebar ? styles.open : ""}`}>
          {/* Events Panel */}
          <div className={`${styles.panel} ${styles.eventsPanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Live Events</span>
              <span className={styles.panelBadge}>{events.length}</span>
            </div>
            <div className={styles.panelContent}>
              {events.length === 0 ? (
                <div className={styles.panelEmpty}>No events yet</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className={styles.eventItem}>
                    <div className={styles.eventRow}>
                      <span className={styles.eventDot} />
                      <span className={styles.eventName}>{e.name}</span>
                      <span className={styles.eventTime}>
                        {e.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {e.stage && <div className={styles.eventStage}>→ {e.stage}</div>}
                    {typeof e.progress === "number" && (
                      <div className={styles.progressBarOuter}>
                        <span
                          className={styles.progressBarInner}
                          style={{
                            width: `${Math.max(0, Math.min(100, e.progress))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={eventsEndRef} />
            </div>
          </div>

          {/* State Panel */}
          <div className={`${styles.panel} ${styles.statePanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Agent State</span>
              <span className={styles.panelBadge}>{Object.keys(statePanel).length}</span>
            </div>
            <div className={styles.panelContent}>
              {Object.keys(statePanel).length === 0 ? (
                <div className={styles.panelEmpty}>No state data</div>
              ) : (
                <div className={styles.stateGrid}>
                  {Object.entries(statePanel)
                    .filter(([, value]) => value !== null && value !== undefined && value !== "")
                    .map(([key, value]) => (
                      <div key={key} className={styles.stateRow}>
                        <span className={styles.stateKey}>{formatKey(key)}</span>
                        <StateValue value={value} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatInterface;
