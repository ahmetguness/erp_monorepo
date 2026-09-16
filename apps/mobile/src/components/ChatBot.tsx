import React from 'react';
import { CopilotModal } from './copilot/CopilotModal';

export interface ChatBotProps {
  initialPrompt?: string;
  showFloatingButton?: boolean;
}

/**
 * Backward-compatible wrapper for the Axon AI Copilot Assistant.
 * Provides the floating action button and overlay chat modal.
 */
export const ChatBot: React.FC<ChatBotProps> = ({
  initialPrompt,
  showFloatingButton = true,
}) => {
  return (
    <CopilotModal
      initialPrompt={initialPrompt}
      showFloatingButton={showFloatingButton}
    />
  );
};
