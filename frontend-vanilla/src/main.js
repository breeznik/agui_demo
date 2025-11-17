import { HttpAgent } from '@ag-ui/client';
import { v4 as uuidv4 } from 'uuid';

// State
let agent = null;
let messages = [];
let isLoading = false;
let agentRunning = false;
let interrupted = null;
let lastRunId = null;
const threadId = uuidv4();
const messageBuffers = {};

// DOM Elements
const messageBoard = document.getElementById('messageBoard');
const emptyState = document.getElementById('emptyState');
const messageInput = document.getElementById('messageInput');
const agentUrlInput = document.getElementById('agentUrl');
const sendButton = document.getElementById('sendButton');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Helpers for streaming JSON message value
const findUnescapedQuoteIndex = (str) => {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '"') continue;
    let bs = 0;
    for (let j = i - 1; j >= 0 && str[j] === '\\'; j--) bs++;
    if (bs % 2 === 0) return i;
  }
  return -1;
};

const unescapeJsonFragment = (str) =>
  str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"');

// Initialize agent
function initializeAgent(url) {
  if (agent) {
    agent.abortRun?.();
  }

  agent = new HttpAgent({
    url,
    threadId,
    initialMessages: [],
  });

  console.log('HttpAgent initialized', { url, threadId });
}

// Update UI state
function updateAgentStatus(running) {
  agentRunning = running;
  if (running) {
    statusDot.classList.add('active');
    statusText.textContent = 'Agent running';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Agent idle';
  }
}

function updateSendButton() {
  const hasText = messageInput.value.trim().length > 0;
  sendButton.disabled = !hasText && !isLoading;
  sendButton.textContent = isLoading ? 'Abort run' : 'Send message';
}

