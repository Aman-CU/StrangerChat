import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, WebRTCSignal } from '@shared/schema';

type SocketState = 'connecting' | 'connected' | 'waiting' | 'paired' | 'video_waiting' | 'video_paired' | 'disconnected';

interface UseSocketReturn {
  socketState: SocketState;
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  joinQueue: () => void;
  startVideoChat: () => void;
  nextUser: () => void;
  reportUser: () => void;
  sendWebRTCSignal: (signal: WebRTCSignal) => void;
  statusMessage: string;
  isInitiator: boolean;
}

export function useSocket(): UseSocketReturn {
  const ws = useRef<WebSocket | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isInitiator, setIsInitiator] = useState(false);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    // Resolve WebSocket endpoint
    // 1) If VITE_WS_URL is set (e.g., client on Vercel, backend elsewhere), use it as-is
    // 2) Otherwise default to same-origin /ws
    let wsUrl: string;
    const envWsUrl = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;
    if (envWsUrl && envWsUrl.trim()) {
      wsUrl = envWsUrl.trim();
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      ws.current = new WebSocket(wsUrl);
      setSocketState('connecting');
      setStatusMessage('Connecting...');
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setSocketState('disconnected');
      setStatusMessage('Connection failed');
      return;
    }

    ws.current.onopen = () => {
      console.log('WebSocket connection opened successfully');
      setSocketState('connected');
      setStatusMessage('Connected! Click "Start Chat" to find someone to talk to.');
    };

    ws.current.onmessage = (event) => {
      try {
        console.log('WebSocket message received:', event.data);
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            console.log('Received connected message, socket ID:', data.socketId);
            setSocketState('connected');
            setStatusMessage('Connected! Click "Start Chat" to find someone to talk to.');
            break;
            
          case 'waiting':
            setSocketState('waiting');
            setStatusMessage(data.message || 'Looking for someone to chat with...');
            setMessages([]); // Clear previous messages
            // Ensure any previous WebRTC connection is cleaned up before next pairing
            window.dispatchEvent(new CustomEvent('partner_disconnected'));
            break;
            
          case 'paired':
            setSocketState('paired');
            setStatusMessage('You are now connected to a stranger!');
            setMessages([]); // Clear previous messages
            setIsInitiator(false);
            break;
            
          case 'video_waiting':
            setSocketState('video_waiting');
            setStatusMessage(data.message || 'Looking for someone to video chat with...');
            setMessages([]); // Clear previous messages
            // Ensure any previous WebRTC connection is cleaned up before next video pairing
            window.dispatchEvent(new CustomEvent('partner_disconnected'));
            break;
            
          case 'video_paired':
            console.log('Video paired received, isInitiator:', data.isInitiator);
            setSocketState('video_paired');
            setStatusMessage('Connected for video chat! Preparing video...');
            setMessages([]); // Clear previous messages
            setIsInitiator(data.isInitiator || false);
            break;
            
          case 'webrtc_signal':
            // This will be handled by the video chat component
            window.dispatchEvent(new CustomEvent('webrtc_signal', { detail: data.signal }));
            break;
            
          case 'webrtc_ready':
            // Signal that WebRTC is ready to start
            window.dispatchEvent(new CustomEvent('webrtc_ready'));
            break;
            
          case 'message':
            setMessages(prev => [...prev, data.message]);
            break;
            
          case 'message_sent':
            setMessages(prev => [...prev, data.message]);
            break;
            
          case 'partner_disconnected':
            // Don't reset to 'connected' - the server should have put us back in queue
            // The server will send the appropriate waiting state message
            setStatusMessage(data.message || 'Your partner has disconnected');
            setMessages([]);
            // Immediately reflect waiting state in UI to avoid stale "Connected" banners
            setSocketState((prev) => {
              if (prev === 'video_paired' || prev === 'video_waiting') {
                return 'video_waiting';
              }
              if (prev === 'paired' || prev === 'waiting') {
                return 'waiting';
              }
              return prev;
            });
            // Signal to VideoChat component to cleanup WebRTC resources
            window.dispatchEvent(new CustomEvent('partner_disconnected'));
            break;
            
          case 'report_submitted':
            setStatusMessage(data.message || 'Report submitted');
            break;
            
          case 'error':
            setStatusMessage(`Error: ${data.message}`);
            break;
            
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      setSocketState('disconnected');
      setStatusMessage('Disconnected from server');
      setMessages([]);
      
      // Only attempt to reconnect if it wasn't a clean close
      if (event.code !== 1000) {
        console.log('Attempting to reconnect in 3 seconds...');
        setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatusMessage('Connection error - retrying...');
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (ws.current?.readyState === WebSocket.OPEN && content.trim()) {
      ws.current.send(JSON.stringify({
        type: 'send_message',
        content: content.trim()
      }));
    }
  }, []);

  const joinQueue = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'join_queue'
      }));
      setStatusMessage('Looking for someone to chat with...');
    }
  }, []);

  const startVideoChat = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'start_video'
      }));
      setStatusMessage('Looking for someone to video chat with...');
    }
  }, []);

  const sendWebRTCSignal = useCallback((signal: WebRTCSignal) => {
    console.log('Sending WebRTC signal via WebSocket:', signal.type);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'webrtc_signal',
        signal
      }));
      console.log('WebRTC signal sent successfully');
    } else {
      console.error('WebSocket not open, cannot send WebRTC signal');
    }
  }, []);

  const nextUser = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const isVideoMode = socketState === 'video_paired' || socketState === 'video_waiting';
      ws.current.send(JSON.stringify({
        type: 'next_user',
        videoMode: isVideoMode
      }));
      setMessages([]);
      setStatusMessage(isVideoMode ? 'Looking for a new person to video chat with...' : 'Looking for a new person to chat with...');
      // Optimistically set waiting state so UI updates immediately
      setSocketState(isVideoMode ? 'video_waiting' : 'waiting');
    }
  }, [socketState]);

  const reportUser = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'report_user'
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  return {
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
  };
}
