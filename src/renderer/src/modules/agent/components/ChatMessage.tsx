/**
 * ChatMessage Component.
 * Renders a single message in the agent chat (user or assistant).
 */

import type { ReactNode } from 'react';
import type { AgentMessage } from '../../../../../shared/types/agent';

interface ChatMessageProps {
  message: AgentMessage;
}

export function ChatMessage({ message }: ChatMessageProps): ReactNode {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message chat-message--${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-message__bubble">
        <pre className="chat-message__text">{message.content}</pre>
        {message.isStreaming && (
          <span className="chat-message__cursor" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