// Render messages
function renderMessages() {
  if (messages.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  
  // Clear existing messages except empty state
  const existingMessages = messageBoard.querySelectorAll('.message');
  existingMessages.forEach(msg => msg.remove());

  messages.forEach((message) => {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.sender}`;
    messageEl.id = `msg-${message.id}`;

    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = message.text;

    const metaEl = document.createElement('div');
    metaEl.className = 'message-meta';
    const timestampLabel = message.timestamp
      ? new Date(message.timestamp).toLocaleTimeString()
      : '';
    metaEl.textContent = `${message.sender === 'user' ? 'You' : 'Agent'}${
      timestampLabel ? ' • ' + timestampLabel : ''
    }`;

    messageEl.appendChild(textEl);
    messageEl.appendChild(metaEl);
    messageBoard.appendChild(messageEl);
  });

  // Scroll to bottom
  messageBoard.scrollTop = messageBoard.scrollHeight;
}

// Update a specific message text
function updateMessageText(messageId, text) {
  const message = messages.find(m => m.id === messageId);
  if (message) {
    message.text = text;
    const messageEl = document.getElementById(`msg-${messageId}`);
    if (messageEl) {
      const textEl = messageEl.querySelector('.message-text');
      if (textEl) {
        textEl.textContent = text;
      }
    }
  }
}

// Send message
async function sendMessage(rawText) {
  const trimmed = rawText.trim();

  if (!trimmed) {
    console.log('Ignoring empty payload');
    return;
  }

  if (!agent) {
    console.warn('Agent instance not ready');
    return;
  }

  if (agentRunning) {
    console.log('Agent still running, please wait');
    return;
  }

  const userMessage = {
    id: `user-${Date.now()}`,
    sender: 'user',
    text: trimmed,
    timestamp: new Date(),
  };

  agent.messages.push({
    role: 'user',
    content: trimmed,
    id: userMessage.id,
  });

  console.log('Dispatching user message', userMessage);
  messages.push(userMessage);
  renderMessages();
  messageInput.value = '';
  updateSendButton();

  updateAgentStatus(true);
  isLoading = true;
  updateSendButton();

  try {
    console.log('Agent messages before run:', agent.messages);
    console.log('Agent state before run:', agent.state);

    const payload = {};
    if (interrupted) {
      payload.resume = {
        interruptId: interrupted,
        payload: userMessage.text,
      };
      payload.forwardedProps = {
        command: {
          resume: userMessage.text,
        },
      };
      interrupted = null;
      lastRunId = null;
    }

    const result = await agent.runAgent(payload, {
      onRunStartedEvent: () => {
        console.log('Agent run started');
        updateAgentStatus(true);
        isLoading = true;
        updateSendButton();
      },
      onRunFinishedEvent: () => {
        console.log('Agent run finished');
        Object.keys(messageBuffers).forEach(key => delete messageBuffers[key]);
      },
      onRunErrorEvent: (params) => {
        console.error('Agent run error', params.event);
        Object.keys(messageBuffers).forEach(key => delete messageBuffers[key]);
        updateAgentStatus(false);
        isLoading = false;
        updateSendButton();
      },
      onRunFinalized: (params) => {
        lastRunId = params.input.runId;
        console.log('Run finalized', params);
        updateAgentStatus(false);
        isLoading = false;
        updateSendButton();
      },
      onTextMessageStartEvent: (params) => {
        console.log('Text message started', params.event.messageId);
        messageBuffers[params.event.messageId] = {
          buf: '',
          capturing: false,
          capturedText: '',
          done: false,
        };

        const newMessage = {
          id: params.event.messageId,
          text: '',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text',
        };

        console.log('Agent text message start', params.event);
        messages.push(newMessage);
        renderMessages();
      },
      onTextMessageContentEvent: (params) => {
        try {
          console.log('Agent text delta', params.event);
          const { delta, messageId } = params.event;
          const state = messageBuffers[messageId] || (messageBuffers[messageId] = {
            buf: '',
            capturing: false,
            capturedText: '',
            done: false,
          });

          let chunk = '';
          if (typeof delta === 'string') {
            chunk = delta;
          } else {
            const rawChunk = params.event?.rawEvent?.data?.chunk?.content;
            if (typeof rawChunk === 'string') chunk = rawChunk;
            else if (Array.isArray(rawChunk)) {
              chunk = rawChunk
                .map((p) =>
                  typeof p === 'string'
                    ? p
                    : typeof p?.text === 'string'
                    ? p.text
                    : typeof p?.content === 'string'
                    ? p.content
                    : ''
                )
                .join('');
            } else if (rawChunk && typeof rawChunk === 'object') {
              if (typeof rawChunk.text === 'string') chunk = rawChunk.text;
              else if (typeof rawChunk.content === 'string')
                chunk = rawChunk.content;
            }
          }

          if (!chunk || state.done) return;

          state.buf += chunk;

          if (!state.capturing) {
            const startMatch = state.buf.match(/"message"\s*:\s*"/);
            if (!startMatch) return;

            state.capturing = true;
            const startIndex = state.buf.indexOf(startMatch[0]) + startMatch[0].length;
            const afterStart = state.buf.slice(startIndex);
            const endIdx = findUnescapedQuoteIndex(afterStart);
            const frag = endIdx >= 0 ? afterStart.slice(0, endIdx) : afterStart;
            const toAppend = unescapeJsonFragment(frag);
            if (toAppend) {
              state.capturedText += toAppend;
              updateMessageText(messageId, state.capturedText);
            }
            if (endIdx >= 0) state.done = true;
            return;
          }

          const endIdx = findUnescapedQuoteIndex(chunk);
          const frag = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
          const toAppend = unescapeJsonFragment(frag);
          if (toAppend) {
            state.capturedText += toAppend;
            updateMessageText(messageId, state.capturedText);
          }
          if (endIdx >= 0) state.done = true;
        } catch (error) {
          console.error('Error processing text delta:', error);
        }
      },
      onTextMessageEndEvent: (params) => {
        console.log('Text message ended', params.event.messageId);
        delete messageBuffers[params.event.messageId];
      },
      onCustomEvent: (params) => {
        console.log('Custom event received', params.event);

        if (params.event.name === 'on_interrupt') {
          console.log('Agent interrupted', params);
          const id = params.event.rawEvent.split("id='")[1]?.split("'")[0];
          interrupted = id;
        }
      },
    });

    console.log('Agent run result', result);
    console.log('Agent messages after run:', agent.messages);
    console.log('Agent state after run:', agent.state);
  } catch (error) {
    console.error('Error in sendMessage', error);
    if (!error.message?.includes('Error in input stream')) {
      console.error('Unexpected error:', error);
    }
    updateAgentStatus(false);
    isLoading = false;
    updateSendButton();
  }
}

function abortRun() {
  if (agent && (isLoading || agentRunning)) {
    console.log('Aborting agent run');
    agent.abortRun();
    updateAgentStatus(false);
    isLoading = false;
    updateSendButton();
  }
}

// Event listeners
messageInput.addEventListener('input', updateSendButton);

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (isLoading) {
      abortRun();
    } else if (messageInput.value.trim().length > 0) {
      sendMessage(messageInput.value);
    }
  }
});

sendButton.addEventListener('click', () => {
  if (isLoading) {
    abortRun();
  } else {
    sendMessage(messageInput.value);
  }
});

agentUrlInput.addEventListener('change', (event) => {
  initializeAgent(event.target.value);
});

// Initialize
initializeAgent(agentUrlInput.value);
updateSendButton();
