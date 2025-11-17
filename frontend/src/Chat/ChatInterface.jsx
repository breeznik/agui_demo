import { HttpAgent } from "@ag-ui/client";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

const initialAgentUrl = "http://localhost:8000/agent";
const initialMessages = [];
const threadId = uuidv4();

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
    flexDirection: "column",
    padding: "24px",
    gap: "16px",
    overflow: "hidden",
  },
  messageBoard: {
    flex: 1,
    overflowY: "auto",
    borderRadius: "18px",
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  emptyState: {
    margin: "auto",
    textAlign: "center",
    opacity: 0.65,
    fontSize: "14px",
  },
  message: (isUser) => ({
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: "70%",
    borderRadius: "16px",
    padding: "12px 16px",
    lineHeight: 1.5,
    background: isUser ? "#2563eb" : "rgba(15, 23, 42, 0.85)",
    border: isUser ? "none" : "1px solid rgba(148, 163, 184, 0.12)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.35)",
  }),
  messageMeta: {
    marginTop: "6px",
    fontSize: "11px",
    opacity: 0.6,
  },
  composerShell: {
    borderRadius: "18px",
    padding: "18px",
    background: "rgba(15, 23, 42, 0.75)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  composerActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },
  textarea: {
    width: "100%",
    minHeight: "90px",
    resize: "vertical",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "15px",
    lineHeight: 1.6,
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    color: "#e2e8f0",
    outline: "none",
  },
  urlInput: {
    flex: 1,
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "13px",
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    color: "#e2e8f0",
    outline: "none",
  },
  primaryButton: (isActive) => ({
    borderRadius: "12px",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    cursor: isActive ? "pointer" : "not-allowed",
    background: isActive ? "linear-gradient(135deg, #2563eb, #7c3aed)" : "#1e293b",
    color: "#f8fafc",
    transition: "transform 0.12s ease, box-shadow 0.12s ease",
    boxShadow: isActive ? "0 12px 30px rgba(59, 130, 246, 0.35)" : "none",
  }),
  ghostButton: {
    borderRadius: "10px",
    padding: "8px 14px",
    fontSize: "13px",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
  },
};

// Helpers to stream only the JSON `message` string value
const findUnescapedQuoteIndex = (str) => {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '"') continue;
    let bs = 0;
    for (let j = i - 1; j >= 0 && str[j] === '\\'; j--) bs++;
    if (bs % 2 === 0) return i; // not escaped
  }
  return -1;
};

const unescapeJsonFragment = (str) =>
  str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\\"/g, '"');

