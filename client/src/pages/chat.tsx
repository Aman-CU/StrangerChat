import { useSocket } from '@/hooks/useSocket';
import { LandingPage } from '@/components/LandingPage';
import { ChatInterface } from '@/components/ChatInterface';
import { VideoChat } from '@/components/VideoChat';
import { useCallback } from 'react';

export default function Chat() {
  const {
    socketState,
    messages,
    sendMessage,
    joinQueue,
    startVideoChat,
    nextUser,
    reportUser,
    sendWebRTCSignal,
    statusMessage,
    isInitiator
  } = useSocket();

  const isConnecting = socketState === 'connecting';
  const isWaiting = socketState === 'waiting' || socketState === 'video_waiting';
  const isPaired = socketState === 'paired';
  const isVideoPaired = socketState === 'video_paired';
  const showLanding = socketState === 'connected' || socketState === 'disconnected' || isConnecting;

  const goHome = useCallback(() => {
    // Force disconnect current connection and return to landing page
    window.location.reload();
  }, []);

  if (showLanding) {
    return (
      <LandingPage
        onStartChat={joinQueue}
        onStartVideo={startVideoChat}
        statusMessage={statusMessage}
        isConnecting={isConnecting || socketState === 'disconnected'}
      />
    );
  }

  if (isVideoPaired || socketState === 'video_waiting') {
    return (
      <VideoChat
        messages={messages}
        onSendMessage={sendMessage}
        onNextUser={nextUser}
        onReportUser={reportUser}
        onWebRTCSignal={sendWebRTCSignal}
        onGoHome={goHome}
        statusMessage={statusMessage}
        isWaiting={socketState === 'video_waiting'}
        isInitiator={isInitiator}
      />
    );
  }

  return (
    <ChatInterface
      messages={messages}
      onSendMessage={sendMessage}
      onNextUser={nextUser}
      onReportUser={reportUser}
      statusMessage={statusMessage}
      isWaiting={isWaiting}
    />
  );
}
