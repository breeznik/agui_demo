import { HttpAgent } from "@ag-ui/client";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_AGENT_URL = "http://localhost:8000/agent";
const THREAD_ID = uuidv4();
const MAX_EVENTS = 50;
const MAX_STATE_HISTORY = 25;

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  appShell: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    padding: "16px 24px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(12px)",
  },
  headerTitle: {
    fontSize: "18px",
    fontWeight: 600,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "13px",
    background: "rgba(51, 65, 85, 0.55)",
  },
  statusDot: (isActive) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: isActive ? "#22c55e" : "#64748b",
    boxShadow: isActive ? "0 0 12px rgba(34, 197, 94, 0.65)" : "none",
  }),
  main: {
    flex: 1,
    display: "flex",
    gap: "16px",
    padding: "16px",
    overflow: "hidden",
  },
  leftPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minWidth: 0,
  },
  rightPanel: {
    width: "380px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    overflow: "hidden",
  },
  messageBoard: {
    flex: 1,
    overflowY: "auto",
    borderRadius: "16px",
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    margin: "auto",
    textAlign: "center",
    opacity: 0.65,
    fontSize: "14px",
  },
  message: (isUser) => ({
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: "75%",
    borderRadius: "14px",
    padding: "10px 14px",
    lineHeight: 1.5,
    fontSize: "14px",
    background: isUser ? "#2563eb" : "rgba(15, 23, 42, 0.85)",
    border: isUser ? "none" : "1px solid rgba(148, 163, 184, 0.12)",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.25)",
  }),
  messageContent: {
    // Markdown content container
  },
  messageMeta: {
    marginTop: "4px",
    fontSize: "11px",
    opacity: 0.6,
  },
  composerShell: {
    borderRadius: "16px",
    padding: "16px",
    background: "rgba(15, 23, 42, 0.75)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  composerActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },
  textarea: {
    width: "100%",
    minHeight: "70px",
    resize: "vertical",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    lineHeight: 1.5,
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    color: "#e2e8f0",
    outline: "none",
  },
  urlInput: {
    flex: 1,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    color: "#e2e8f0",
    outline: "none",
  },
  primaryButton: (isActive) => ({
    borderRadius: "10px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    cursor: isActive ? "pointer" : "not-allowed",
    background: isActive ? "linear-gradient(135deg, #2563eb, #7c3aed)" : "#1e293b",
    color: "#f8fafc",
    transition: "transform 0.12s ease, box-shadow 0.12s ease",
    boxShadow: isActive ? "0 8px 20px rgba(59, 130, 246, 0.3)" : "none",
  }),
  eventsPanel: {
    borderRadius: "14px",
    padding: "14px",
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
    minHeight: 0,
  },
  panelHeader: {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.7,
    marginBottom: "4px",
  },
  eventsStream: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 6,
  },
  eventsEmpty: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: "center",
    padding: "20px 0",
  },
  eventItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.4)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
  eventRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    background: "#38bdf8",
    boxShadow: "0 0 8px rgba(56, 189, 248, 0.6)",
    flexShrink: 0,
  },
  eventName: {
    flex: 1,
    fontSize: 13,
    fontWeight: 500,
  },
  eventTime: {
    opacity: 0.5,
    fontSize: 11,
  },
  eventStage: {
    fontSize: 11,
    opacity: 0.6,
    marginLeft: 14,
  },
  progressBarOuter: {
    marginLeft: 14,
    width: "100%",
    height: 4,
    borderRadius: 4,
    background: "rgba(148, 163, 184, 0.15)",
    overflow: "hidden",
  },
  progressBarInner: {
    display: "block",
    height: "100%",
    background: "linear-gradient(90deg, #38bdf8, #22c55e)",
    transition: "width 0.3s ease",
  },
  statePanel: {
    borderRadius: "14px",
    padding: "14px",
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "45%",
    minHeight: 0,
  },
  stateGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflowY: "auto",
    paddingRight: 4,
  },
  stateRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(2, 6, 23, 0.4)",
    border: "1px solid rgba(148, 163, 184, 0.06)",
  },
  stateKey: {
    opacity: 0.65,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stateVal: {
    fontWeight: 600,
    fontSize: 13,
    color: "#38bdf8",
  },
};

// ============================================================================
// MARKDOWN STYLES
// ============================================================================

