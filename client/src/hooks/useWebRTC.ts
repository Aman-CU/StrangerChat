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
        
        // Immediately assign to video element
        if (remoteVideoRef.current) {
          console.log('Assigning remote stream to video element');
          remoteVideoRef.current.srcObject = event.streams[0];
          
          // Force play with more aggressive retry
          const playVideo = async () => {
            try {
              await remoteVideoRef.current?.play();
              console.log('Remote video playing successfully');
            } catch (error) {
              console.log('Remote video play failed, retrying...', error);
              setTimeout(playVideo, 500);
            }
          };
          playVideo();
        }
      }
      
      // Update call state when we have video track
      if (event.track.kind === 'video') {
        console.log('Video track received, updating call state to connected');
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
      
      // Assign local stream to video element immediately
      if (localVideoRef.current) {
        console.log('Assigning local stream to video element');
        localVideoRef.current.srcObject = stream;
        
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

      // Set up local offer creation for initiator
      if (isInitiator) {
        console.log('Initiator creating offer...');
        // Wait for ICE gathering to start before creating offer
        const waitForIceGathering = new Promise<void>((resolve) => {
          if (peerConnection.iceGatheringState === 'gathering' || peerConnection.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkIceState = () => {
              if (peerConnection.iceGatheringState === 'gathering' || peerConnection.iceGatheringState === 'complete') {
                peerConnection.removeEventListener('icegatheringstatechange', checkIceState);
                resolve();
              }
            };
            peerConnection.addEventListener('icegatheringstatechange', checkIceState);
            
            // Fallback timeout
            setTimeout(resolve, 200);
          }
        });
        
        await waitForIceGathering;
        
        try {
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: false
          });
          await peerConnection.setLocalDescription(offer);
          console.log('Offer created and set as local description');

          onSignal({
            type: 'offer',
            data: offer,
            from: '',
            to: ''
          });
        } catch (offerError) {
          console.error('Error creating offer:', offerError);
          setCallState('failed');
        }
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
          }

          console.log('Creating answer...');
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnection.setLocalDescription(answer);
          console.log('Answer created and set as local description');

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
      localVideoRef.current.play().catch(error => {
        console.log('Local video autoplay prevented:', error);
      });
    }
    
    // Reassign remote stream using stored reference
    if (remoteStreamRef.current && remoteVideoRef.current) {
      console.log('Reassigning remote stream');
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(error => {
        console.log('Remote video autoplay prevented:', error);
      });
    }
  }, []);

  // Cleanup on unmount or when component is no longer needed
  useEffect(() => {
    return () => {
      console.log('Cleaning up WebRTC resources...');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
        localStreamRef.current = null;
      }
      if (peerConnectionRef.current) {
        console.log('Closing peer connection');
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setIsMediaReady(false);
      setCallState('idle');
    };
  }, []);

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
    reassignVideoStreams
  };
}