const ChatInterface = () => {
  const [agentUrl, setAgentUrl] = useState(initialAgentUrl);
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const agentRef = useRef(null);
  const messageBufferRef = useRef({});

  useEffect(() => {
    const agent = new HttpAgent({
      url: agentUrl,
      threadId,
      initialMessages,
    });

    agentRef.current = agent;
    console.log("HttpAgent initialised", { agentUrl, threadId });

    return () => {
      if (agentRef.current) {
        agentRef.current.abortRun?.();
        agentRef.current = null;
        console.log("HttpAgent disposed");
      }
    };
  }, [agentUrl]);

  useEffect(() => {
    console.log("Composer text changed", messageText);
  }, [messageText]);

  const sendMessage = async (rawText) => {
    const agent = agentRef.current;
    const trimmed = rawText.trim();

    if (!trimmed) {
      console.log("Ignoring empty payload");
      return;
    }

    if (!agent) {
      console.warn("Agent instance not ready");
      return;
    }

    if (isLoading) {
      console.log("Agent already running; abort or wait for completion");
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      text: trimmed,
      sender: "user",
      timestamp: new Date(),
    };

    console.log("Dispatching user message", userMessage);
    setMessages((prev) => [...prev, userMessage]);
    setMessageText("");

    try {
      console.log("Agent messages before run:", agent.messages);
      console.log("Agent state before run:", agent.state);

      const result = await agent.runAgent(
        {},
        {
          onTextMessageStartEvent: (params) => {
            console.log("Text message started", params.event.messageId);
            // Initialize streaming state for this message
            messageBufferRef.current[params.event.messageId] = {
              buf: "",
              capturing: false,
              capturedText: "",
              done: false,
            };
            
            const newMessage = {
              id: params.event.messageId,
              text: "",
              sender: "agent",
              timestamp: new Date(),
              type: "text",
            };

            console.log("Agent text message start", params.event);
            setMessages((prev) => [...prev, newMessage]);
          },
          onTextMessageContentEvent: (params) => {
            try {
              console.log("Agent text delta", params.event);
              const { delta, messageId } = params.event;
              const state =
                messageBufferRef.current[messageId] ||
                (messageBufferRef.current[messageId] = {
                  buf: "",
                  capturing: false,
                  capturedText: "",
                  done: false,
                });

              // Get string chunk
              let chunk = "";
              if (typeof delta === "string") {
                chunk = delta;
              } else {
                const rawChunk = params.event?.rawEvent?.data?.chunk?.content;
                if (typeof rawChunk === "string") chunk = rawChunk;
                else if (Array.isArray(rawChunk)) {
                  chunk = rawChunk
                    .map((p) =>
                      typeof p === "string"
                        ? p
                        : typeof p?.text === "string"
                        ? p.text
                        : typeof p?.content === "string"
                        ? p.content
                        : ""
                    )
                    .join("");
                } else if (rawChunk && typeof rawChunk === "object") {
                  if (typeof rawChunk.text === "string") chunk = rawChunk.text;
                  else if (typeof rawChunk.content === "string") chunk = rawChunk.content;
                }
              }

              if (!chunk || state.done) return;

              state.buf += chunk;

              // If not yet capturing, look for start of message value
              if (!state.capturing) {
                const startMatch = state.buf.match(/\"message\"\s*:\s*\"/);
                if (!startMatch) return; // ignore anything before message key

                state.capturing = true;
                const startIndex = state.buf.indexOf(startMatch[0]) + startMatch[0].length;
                const afterStart = state.buf.slice(startIndex);
                const endIdx = findUnescapedQuoteIndex(afterStart);
                const frag = endIdx >= 0 ? afterStart.slice(0, endIdx) : afterStart;
                const toAppend = unescapeJsonFragment(frag);
                if (toAppend) {
                  state.capturedText += toAppend;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === messageId ? { ...m, text: state.capturedText } : m))
                  );
                }
                if (endIdx >= 0) state.done = true; // closed the string
                return;
              }

              // Already capturing: append until closing quote
              const endIdx = findUnescapedQuoteIndex(chunk);
              const frag = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
              const toAppend = unescapeJsonFragment(frag);
              if (toAppend) {
                state.capturedText += toAppend;
                setMessages((prev) =>
                  prev.map((m) => (m.id === messageId ? { ...m, text: state.capturedText } : m))
                );
              }
              if (endIdx >= 0) state.done = true;
            } catch (error) {
              console.error("Error processing text delta:", error);
            }
          },
          onTextMessageEndEvent: (params) => {
            console.log("Text message ended", params.event.messageId);
            
            // Clean up buffer
            delete messageBufferRef.current[params.event.messageId];
          },
          onRunFinishedEvent: () => {
            console.log("Agent run finished");
            // Clear all buffers
            messageBufferRef.current = {};
            setAgentRunning(false);
            setIsLoading(false);
          },
          onRunErrorEvent: (params) => {
            console.error("Agent run error", params.event);
            // Clear all buffers on error
            messageBufferRef.current = {};
            setAgentRunning(false);
            setIsLoading(false);
          },
          onRunStartedEvent: () => {
            console.log("Agent run started");
            setAgentRunning(true);
            setIsLoading(true);
          },
          onCustomEvent: (params) => {
            console.log("Custom event received", params.event);

            if (params.event.name === "on_interrupt") {
              console.log("Agent interrupted", params);
            }
          },
        }
      );

      console.log("Agent run result", result);
      console.log("Agent messages after run:", agent.messages);
      console.log("Agent state after run:", agent.state);
    } catch (error) {
      console.error("Error in sendMessage", error);
      // Only log the error, don't treat it as fatal since streaming might have completed
      if (!error.message?.includes("Error in input stream")) {
        console.error("Unexpected error:", error);
      }
      setAgentRunning(false);
      setIsLoading(false);
    }
  };

  const sendInputMessage = () => {
    sendMessage(messageText);
  };

  const abortRun = () => {
    const agent = agentRef.current;

    if (agent && isLoading) {
      console.log("Aborting agent run");
      agent.abortRun();
      setAgentRunning(false);
      setIsLoading(false);
    }
  };

  const onInputButtonClick = () => {
    if (isLoading) {
      abortRun();
      return;
    }

    sendInputMessage();
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onInputButtonClick();
    }
  };

  const isSendEnabled = messageText.trim().length > 0 && !isLoading;

  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div style={styles.headerTitle}>AG UI Experimental Console</div>
        <div style={styles.statusPill}>
          <span style={styles.statusDot(agentRunning)} />
          {agentRunning ? "Agent running" : "Agent idle"}
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.messageBoard}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              Start a conversation to see the live event stream here.
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.sender === "user";
              const timestampLabel = message.timestamp
                ? new Date(message.timestamp).toLocaleTimeString()
                : "";

              return (
                <div key={message.id} style={styles.message(isUser)}>
                  <div>{message.text}</div>
                  <div style={styles.messageMeta}>
                    {isUser ? "You" : "Agent"}
                    {timestampLabel ? ` • ${timestampLabel}` : ""}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section style={styles.composerShell}>
          <textarea
            style={styles.textarea}
            placeholder="Send a message to the agent..."
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isLoading}
          />

          <div style={styles.composerActions}>
            <input
              style={styles.urlInput}
              type="text"
              value={agentUrl}
              onChange={(event) => setAgentUrl(event.target.value)}
              placeholder="Agent endpoint"
            />

            <button
              type="button"
              style={styles.primaryButton(isSendEnabled || isLoading)}
              onClick={onInputButtonClick}
              disabled={!isSendEnabled && !isLoading}
            >
              {isLoading ? "Abort run" : "Send message"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ChatInterface;
