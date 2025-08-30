import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebRTCSignal, MediaState } from '@shared/schema';

interface UseWebRTCProps {
  onSignal: (signal: WebRTCSignal) => void;
  isInitiator?: boolean;
}

interface UseWebRTCReturn {
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  mediaState: MediaState;
  toggleVideo: () => void;
  toggleAudio: () => void;
  startCall: () => Promise<void>;
  handleSignal: (signal: WebRTCSignal) => Promise<void>;
  callState: 'idle' | 'connecting' | 'connected' | 'failed';
  isMediaReady: boolean;
  reassignVideoStreams: () => void;
  cleanup: () => void;
  createOffer: () => Promise<void>;
}

// ICE servers configuration for WebRTC - Multiple STUN servers for better NAT traversal
const iceServers = [
  // Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Additional reliable STUN servers
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.voiparound.com' },
  { urls: 'stun:stun.voipbuster.com' },
  { urls: 'stun:stun.voipstunt.com' },
  // OpenRelay TURN servers for when STUN fails (free public TURN servers)
  { 
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  { 
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  { 
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export function useWebRTC({ onSignal, isInitiator = false }: UseWebRTCProps): UseWebRTCReturn {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  
  const [mediaState, setMediaState] = useState<MediaState>({
    video: true,
    audio: true
  });
  
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [isMediaReady, setIsMediaReady] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    const peerConnection = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10, // Pre-gather more ICE candidates
      iceTransportPolicy: 'all', // Use both STUN and TURN servers
      bundlePolicy: 'max-bundle', // Bundle media streams for better connectivity
      rtcpMuxPolicy: 'require' // Multiplex RTP and RTCP for better NAT traversal
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Log candidate information for debugging NAT traversal
        console.log('ICE candidate generated:', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port
        });
        
        console.log('Sending ICE candidate via onSignal...');
        onSignal({
          type: 'ice-candidate',
          data: event.candidate,
          from: '',
          to: ''
        });
      } else {
        console.log('ICE candidate gathering completed');
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('Remote track received:', event.track.kind, event.streams.length);
      
      // Store remote stream
      if (event.streams[0]) {
        console.log('Storing remote stream with tracks:', event.streams[0].getTracks().length);
        remoteStreamRef.current = event.streams[0];
        
        // Immediately assign to video element with enhanced handling
        if (remoteVideoRef.current) {
          console.log('Assigning remote stream to video element');
          remoteVideoRef.current.srcObject = event.streams[0];
          
          // Set video properties for better compatibility
          remoteVideoRef.current.autoplay = true;
          remoteVideoRef.current.playsInline = true;
          remoteVideoRef.current.muted = false; // Allow audio from remote peer
          
          // Enhanced play with metadata loading wait
          const playVideo = async () => {
            try {
              if (remoteVideoRef.current) {
                // Wait for metadata to load first
                if (remoteVideoRef.current.readyState < 1) {
                  remoteVideoRef.current.addEventListener('loadedmetadata', () => {
                    console.log('Remote video metadata loaded, attempting play');
                    remoteVideoRef.current?.play().catch(error => {
                      console.log('Remote video play failed after metadata:', error);
                      setTimeout(playVideo, 1000);
                    });
                  }, { once: true });
                } else {
                  await remoteVideoRef.current.play();
                  console.log('Remote video playing successfully');
                }
              }
            } catch (error) {
              console.log('Remote video play failed, retrying...', error);
              setTimeout(playVideo, 1000);
            }
          };
          
          // Immediate attempt and backup
          playVideo();
          
          // Also set up a backup attempt
          setTimeout(() => {
            if (remoteVideoRef.current && remoteVideoRef.current.paused) {
              console.log('Remote video still paused, forcing play attempt');
              remoteVideoRef.current.play().catch(console.error);
            }
          }, 2000);
        }
      }
      
      // Update call state when we have both video and audio tracks
      const hasVideo = event.streams[0]?.getVideoTracks().length > 0;
      const hasAudio = event.streams[0]?.getAudioTracks().length > 0;
      
      if (hasVideo || hasAudio) {
        console.log('Media tracks received (video:', hasVideo, 'audio:', hasAudio, '), updating call state to connected');
        setCallState('connected');
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        setCallState('connected');
      } else if (peerConnection.connectionState === 'failed') {
        console.log('WebRTC connection failed, retrying...');
        setCallState('failed');
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'connected' || 
          peerConnection.iceConnectionState === 'completed') {
        console.log('ICE connection established successfully');
        retryCountRef.current = 0; // Reset retry count on successful connection
      } else if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed - NAT traversal unsuccessful');
        
        // Attempt to restart ICE if retries are available
        if (retryCountRef.current < maxRetries) {
          console.log(`Retrying WebRTC connection (attempt ${retryCountRef.current + 1}/${maxRetries})`);
          retryCountRef.current++;
          
          // Trigger ICE restart by creating a new offer
          if (isInitiator) {
            setTimeout(async () => {
              try {
                const offer = await peerConnection.createOffer({ iceRestart: true });
                await peerConnection.setLocalDescription(offer);
                onSignal({
                  type: 'offer',
                  data: offer,
                  from: '',
                  to: ''
                });
              } catch (error) {
                console.error('Error during ICE restart:', error);
                setCallState('failed');
              }
            }, 2000); // Wait 2 seconds before retrying
          }
        } else {
          console.log('Max retries reached, connection failed permanently');
          setCallState('failed');
        }
      }
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [onSignal]);

  // Get user media with direct constraints
  const getUserMedia = useCallback(async (): Promise<MediaStream> => {
    try {
      console.log('Requesting camera and microphone permissions...');
      
      // Check if media devices are available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported in this browser');
      }
      
      // Direct media access with basic constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: true
      });
      
      console.log('Media access successful with tracks:', stream.getTracks().length);

      console.log('Media stream obtained with', stream.getTracks().length, 'tracks');
      localStreamRef.current = stream;
      
      // Assign local stream to video element immediately with enhanced handling
      if (localVideoRef.current) {
        console.log('Assigning local stream to video element');
        localVideoRef.current.srcObject = stream;
        
        // Set video properties for better compatibility
        localVideoRef.current.autoplay = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.muted = true; // Local video should be muted to prevent echo
        
        // Set up event listeners for better video handling
        localVideoRef.current.addEventListener('loadedmetadata', () => {
          console.log('Local video metadata loaded');
        });
        
        localVideoRef.current.addEventListener('canplay', () => {
          console.log('Local video can play');
        });
        
        localVideoRef.current.addEventListener('playing', () => {
          console.log('Local video started playing');
        });
        
        // Force play immediately
        try {
          await localVideoRef.current.play();
          console.log('Local video started playing');
        } catch (error) {
          console.log('Local video autoplay prevented:', error);
        }
      }

      // Set initial media state based on stream tracks
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      
      console.log('Video track:', videoTrack?.enabled, 'Audio track:', audioTrack?.enabled);
      
      setMediaState({
        video: videoTrack?.enabled || false,
        audio: audioTrack?.enabled || false
      });

      setIsMediaReady(true);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      
      let errorMessage = 'Failed to access camera/microphone';
      if (error instanceof Error) {
        console.log('Media access error details:', error.name, error.message);
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Camera permission denied. Please refresh the page and click "Allow" when prompted.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No camera found. Please connect a camera and refresh the page.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Camera is busy. Please close other apps using your camera and refresh.';
        } else {
          errorMessage = 'Cannot access camera. Please check permissions and refresh the page.';
        }
      }
      
      // Emit a custom event to show error to user
      window.dispatchEvent(new CustomEvent('media_error', { detail: errorMessage }));
      
      setCallState('failed');
      throw error;
    }
  }, []);

  // Start the call
  const startCall = useCallback(async () => {
    try {
      console.log('Starting WebRTC call, isInitiator:', isInitiator);
      setCallState('connecting');
      
      // Clean up any existing peer connection
      if (peerConnectionRef.current) {
        console.log('Closing existing peer connection');
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Clear any previous media error state
      window.dispatchEvent(new CustomEvent('clear_media_error'));
      
      const stream = await getUserMedia();
      const peerConnection = initializePeerConnection();

      // Add local stream tracks to peer connection
      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, stream);
      });

      // Don't create offer immediately, wait for explicit trigger
      if (isInitiator) {
        console.log('Initiator setup complete, ready to create offer when triggered...');
      } else {
        console.log('Non-initiator waiting for offer...');
      }
    } catch (error) {
      console.error('Error starting call:', error);
      setCallState('failed');
      // Emit error event for UI display
      window.dispatchEvent(new CustomEvent('media_error', { detail: 'Failed to start video call. Please try again.' }));
    }
  }, [getUserMedia, initializePeerConnection, isInitiator, onSignal]);

  // Handle WebRTC signals
  const handleSignal = useCallback(async (signal: WebRTCSignal) => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) {
      console.log('No peer connection available for signal:', signal.type);
      return;
    }

    try {
      console.log('Handling WebRTC signal:', signal.type);
      switch (signal.type) {
        case 'offer':
          console.log('Received offer, setting remote description...');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
          
          // Get user media if not already available
          if (!localStreamRef.current) {
            console.log('Getting user media for answer...');
            const stream = await getUserMedia();
            stream.getTracks().forEach(track => {
              console.log('Adding track for answer:', track.kind);
              peerConnection.addTrack(track, stream);
            });
          } else {
            // Ensure tracks are added to peer connection
            localStreamRef.current.getTracks().forEach(track => {
              const sender = peerConnection.getSenders().find(s => s.track === track);
              if (!sender) {
                console.log('Adding existing track for offer response:', track.kind);
                peerConnection.addTrack(track, localStreamRef.current!);
              }
            });
          }

          console.log('Creating answer...');
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnection.setLocalDescription(answer);
          console.log('Answer created and set as local description');

          console.log('Sending answer via onSignal...');
          onSignal({
            type: 'answer',
            data: answer,
            from: '',
            to: ''
          });
          break;

        case 'answer':
          console.log('Received answer, setting remote description...');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
          console.log('Remote description set successfully');
          break;

        case 'ice-candidate':
          console.log('Received ICE candidate:', signal.data.type);
          if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
            console.log('ICE candidate added successfully');
          } else {
            console.log('Queueing ICE candidate (no remote description yet)');
            // Queue the candidate for later when remote description is set
            setTimeout(async () => {
              if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
              }
            }, 100);
          }
          break;

        case 'toggle-video':
        case 'toggle-audio':
          // Handle media state changes from partner
          console.log('Received media toggle from partner:', signal.type, signal.data);
          break;

        default:
          console.log('Unknown signal type:', signal.type);
      }
    } catch (error) {
      console.error('Error handling WebRTC signal:', error, signal);
      setCallState('failed');
    }
  }, [getUserMedia, onSignal]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    console.log('Toggle video clicked, current stream:', localStreamRef.current);
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      console.log('Video track found:', videoTrack);
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        console.log('Video track enabled set to:', videoTrack.enabled);
        setMediaState(prev => ({ ...prev, video: videoTrack.enabled }));
        
        onSignal({
          type: 'toggle-video',
          data: { enabled: videoTrack.enabled },
          from: '',
          to: ''
        });
      } else {
        console.log('No video track found');
      }
    } else {
      console.log('No local stream available');
      // Try to get user media first
      getUserMedia().catch(console.error);
    }
  }, [onSignal, getUserMedia]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    console.log('Toggle audio clicked, current stream:', localStreamRef.current);
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      console.log('Audio track found:', audioTrack);
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        console.log('Audio track enabled set to:', audioTrack.enabled);
        setMediaState(prev => ({ ...prev, audio: audioTrack.enabled }));
        
        onSignal({
          type: 'toggle-audio',
          data: { enabled: audioTrack.enabled },
          from: '',
          to: ''
        });
      } else {
        console.log('No audio track found');
      }
    } else {
      console.log('No local stream available');
      // Try to get user media first
      getUserMedia().catch(console.error);
    }
  }, [onSignal, getUserMedia]);

  // Function to reassign streams to video elements (useful after layout changes)
  const reassignVideoStreams = useCallback(() => {
    console.log('Reassigning video streams...');
    
    // Reassign local stream
    if (localStreamRef.current && localVideoRef.current) {
      console.log('Reassigning local stream');
      localVideoRef.current.srcObject = localStreamRef.current;
      
      // Set properties for local video
      localVideoRef.current.autoplay = true;
      localVideoRef.current.playsInline = true;
      localVideoRef.current.muted = true;
      
      localVideoRef.current.play().catch(error => {
        console.log('Local video autoplay prevented:', error);
      });
    }
    
    // Reassign remote stream using stored reference
    if (remoteStreamRef.current && remoteVideoRef.current) {
      console.log('Reassigning remote stream');
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      
      // Set properties for remote video
      remoteVideoRef.current.autoplay = true;
      remoteVideoRef.current.playsInline = true;
      remoteVideoRef.current.muted = false;
      
      // Enhanced remote video play with retry mechanism
      const playRemoteVideo = async () => {
        try {
          if (remoteVideoRef.current) {
            await remoteVideoRef.current.play();
            console.log('Remote video reassigned and playing');
          }
        } catch (error) {
          console.log('Remote video reassign play failed, retrying...', error);
          setTimeout(playRemoteVideo, 1000);
        }
      };
      
      playRemoteVideo();
    }
  }, []);

  // Manual cleanup function for partner disconnections
  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC resources...');
    
    // Only clear remote video element, keep local video running
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      console.log('Closing peer connection');
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Clear remote stream reference
    remoteStreamRef.current = null;
    
    // Reset call state but keep media ready
    setCallState('idle');
    retryCountRef.current = 0;
    
    // Keep local stream and media ready state for next connection
    console.log('Local video preserved for next connection');
  }, []);

  // Full cleanup function for component unmount
  const fullCleanup = useCallback(() => {
    console.log('Full cleanup - stopping all media...');
    
    // Stop all tracks in local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      console.log('Closing peer connection');
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Clear remote stream reference
    remoteStreamRef.current = null;
    
    // Reset all states
    setCallState('idle');
    setIsMediaReady(false);
    retryCountRef.current = 0;
  }, []);

  // Cleanup on unmount or when component is no longer needed
  useEffect(() => {
    return () => {
      fullCleanup();
    };
  }, [fullCleanup]);

  // Create offer function for explicit triggering
  const createOffer = useCallback(async () => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) {
      console.log('No peer connection available for offer creation');
      return;
    }

    if (!isInitiator) {
      console.log('Only initiator can create offers');
      return;
    }

    try {
      console.log('Creating offer for initiator...');
      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      });
      await peerConnection.setLocalDescription(offer);
      console.log('Offer created and set as local description');

      console.log('Sending offer via onSignal...');
      onSignal({
        type: 'offer',
        data: offer,
        from: '',
        to: ''
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      setCallState('failed');
    }
  }, [isInitiator, onSignal]);

  return {
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
    cleanup,
    createOffer
  };
}