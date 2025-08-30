import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  SkipForward, 
  Flag, 
  Users,
  Send,
  MessageSquare,
  Home,
  Moon,
  Sun,
  SplitSquareHorizontal,
  Square,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useWebRTC } from '@/hooks/useWebRTC';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ChatMessage, WebRTCSignal } from '@shared/schema';

interface VideoChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onNextUser: () => void;
  onReportUser: () => void;
  onWebRTCSignal: (signal: WebRTCSignal) => void;
  onGoHome?: () => void;
  statusMessage: string;
  isWaiting: boolean;
  isInitiator: boolean;
}

export function VideoChat({ 
  messages, 
  onSendMessage, 
  onNextUser, 
  onReportUser, 
  onWebRTCSignal,
  onGoHome,
  statusMessage,
  isWaiting,
  isInitiator
}: VideoChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [mediaError, setMediaError] = useState<string>('');
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [videoLayout, setVideoLayout] = useState<'horizontal' | 'original'>('original');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [typingTimer, setTypingTimer] = useState<NodeJS.Timeout | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth <= 1024;

  const {
    localVideoRef,
    remoteVideoRef,
    mediaState,
    toggleVideo,
    toggleAudio,
    startCall,
    handleSignal,
    callState,
    isMediaReady,
    reassignVideoStreams,
    cleanup
  } = useWebRTC({ 
    onSignal: (signal) => {
      console.log('WebRTC signal being sent to server:', signal.type);
      onWebRTCSignal(signal);
    }, 
    isInitiator 
  });

  // Handle WebRTC signals from WebSocket
  useEffect(() => {
    const handleWebRTCSignal = (event: CustomEvent) => {
      handleSignal(event.detail);
    };

    const handleMediaError = (event: CustomEvent) => {
      setMediaError(event.detail);
    };

    const handleClearMediaError = () => {
      setMediaError('');
    };

    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected - cleaning up WebRTC');
      cleanup();
    };

    window.addEventListener('webrtc_signal', handleWebRTCSignal as EventListener);
    window.addEventListener('media_error', handleMediaError as EventListener);
    window.addEventListener('clear_media_error', handleClearMediaError as EventListener);
    window.addEventListener('partner_disconnected', handlePartnerDisconnected as EventListener);
    
    return () => {
      window.removeEventListener('webrtc_signal', handleWebRTCSignal as EventListener);
      window.removeEventListener('media_error', handleMediaError as EventListener);
      window.removeEventListener('clear_media_error', handleClearMediaError as EventListener);
      window.removeEventListener('partner_disconnected', handlePartnerDisconnected as EventListener);
    };
  }, [handleSignal]);

  // Initialize media immediately when component loads
  useEffect(() => {
    console.log('VideoChat component mounted, isWaiting:', isWaiting, 'isInitiator:', isInitiator);
    
    // Request media permissions immediately when component mounts
    const timeoutId = setTimeout(() => {
      startCall().catch((error) => {
        console.error('Failed to initialize media:', error);
        setMediaError('Failed to access camera/microphone. Please check permissions and refresh the page.');
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, []); // Remove dependencies to run only once on mount

  // Force video stream reassignment when call state or media state changes
  useEffect(() => {
    if (callState === 'connected' && isMediaReady) {
      console.log('Call connected and media ready, force reassigning video streams...');
      const timeoutId = setTimeout(() => {
        reassignVideoStreams();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [callState, isMediaReady, reassignVideoStreams]);

  const handleSendMessage = () => {
    if (inputValue.trim() && !isWaiting) {
      onSendMessage(inputValue);
      setInputValue('');
      // Clear typing indicator when message is sent
      handleStopTyping();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Real-time typing detection
    if (value.trim() && !isWaiting) {
      handleStartTyping();
      
      // Clear existing timer
      if (typingTimer) {
        clearTimeout(typingTimer);
      }
      
      // Set new timer to stop typing after 1 second of inactivity
      const newTimer = setTimeout(() => {
        handleStopTyping();
      }, 1000);
      
      setTypingTimer(newTimer);
    } else if (!value.trim()) {
      handleStopTyping();
    }
  };

  const handleStartTyping = () => {
    // TODO: Send typing start signal via WebSocket when backend supports it
    // For now, typing indicator is only shown for received messages
  };

  const handleStopTyping = () => {
    // TODO: Send typing stop signal via WebSocket when backend supports it
    if (typingTimer) {
      clearTimeout(typingTimer);
      setTypingTimer(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleLayoutChange = (layout: 'horizontal' | 'original') => {
    setVideoLayout(layout);
    
    // Reassign video streams after layout change
    setTimeout(() => {
      console.log('Layout changed to:', layout, '- reassigning video streams');
      reassignVideoStreams();
    }, 150);
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const availableTags = ['gaming', 'music', 'movies', 'sports', 'tech', 'art'];

  const getConnectionStatus = () => {
    if (isWaiting) return { text: 'Waiting...', color: 'text-yellow-400', icon: WifiOff };
    if (callState === 'connected') return { text: 'Connected', color: 'text-green-400', icon: Wifi };
    if (callState === 'connecting') return { text: 'Connecting', color: 'text-yellow-400', icon: WifiOff };
    if (callState === 'failed') return { text: 'Disconnected', color: 'text-red-400', icon: WifiOff };
    return { text: 'Paired', color: 'text-blue-400', icon: Wifi };
  };

  const connectionStatus = getConnectionStatus();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerTyping]); // Also scroll when typing indicator changes

  // Reset typing indicator when waiting or partner changes
  useEffect(() => {
    if (isWaiting) {
      setPartnerTyping(false);
    }
  }, [isWaiting]);

  // Clean up typing timer when component unmounts
  useEffect(() => {
    return () => {
      if (typingTimer) {
        clearTimeout(typingTimer);
      }
    };
  }, [typingTimer]);

  // Ensure videos are properly displayed when layout changes
  useEffect(() => {
    if (callState === 'connected' || isMediaReady) {
      // Small delay to ensure DOM elements are properly rendered after layout change
      const timer = setTimeout(() => {
        console.log('Re-initializing video streams for layout:', videoLayout);
        reassignVideoStreams();
        
        // Force video elements to refresh by toggling their srcObject
        setTimeout(() => {
          if (localVideoRef.current && localVideoRef.current.srcObject) {
            const localStream = localVideoRef.current.srcObject;
            localVideoRef.current.srcObject = null;
            setTimeout(() => {
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
                localVideoRef.current.play().catch(console.error);
              }
            }, 50);
          }
          if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
            const remoteStream = remoteVideoRef.current.srcObject;
            remoteVideoRef.current.srcObject = null;
            setTimeout(() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.play().catch(console.error);
              }
            }, 50);
          }
        }, 100);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [videoLayout, callState, isMediaReady, reassignVideoStreams, localVideoRef, remoteVideoRef]);

  return (
    <div className={`h-screen overflow-hidden transition-colors duration-500 ${
      isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
    } p-2 md:p-4`}>
      <div className="w-full max-w-7xl mx-auto h-[calc(100vh-1rem)] md:h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        
        {/* Header Section */}
        <div className={`${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
        } border rounded-lg mb-4 p-4 transition-colors duration-300`}>
          <div className="flex items-center justify-between">
            
            {/* Left Section - Home Button */}
            <div className="flex items-center space-x-4">
              {onGoHome && (
                <Button
                  onClick={onGoHome}
                  className={`px-4 py-2 rounded-lg transform transition-all duration-200 hover:scale-105 ${
                    isDarkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  data-testid="button-go-home"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </Button>
              )}
            </div>

            {/* Center Section - Layout Controls */}
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => handleLayoutChange('horizontal')}
                variant="ghost"
                size="sm"
                className={`w-10 h-10 rounded-full p-0 transition-all duration-200 ${
                  videoLayout === 'horizontal' 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : isDarkMode 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
                }`}
                data-testid="button-layout-horizontal"
              >
                <SplitSquareHorizontal className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => handleLayoutChange('original')}
                variant="ghost"
                size="sm"
                className={`w-10 h-10 rounded-full p-0 transition-all duration-200 ${
                  videoLayout === 'original' 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : isDarkMode 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
                }`}
                data-testid="button-layout-original"
              >
                <Square className="h-4 w-4" />
              </Button>
            </div>

            {/* Right Section - Status and Controls */}
            <div className="flex items-center space-x-4">
              
              {/* Mute Status Indicator */}
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                mediaState.audio 
                  ? isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                  : isDarkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
              }`}>
                {mediaState.audio ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                <span className="text-xs">{mediaState.audio ? 'On' : 'Muted'}</span>
              </div>

              {/* Dark Mode Toggle */}
              <Button
                onClick={toggleDarkMode}
                variant="ghost"
                size="sm"
                className={`w-10 h-10 rounded-full p-0 transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600 border border-gray-600' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
                }`}
                data-testid="button-dark-mode"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 flex gap-4 transition-all duration-500 overflow-hidden flex-col xl:flex-row`}>
          
          {/* Video Section */}
          <div className={`flex flex-col min-h-0 overflow-hidden transition-all duration-500 flex-1`}>
            
            {/* Status message */}
            {statusMessage && (
              <div className={`mb-4 p-3 rounded-lg transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-blue-900/50 border border-blue-700 text-blue-200' 
                  : 'bg-blue-100 border border-blue-300 text-blue-800'
              }`}>
                <p className="text-sm text-center" data-testid="text-video-status">
                  {statusMessage}
                </p>
              </div>
            )}

            {/* Media error message */}
            {mediaError && (
              <div className={`mb-4 p-4 rounded-lg transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-red-900/50 border border-red-700' 
                  : 'bg-red-100 border border-red-300'
              }`}>
                <p className={`text-sm text-center ${
                  isDarkMode ? 'text-red-200' : 'text-red-800'
                }`} data-testid="text-media-error">
                  {mediaError}
                </p>
              </div>
            )}

            {/* Video Container */}
            <div className={`flex-1 relative rounded-lg overflow-hidden transition-colors duration-300 ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
            }`}>
              
              {videoLayout === 'horizontal' ? (
                /* Horizontal Split Layout - Two equal squares side by side */
                <div className="flex h-full gap-2 p-2">
                  
                  {/* Remote Video - Left Square */}
                  <div className="w-1/2 aspect-square relative rounded-lg overflow-hidden">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={isRemoteMuted}
                      controls={false}
                      className={`w-full h-full object-cover transition-all duration-500 ${
                        isDarkMode ? 'bg-gray-900' : 'bg-gray-300'
                      }`}
                      data-testid="video-remote"
                      onLoadedMetadata={() => {
                        console.log('Remote video metadata loaded (horizontal)');
                        if (remoteVideoRef.current) {
                          remoteVideoRef.current.play().catch(console.error);
                        }
                      }}
                      onCanPlay={() => {
                        console.log('Remote video can play (horizontal)');
                        if (remoteVideoRef.current) {
                          remoteVideoRef.current.play().catch(console.error);
                        }
                      }}
                      onPlay={() => {
                        console.log('Remote video started playing (horizontal)');
                      }}
                    />
                    
                    {/* Remote video placeholder */}
                    {(callState !== 'connected' || !isMediaReady) && (
                      <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-900' : 'bg-gray-300'
                      }`}>
                        <div className="text-center p-4">
                          <Users className={`h-12 w-12 mx-auto mb-2 ${
                            isDarkMode ? 'text-gray-600' : 'text-gray-400'
                          }`} />
                          <p className={`text-sm ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {isWaiting ? 'Waiting...' : 
                             callState === 'connecting' ? 'Connecting...' :
                             callState === 'failed' ? 'Failed' :
                             'Preparing...'}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Remote Video Label */}
                    <div className="absolute top-2 left-2">
                      <div className={`px-2 py-1 rounded text-xs font-medium backdrop-blur-sm transition-colors duration-300 ${
                        isDarkMode ? 'bg-black/50 text-white' : 'bg-white/80 text-gray-900'
                      }`}>
                        Stranger
                      </div>
                    </div>
                  </div>
                  
                  {/* Local Video - Right Square */}
                  <div className="w-1/2 aspect-square relative rounded-lg overflow-hidden">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      className="w-full h-full object-cover transition-all duration-500"
                      data-testid="video-local"
                      style={{ 
                        transform: 'scaleX(-1)' // Mirror effect for local preview
                      }}
                      onLoadedMetadata={() => {
                        console.log('Local video metadata loaded (horizontal)');
                        if (localVideoRef.current) {
                          localVideoRef.current.play().catch(console.error);
                        }
                      }}
                      onCanPlay={() => console.log('Local video can play (horizontal)')}
                    />
                    
                    {!mediaState.video && (
                      <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
                      }`}>
                        <VideoOff className={`h-12 w-12 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`} />
                      </div>
                    )}
                    
                    {/* Local Video Label */}
                    <div className="absolute top-2 left-2">
                      <div className={`px-2 py-1 rounded text-xs font-medium backdrop-blur-sm transition-colors duration-300 ${
                        isDarkMode ? 'bg-black/50 text-white' : 'bg-white/80 text-gray-900'
                      }`}>
                        You
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Original Layout - Remote video full screen with local PiP */
                <>
                  {/* Remote video (main) */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={isRemoteMuted}
                    controls={false}
                    className={`w-full h-full object-cover transition-all duration-500 ${
                      isDarkMode ? 'bg-gray-900' : 'bg-gray-300'
                    }`}
                    data-testid="video-remote"
                    onLoadedMetadata={() => {
                      console.log('Remote video metadata loaded (original)');
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.play().catch(console.error);
                      }
                    }}
                    onCanPlay={() => {
                      console.log('Remote video can play (original)');
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.play().catch(console.error);
                      }
                    }}
                    onPlay={() => {
                      console.log('Remote video started playing (original)');
                    }}
                  />

                  {/* Remote video placeholder */}
                  {(callState !== 'connected' || !isMediaReady) && (
                    <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${
                      isDarkMode ? 'bg-gray-900' : 'bg-gray-300'
                    }`}>
                      <div className="text-center max-w-md mx-auto p-4">
                        <Users className={`h-16 w-16 mx-auto mb-4 ${
                          isDarkMode ? 'text-gray-600' : 'text-gray-400'
                        }`} />
                        <p className={`text-base mb-4 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {isWaiting ? 'Waiting for partner...' : 
                           callState === 'connecting' ? 'Connecting to video...' :
                           callState === 'failed' ? 'Video connection failed' :
                           'Preparing video...'}
                        </p>
                        {callState === 'failed' && (
                          <>
                            <Button 
                              onClick={() => {
                                setMediaError('');
                                startCall().catch(console.error);
                              }}
                              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
                              data-testid="button-retry-video"
                            >
                              Try Again
                            </Button>
                            <p className={`text-xs mt-2 ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-600'
                            }`}>
                              Make sure to allow camera and microphone permissions when prompted
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Local video (picture-in-picture) - with mirror effect for local preview */}
                  <div className={`absolute bottom-4 right-4 w-32 h-24 lg:w-48 lg:h-36 rounded-lg overflow-hidden border-2 shadow-lg transition-all duration-500 ${
                    isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-400'
                  }`}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      className="w-full h-full object-cover"
                      data-testid="video-local"
                      style={{ 
                        maxHeight: '100%', 
                        maxWidth: '100%', 
                        transform: 'scaleX(-1)' // Mirror effect for local preview
                      }}
                      onLoadedMetadata={() => console.log('Local video metadata loaded')}
                      onCanPlay={() => console.log('Local video can play')}
                    />
                    {!mediaState.video && (
                      <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
                      }`}>
                        <VideoOff className={`h-8 w-8 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`} />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Connection Status & Logo - Only show in non-horizontal layout */}
              {videoLayout !== 'horizontal' && (
                <div className="absolute bottom-4 left-4 flex items-center space-x-2">
                  <div className={`flex items-center space-x-2 px-3 py-1 rounded-full backdrop-blur-sm transition-colors duration-300 ${
                    isDarkMode ? 'bg-black/50 text-white' : 'bg-white/80 text-gray-900'
                  }`}>
                    <connectionStatus.icon className={`h-3 w-3 ${connectionStatus.color}`} />
                    <span className="text-xs font-medium">{connectionStatus.text}</span>
                    <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-bold">StrangerChat</span>
                  </div>
                </div>
              )}
            </div>

            {/* Controls Row */}
            <div className="mt-4 flex justify-center items-center space-x-2 md:space-x-4 flex-wrap">
              <Button
                onClick={toggleVideo}
                className={`flex items-center ${isMobile ? 'px-3 py-2' : 'space-x-2 px-4 py-2'} rounded-lg transition-all duration-200 transform hover:scale-105 ${
                  mediaState.video 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                data-testid="button-toggle-video"
              >
                {mediaState.video ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                {!isMobile && <span className="ml-2">{mediaState.video ? 'Video On' : 'Video Off'}</span>}
              </Button>
              
              <Button
                onClick={toggleAudio}
                className={`flex items-center ${isMobile ? 'px-3 py-2' : 'space-x-2 px-4 py-2'} rounded-lg transition-all duration-200 transform hover:scale-105 ${
                  mediaState.audio 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                data-testid="button-toggle-audio"
              >
                {mediaState.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {!isMobile && <span className="ml-2">{mediaState.audio ? 'Mic On' : 'Mic Off'}</span>}
              </Button>
              
              <Button
                onClick={() => setIsRemoteMuted(!isRemoteMuted)}
                className={`flex items-center ${isMobile ? 'px-3 py-2' : 'space-x-2 px-4 py-2'} rounded-lg transition-all duration-200 transform hover:scale-105 ${
                  !isRemoteMuted 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
                data-testid="button-mute-remote"
              >
                {isRemoteMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {!isMobile && <span className="ml-2">{isRemoteMuted ? 'Unmute Them' : 'Mute Them'}</span>}
              </Button>

              {/* Chat Toggle Button - Only show on mobile/tablet */}
              {(isMobile || isTablet) && (
                <Button
                  onClick={() => setIsMobileChatOpen(!isMobileChatOpen)}
                  className={`flex items-center ${isMobile ? 'px-3 py-2' : 'space-x-2 px-4 py-2'} rounded-lg transition-all duration-200 transform hover:scale-105 ${
                    isMobileChatOpen
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : isDarkMode 
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                  data-testid="button-toggle-chat"
                >
                  <MessageSquare className="h-4 w-4" />
                  {!isMobile && <span className="ml-2">Chat</span>}
                </Button>
              )}

              {/* Report Button */}
              <Button
                onClick={onReportUser}
                variant="outline"
                disabled={isWaiting}
                className={`flex items-center ${isMobile ? 'px-3 py-2' : 'space-x-2 px-3 py-2'} rounded-lg transition-all duration-200 ${
                  isDarkMode 
                    ? 'text-red-400 border-red-600 hover:bg-red-900/20' 
                    : 'text-red-600 border-red-400 hover:bg-red-50'
                }`}
                data-testid="button-report-video"
              >
                <Flag className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Report</span>}
              </Button>
            </div>

            {/* Next Button - Show below media controls on mobile/tablet */}
            {(isMobile || isTablet) && (
              <Button
                onClick={onNextUser}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white py-3 rounded-sm transition-all duration-200 font-medium"
                data-testid="button-mobile-next-video"
              >
                ► Next
              </Button>
            )}
          </div>

          {/* Text Chat Section - Hidden on mobile/tablet */}
          <div className={`flex-col overflow-hidden transition-all duration-500 w-full xl:w-80 ${
            isMobile || isTablet ? 'hidden' : 'flex'
          }`}>
            <Card className={`flex flex-col h-[466px] transition-colors duration-300 ${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
            }`}>
              {/* Header with border */}
              <CardHeader className={`pb-3 px-4 flex-shrink-0 border-b transition-colors duration-300 ${
                isDarkMode ? 'border-gray-700' : 'border-gray-300'
              }`}>
                <h3 className={`font-semibold transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Text Chat</h3>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                {/* Messages Container - Fixed height with internal scrolling */}
                <div className="flex-1 overflow-hidden relative">
                  <ScrollArea className="h-full" data-testid="area-video-messages">
                    <div className="p-4 space-y-3">
                      {messages.length === 0 ? (
                        <div className={`text-center text-sm mt-4 transition-colors duration-300 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          <p>Send a message to start chatting</p>
                        </div>
                      ) : (
                        <>
                          {messages.map((message) => (
                            <div key={message.id} className="space-y-1" data-testid={`video-message-${message.id}`}>
                              {/* Message Label */}
                              <div className={`text-xs font-medium ${
                                message.isOwn ? 'text-right' : 'text-left'
                              } ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {message.isOwn ? 'You' : 'Stranger'}
                              </div>
                              
                              {/* Message Bubble */}
                              <div className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs px-3 py-2 rounded-lg text-sm transition-colors duration-300 ${
                                  message.isOwn
                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                    : isDarkMode ? 'bg-gray-700 text-gray-200 rounded-bl-sm' : 'bg-gray-200 text-gray-800 rounded-bl-sm'
                                }`}>
                                  <p className="break-words">{message.content}</p>
                                  <p className="text-xs mt-1 opacity-70">
                                    {new Date(message.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Typing Indicator - Only shows when partner is actually typing (WebSocket controlled) */}
                          {partnerTyping && !isWaiting && (
                            <div className="space-y-1">
                              <div className={`text-xs font-medium text-left ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Stranger
                              </div>
                              <div className="flex justify-start">
                                <div className={`px-3 py-2 rounded-lg rounded-bl-sm text-sm ${
                                  isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Invisible div to scroll to */}
                          <div ref={messagesEndRef} />
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Input - Fixed at bottom */}
                <div className={`border-t p-4 flex-shrink-0 transition-colors duration-300 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-300'
                }`}>
                  <div className="flex space-x-2">
                    <Input
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      placeholder={isWaiting ? "Waiting..." : "Type message..."}
                      disabled={isWaiting}
                      className={`flex-1 transition-colors duration-300 ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      maxLength={1000}
                      data-testid="input-video-message"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isWaiting}
                      size="icon"
                      className="bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
                      data-testid="button-video-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>



              </CardContent>
            </Card>
            
            {/* Next Button - Bottom of Text Chat Section */}
            <Button
              onClick={onNextUser}
              className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white py-3 rounded-sm transition-all duration-200 font-medium"
              data-testid="button-next-video"
            >
              ► Next
            </Button>
          </div>
        </div>

        {/* Tags Row */}
        <div className={`mt-4 p-4 rounded-lg transition-colors duration-300 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
        } border`}>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-sm font-medium transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Interests:
            </span>
            {availableTags.map((tag) => (
              <Button
                key={tag}
                onClick={() => handleTagSelect(tag)}
                variant="ghost"
                size="sm"
                className={`px-3 py-1 rounded-full transition-all duration-200 transform hover:scale-105 ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : isDarkMode 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
                }`}
                data-testid={`tag-${tag}`}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Chat Overlay */}
      {(isMobile || isTablet) && (
        <>
          {/* Backdrop */}
          {isMobileChatOpen && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
              onClick={() => setIsMobileChatOpen(false)}
            />
          )}
          
          {/* Chat Overlay */}
          <div className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
            isMobileChatOpen ? 'translate-y-0' : 'translate-y-full'
          }`}>
            <Card className={`rounded-t-2xl border-t border-x-0 border-b-0 transition-colors duration-300 flex flex-col ${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
            }`} style={{ height: '45vh', minHeight: '300px', maxHeight: '500px' }}>
              {/* Header with close button */}
              <CardHeader className={`pb-3 px-4 flex-shrink-0 border-b transition-colors duration-300 flex flex-row items-center justify-between ${
                isDarkMode ? 'border-gray-700' : 'border-gray-300'
              }`}>
                <h3 className={`font-semibold transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Text Chat</h3>
                <Button
                  onClick={() => setIsMobileChatOpen(false)}
                  variant="ghost"
                  size="sm"
                  className={`p-1 h-8 w-8 rounded-full ${
                    isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
                {/* Messages Container - Fixed height with internal scrolling */}
                <div className="flex-1 overflow-hidden relative">
                  <ScrollArea className="h-full max-h-full" data-testid="area-mobile-video-messages">
                    <div className="p-4 space-y-3">
                      {messages.length === 0 ? (
                        <div className={`text-center text-sm mt-4 transition-colors duration-300 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          <p>Send a message to start chatting</p>
                        </div>
                      ) : (
                        <>
                          {messages.map((message) => (
                            <div key={message.id} className="space-y-1" data-testid={`mobile-video-message-${message.id}`}>
                              {/* Message Label */}
                              <div className={`text-xs font-medium ${
                                message.isOwn ? 'text-right' : 'text-left'
                              } ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {message.isOwn ? 'You' : 'Stranger'}
                              </div>
                              
                              {/* Message Bubble */}
                              <div className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs px-3 py-2 rounded-lg text-sm transition-colors duration-300 ${
                                  message.isOwn
                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                    : isDarkMode ? 'bg-gray-700 text-gray-200 rounded-bl-sm' : 'bg-gray-200 text-gray-800 rounded-bl-sm'
                                }`}>
                                  <p className="break-words">{message.content}</p>
                                  <p className="text-xs mt-1 opacity-70">
                                    {new Date(message.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Typing Indicator */}
                          {partnerTyping && !isWaiting && (
                            <div className="space-y-1">
                              <div className={`text-xs font-medium text-left ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Stranger
                              </div>
                              <div className="flex justify-start">
                                <div className={`px-3 py-2 rounded-lg rounded-bl-sm text-sm ${
                                  isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Invisible div to scroll to */}
                          <div ref={messagesEndRef} />
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Input Section */}
                <div className={`border-t p-4 flex-shrink-0 transition-colors duration-300 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-300'
                }`}>
                  <div className="flex space-x-2 mb-3">
                    <Input
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      placeholder={isWaiting ? "Waiting..." : "Type message..."}
                      disabled={isWaiting}
                      className={`flex-1 transition-colors duration-300 ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      maxLength={1000}
                      data-testid="input-mobile-video-message"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isWaiting}
                      size="icon"
                      className="bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
                      data-testid="button-mobile-video-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}