const markdownStyles = `
  .markdown-content {
    color: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .markdown-content > *:first-child {
    margin-top: 0;
  }

  .markdown-content > *:last-child {
    margin-bottom: 0;
  }

  .markdown-content h1,
  .markdown-content h2,
  .markdown-content h3,
  .markdown-content h4,
  .markdown-content h5,
  .markdown-content h6 {
    margin-top: 16px;
    margin-bottom: 8px;
    font-weight: 600;
    line-height: 1.25;
  }

  .markdown-content h1 {
    font-size: 1.5em;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding-bottom: 4px;
  }

  .markdown-content h2 {
    font-size: 1.3em;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    padding-bottom: 4px;
  }

  .markdown-content h3 {
    font-size: 1.15em;
  }

  .markdown-content h4 {
    font-size: 1.05em;
  }

  .markdown-content p {
    margin: 8px 0;
  }

  .markdown-content ul,
  .markdown-content ol {
    margin: 8px 0;
    padding-left: 24px;
  }

  .markdown-content li {
    margin: 4px 0;
  }

  .markdown-content code {
    background: rgba(100, 116, 139, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
  }

  .markdown-content pre {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 12px;
    margin: 12px 0;
    overflow-x: auto;
  }

  .markdown-content pre code {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: 0.85em;
  }

  .markdown-content blockquote {
    border-left: 3px solid rgba(148, 163, 184, 0.3);
    padding-left: 12px;
    margin: 12px 0;
    opacity: 0.9;
    font-style: italic;
  }

  .markdown-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
  }

  .markdown-content th,
  .markdown-content td {
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 8px 12px;
    text-align: left;
  }

  .markdown-content th {
    background: rgba(15, 23, 42, 0.6);
    font-weight: 600;
  }

  .markdown-content tr:nth-child(even) {
    background: rgba(15, 23, 42, 0.3);
  }

  .markdown-content a {
    color: #60a5fa;
    text-decoration: none;
  }

  .markdown-content a:hover {
    text-decoration: underline;
  }

  .markdown-content hr {
    border: none;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    margin: 16px 0;
  }

  .markdown-content strong {
    font-weight: 600;
  }

  .markdown-content em {
    font-style: italic;
  }

  .markdown-content img {
    max-width: 100%;
    border-radius: 4px;
  }

  .markdown-content input[type="checkbox"] {
    margin-right: 6px;
  }
`;

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
  
  // Auto-scroll refs
  const messagesEndRef = useRef(null);
  const eventsEndRef = useRef(null);

  // ============================================================================
  // INJECT MARKDOWN STYLES
  // ============================================================================

  useEffect(() => {
    const styleId = "markdown-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = markdownStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

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

  const isSendEnabled = messageText.trim().length > 0 && !isLoading;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={styles.appShell}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>Agent Chat</div>
        <div style={styles.statusPill}>
          <span style={styles.statusDot(isLoading)} />
          {isLoading ? "Agent running" : "Agent idle"}
        </div>
      </header>

      <main style={styles.main}>
        {/* Left Panel: Chat */}
        <section style={styles.leftPanel}>
          {/* Messages */}
          <div style={styles.messageBoard}>
            {messages.length === 0 ? (
              <div style={styles.emptyState}>Start a conversation with the agent.</div>
            ) : (
              messages
                .filter((msg) => msg.text && msg.text.trim())
                .map((msg) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div key={msg.id} style={styles.message(isUser)}>
                      <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <div style={styles.messageMeta}>
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
          <div style={styles.composerShell}>
            <textarea
              style={styles.textarea}
              placeholder="Type your message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isLoading}
            />
            <div style={styles.composerActions}>
              <input
                style={styles.urlInput}
                type="text"
                value={agentUrl}
                onChange={(e) => setAgentUrl(e.target.value)}
                placeholder="Agent endpoint URL"
              />
              <button
                type="button"
                style={styles.primaryButton(isSendEnabled || isLoading)}
                onClick={handleSendClick}
                disabled={!isSendEnabled && !isLoading}
              >
                {isLoading ? "Abort" : "Send"}
              </button>
            </div>
          </div>
        </section>

        {/* Right Panel: Events & State */}
        <section style={styles.rightPanel}>
          {/* Events */}
          <div style={styles.eventsPanel}>
            <div style={styles.panelHeader}>Live Events</div>
            <div style={styles.eventsStream}>
              {events.length === 0 ? (
                <div style={styles.eventsEmpty}>No events yet</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} style={styles.eventItem}>
                    <div style={styles.eventRow}>
                      <span style={styles.eventDot} />
                      <span style={styles.eventName}>{e.name}</span>
                      <span style={styles.eventTime}>
                        {e.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {e.stage && <div style={styles.eventStage}>{e.stage}</div>}
                    {typeof e.progress === "number" && (
                      <div style={styles.progressBarOuter}>
                        <span
                          style={{
                            ...styles.progressBarInner,
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

          {/* State */}
          <div style={styles.statePanel}>
            <div style={styles.panelHeader}>State</div>
            {Object.keys(statePanel).length === 0 ? (
              <div style={styles.eventsEmpty}>No state yet</div>
            ) : (
              <div style={styles.stateGrid}>
                {Object.entries(statePanel)
                  .filter(([, value]) => value !== null && value !== undefined && value !== "")
                  .map(([key, value]) => (
                    <div key={key} style={styles.stateRow}>
                      <span style={styles.stateKey}>{formatKey(key)}</span>
                      <span style={styles.stateVal}>
                        {typeof value === "object" && value !== null
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ChatInterface;
