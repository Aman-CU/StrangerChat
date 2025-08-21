import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import type { SocketUser, ChatMessage, WebRTCSignal } from "@shared/schema";
import { randomUUID } from "crypto";

interface ExtendedWebSocket extends WebSocket {
  socketId?: string;
  isAlive?: boolean;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // API route to get audit logs
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(50);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for chat functionality
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    clientTracking: true 
  });

  // Heartbeat to detect broken connections
  const heartbeat = function(this: ExtendedWebSocket) {
    this.isAlive = true;
  };

  wss.on('connection', function connection(ws: ExtendedWebSocket, req) {
    const socketId = randomUUID();
    ws.socketId = socketId;
    ws.isAlive = true;
    
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.socket.remoteAddress || req.headers['x-forwarded-for'] as string || '';

    ws.on('pong', heartbeat);

    console.log(`[CONNECT] New user connected: ${socketId}`);

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      socketId: socketId
    }));

    ws.on('message', async function message(data) {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join_queue':
            await handleJoinQueue(ws, socketId, ipAddress, userAgent);
            break;
            
          case 'send_message':
            await handleSendMessage(ws, socketId, message.content);
            break;
            
          case 'next_user':
            await handleNextUser(ws, socketId, ipAddress, userAgent, message.videoMode);
            break;
            
          case 'report_user':
            await handleReportUser(ws, socketId, ipAddress, userAgent);
            break;

          case 'start_video':
            await handleStartVideo(ws, socketId, ipAddress, userAgent);
            break;
            
          case 'webrtc_signal':
            await handleWebRTCSignal(ws, socketId, message.signal);
            break;
            
          default:
            console.log(`[UNKNOWN] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error(`[ERROR] Failed to process message from ${socketId}:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    ws.on('close', async function close() {
      await handleDisconnect(socketId, ipAddress, userAgent);
    });

    ws.on('error', function error(err) {
      console.error(`[ERROR] WebSocket error for ${socketId}:`, err);
    });
  });

  // Heartbeat interval to detect broken connections
  const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws: ExtendedWebSocket) {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', function close() {
    clearInterval(interval);
  });

  // Handle joining the waiting queue
  async function handleJoinQueue(ws: ExtendedWebSocket, socketId: string, ipAddress: string, userAgent: string) {
    const user: SocketUser = {
      socketId,
      joinedAt: new Date().toISOString(),
      ipAddress,
      userAgent
    };

    // Remove from any existing room first
    storage.removeUserFromRoom(socketId);

    // Add to waiting queue
    storage.addUserToQueue(user);

    // Log the queue join
    await storage.createAuditLog({
      socketId,
      action: 'join_queue',
      ipAddress,
      userAgent,
      details: 'User joined waiting queue'
    });

    // Try to find a match using the helper function
    await tryMatchTextUsersWithPreference();
    
    // Check if user got matched, if not notify they're waiting
    const userRoom = storage.getRoomByUser(socketId);
    if (!userRoom) {
      // Notify user they're waiting
      ws.send(JSON.stringify({
        type: 'waiting',
        message: 'Looking for someone to chat with...'
      }));
    }
  }

  // Handle sending messages
  async function handleSendMessage(ws: ExtendedWebSocket, socketId: string, content: string) {
    const room = storage.getRoomByUser(socketId);
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You are not in a chat room'
      }));
      return;
    }

    // Find partner's socket
    const partnerId = room.users.find(id => id !== socketId);
    if (!partnerId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'No partner found'
      }));
      return;
    }

    const partnerWs = findWebSocketBySocketId(partnerId);
    if (!partnerWs || partnerWs.readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'partner_disconnected',
        message: 'Your partner has disconnected'
      }));
      storage.removeUserFromRoom(socketId);
      return;
    }

    const messageData: ChatMessage = {
      id: randomUUID(),
      content: content.substring(0, 1000), // Limit message length
      timestamp: new Date().toISOString(),
      isOwn: false
    };

    // Send to partner
    partnerWs.send(JSON.stringify({
      type: 'message',
      message: messageData
    }));

    // Send confirmation to sender
    ws.send(JSON.stringify({
      type: 'message_sent',
      message: { ...messageData, isOwn: true }
    }));

    // Log the message (without content for privacy)
    await storage.createAuditLog({
      socketId,
      partnerSocketId: partnerId,
      action: 'message',
      details: 'Message sent'
    });
  }

  // Handle next user request  
  async function handleNextUser(ws: ExtendedWebSocket, socketId: string, ipAddress: string, userAgent: string, videoMode?: boolean) {
    const room = storage.getRoomByUser(socketId);
    
    // If user is not in a room, they might be waiting in queue
    if (!room) {
      // Check if user is in waiting queues
      const isInTextQueue = storage.getWaitingUsers().some(user => user.socketId === socketId);
      const isInVideoQueue = storage.getWaitingVideoUsers().some(user => user.socketId === socketId);
      
      if (isInTextQueue || isInVideoQueue) {
        // User is waiting in queue - just notify them they're still waiting
        if (videoMode || isInVideoQueue) {
          ws.send(JSON.stringify({
            type: 'video_waiting',
            message: 'Still looking for someone to video chat with...'
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'waiting',
            message: 'Still looking for someone to chat with...'
          }));
        }
        return;
      }
      
      // User is not in queue or room - put them back in appropriate queue
      if (videoMode) {
        await handleStartVideo(ws, socketId, ipAddress, userAgent);
      } else {
        await handleJoinQueue(ws, socketId, ipAddress, userAgent);
      }
      return;
    }
    
    let wasVideoCall = room.isVideoCall || false;
    
    // Use explicit videoMode if provided, otherwise fall back to room context
    if (videoMode !== undefined) {
      wasVideoCall = videoMode;
    }
    
    // Find partner
    const partnerId = room.users.find(id => id !== socketId);
    
    // Log the next user action
    await storage.createAuditLog({
      socketId,
      partnerSocketId: partnerId,
      action: 'next_user',
      ipAddress,
      userAgent,
      details: 'User clicked next to find new partner'
    });

    // Clean up WebRTC state for video calls
    if (wasVideoCall && partnerId) {
      storage.clearWebRTCState(room.id);
    }

    // Remove both users from the current room
    storage.removeUserFromRoom(socketId);
    if (partnerId) {
      storage.removeUserFromRoom(partnerId);
    }

    // Add both users back to the appropriate queue
    if (partnerId) {
      const partnerWs = findWebSocketBySocketId(partnerId);
      
      // Create user objects for both users
      const currentUser: SocketUser = {
        socketId,
        joinedAt: new Date().toISOString(),
        ipAddress,
        userAgent
      };

      const partnerUser: SocketUser = {
        socketId: partnerId,
        joinedAt: new Date().toISOString(),
        ipAddress: '', // We don't have partner's IP, but it's not critical
        userAgent: '' // We don't have partner's user agent, but it's not critical
      };

      // Add both users to the appropriate queue based on chat type
      if (wasVideoCall) {
        storage.addUserToVideoQueue(currentUser);
        storage.addUserToVideoQueue(partnerUser);
        
        // Notify both users they're back in video queue
        ws.send(JSON.stringify({
          type: 'video_waiting',
          message: 'Looking for someone new to video chat with...'
        }));
        
        if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
          partnerWs.send(JSON.stringify({
            type: 'video_waiting',
            message: 'Looking for someone new to video chat with...'
          }));
        }

        // Add a delay before trying to match to prevent immediate re-pairing
        setTimeout(async () => {
          await tryMatchVideoUsersWithPreference([socketId, partnerId]);
        }, 1000); // 1 second delay
      } else {
        storage.addUserToQueue(currentUser);
        storage.addUserToQueue(partnerUser);
        
        // Notify both users they're back in text queue
        ws.send(JSON.stringify({
          type: 'waiting',
          message: 'Looking for someone new to chat with...'
        }));
        
        if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
          partnerWs.send(JSON.stringify({
            type: 'waiting',
            message: 'Looking for someone new to chat with...'
          }));
        }

        // Add a delay before trying to match to prevent immediate re-pairing
        setTimeout(async () => {
          await tryMatchTextUsersWithPreference([socketId, partnerId]);
        }, 1000); // 1 second delay
      }
    } else {
      // No partner found, just add current user back to queue
      if (wasVideoCall) {
        await handleStartVideo(ws, socketId, ipAddress, userAgent);
      } else {
        await handleJoinQueue(ws, socketId, ipAddress, userAgent);
      }
    }
  }

  // Helper function to try matching text chat users
  async function tryMatchTextUsers() {
    return tryMatchTextUsersWithPreference();
  }

  // Helper function to try matching text chat users with preference to avoid recent pairings
  async function tryMatchTextUsersWithPreference(avoidPairing: string[] = []) {
    const waitingUsers = storage.getWaitingUsers();
    if (waitingUsers.length >= 2) {
      let user1: SocketUser;
      let user2: SocketUser;
      
      // If we have more than 2 users and want to avoid specific pairing, try that first
      if (waitingUsers.length > 2 && avoidPairing.length === 2) {
        // Find users that are not in the avoid list
        const availableUsers = waitingUsers.filter(user => !avoidPairing.includes(user.socketId));
        
        if (availableUsers.length >= 2) {
          // Pair two users that weren't just paired together
          user1 = availableUsers[0];
          user2 = availableUsers[1];
        } else if (availableUsers.length === 1) {
          // Only one new user, pair with one from avoid list
          user1 = availableUsers[0];
          user2 = waitingUsers.find(user => avoidPairing.includes(user.socketId))!;
        } else {
          // All users are in avoid list, pair them anyway
          user1 = waitingUsers[0];
          user2 = waitingUsers[1];
        }
      } else {
        // Standard pairing logic
        user1 = waitingUsers[0];
        user2 = waitingUsers[1];
      }
      
      // Create room
      const room = storage.createRoom(user1, user2);
      
      // Get WebSocket connections
      const ws1 = findWebSocketBySocketId(user1.socketId);
      const ws2 = findWebSocketBySocketId(user2.socketId);

      if (ws1 && ws2) {
        // Notify both users they've been paired
        ws1.send(JSON.stringify({
          type: 'paired',
          roomId: room.id,
          message: 'You have been connected to a stranger!'
        }));

        ws2.send(JSON.stringify({
          type: 'paired',
          roomId: room.id,
          message: 'You have been connected to a stranger!'
        }));

        // Log the pairing
        await storage.createAuditLog({
          socketId: user1.socketId,
          partnerSocketId: user2.socketId,
          action: 'paired',
          ipAddress: user1.ipAddress,
          userAgent: user1.userAgent,
          details: `Paired with ${user2.socketId}`
        });

        await storage.createAuditLog({
          socketId: user2.socketId,
          partnerSocketId: user1.socketId,
          action: 'paired',
          ipAddress: user2.ipAddress,
          userAgent: user2.userAgent,
          details: `Paired with ${user1.socketId}`
        });

        console.log(`[PAIRED] ${user1.socketId} and ${user2.socketId} in room ${room.id}`);
      }
    }
  }

  // Helper function to try matching video chat users
  async function tryMatchVideoUsers() {
    return tryMatchVideoUsersWithPreference();
  }

  // Helper function to try matching video chat users with preference to avoid recent pairings
  async function tryMatchVideoUsersWithPreference(avoidPairing: string[] = []) {
    const waitingUsers = storage.getWaitingVideoUsers();
    if (waitingUsers.length >= 2) {
      let user1: SocketUser;
      let user2: SocketUser;
      
      // If we have more than 2 users and want to avoid specific pairing, try that first
      if (waitingUsers.length > 2 && avoidPairing.length === 2) {
        // Find users that are not in the avoid list
        const availableUsers = waitingUsers.filter(user => !avoidPairing.includes(user.socketId));
        
        if (availableUsers.length >= 2) {
          // Pair two users that weren't just paired together
          user1 = availableUsers[0];
          user2 = availableUsers[1];
        } else if (availableUsers.length === 1) {
          // Only one new user, pair with one from avoid list
          user1 = availableUsers[0];
          user2 = waitingUsers.find(user => avoidPairing.includes(user.socketId))!;
        } else {
          // All users are in avoid list, pair them anyway
          user1 = waitingUsers[0];
          user2 = waitingUsers[1];
        }
      } else {
        // Standard pairing logic
        user1 = waitingUsers[0];
        user2 = waitingUsers[1];
      }
      
      // Create video room
      const room = storage.createRoom(user1, user2);
      room.isVideoCall = true;
      
      // Get WebSocket connections
      const ws1 = findWebSocketBySocketId(user1.socketId);
      const ws2 = findWebSocketBySocketId(user2.socketId);

      if (ws1 && ws2) {
        // Notify both users they've been paired for video
        console.log(`[VIDEO_MATCH] Sending video_paired to initiator ${user1.socketId}`);
        ws1.send(JSON.stringify({
          type: 'video_paired',
          roomId: room.id,
          isInitiator: true,
          message: 'Connected for video chat! Preparing video...'
        }));

        console.log(`[VIDEO_MATCH] Sending video_paired to receiver ${user2.socketId}`);
        ws2.send(JSON.stringify({
          type: 'video_paired',
          roomId: room.id,
          isInitiator: false,
          message: 'Connected for video chat! Preparing video...'
        }));

        // Log the video pairing
        await storage.createAuditLog({
          socketId: user1.socketId,
          partnerSocketId: user2.socketId,
          action: 'video_paired',
          ipAddress: user1.ipAddress,
          userAgent: user1.userAgent,
          details: `Video paired with ${user2.socketId}`
        });

        await storage.createAuditLog({
          socketId: user2.socketId,
          partnerSocketId: user1.socketId,
          action: 'video_paired',
          ipAddress: user2.ipAddress,
          userAgent: user2.userAgent,
          details: `Video paired with ${user1.socketId}`
        });

        console.log(`[VIDEO PAIRED] ${user1.socketId} (initiator) and ${user2.socketId} (receiver) in room ${room.id}`);
        
        // Ensure both sockets are ready for WebRTC
        setTimeout(() => {
          console.log(`[VIDEO] Ready to start WebRTC signaling for room ${room.id}`);
        }, 100);
      } else {
        console.log('[ERROR] One or both WebSocket connections not available for video pairing');
      }
    }
  }

  // Handle starting video chat
  async function handleStartVideo(ws: ExtendedWebSocket, socketId: string, ipAddress: string, userAgent: string) {
    const user: SocketUser = {
      socketId,
      joinedAt: new Date().toISOString(),
      ipAddress,
      userAgent
    };

    // Remove from any existing room first
    storage.removeUserFromRoom(socketId);

    // Add to video waiting queue
    storage.addUserToVideoQueue(user);

    // Log the video queue join
    await storage.createAuditLog({
      socketId,
      action: 'join_video_queue',
      ipAddress,
      userAgent,
      details: 'User joined video chat waiting queue'
    });

    // Try to find a match for video chat using the helper function
    await tryMatchVideoUsersWithPreference();
    
    // Check if user got matched, if not notify they're waiting
    const userRoom = storage.getRoomByUser(socketId);
    if (!userRoom) {
      // Notify user they're waiting for video chat
      ws.send(JSON.stringify({
        type: 'video_waiting',
        message: 'Looking for someone to video chat with...'
      }));
    }
  }

  // Handle WebRTC signaling
  async function handleWebRTCSignal(ws: ExtendedWebSocket, socketId: string, signal: WebRTCSignal) {
    const room = storage.getRoomByUser(socketId);
    if (!room || !room.isVideoCall) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Not in a video chat room'
      }));
      return;
    }

    // Find partner's socket
    const partnerId = room.users.find(id => id !== socketId);
    if (!partnerId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'No video partner found'
      }));
      return;
    }

    const partnerWs = findWebSocketBySocketId(partnerId);
    if (!partnerWs || partnerWs.readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'partner_disconnected',
        message: 'Your video partner has disconnected'
      }));
      storage.removeUserFromRoom(socketId);
      return;
    }

    // Forward the WebRTC signal to partner
    partnerWs.send(JSON.stringify({
      type: 'webrtc_signal',
      signal: {
        ...signal,
        from: socketId,
        to: partnerId
      }
    }));

    // Log WebRTC signaling (without sensitive data)
    await storage.createAuditLog({
      socketId,
      partnerSocketId: partnerId,
      action: 'webrtc_signal',
      details: `WebRTC signal type: ${signal.type}`
    });
  }

  // Handle user reports
  async function handleReportUser(ws: ExtendedWebSocket, socketId: string, ipAddress: string, userAgent: string) {
    const room = storage.getRoomByUser(socketId);
    
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'No active chat to report'
      }));
      return;
    }

    const partnerId = room.users.find(id => id !== socketId);
    if (partnerId) {
      // Log the report
      await storage.createAuditLog({
        socketId,
        partnerSocketId: partnerId,
        action: 'report',
        ipAddress,
        userAgent,
        details: `User reported partner ${partnerId} for inappropriate behavior`
      });

      console.log(`[REPORT] User ${socketId} reported partner ${partnerId}`);
    }

    // Confirm report was submitted
    ws.send(JSON.stringify({
      type: 'report_submitted',
      message: 'Report submitted successfully'
    }));

    // Disconnect from current partner after report
    await handleNextUser(ws, socketId, ipAddress, userAgent);
  }

  // Handle disconnection
  async function handleDisconnect(socketId: string, ipAddress: string, userAgent: string) {
    console.log(`[DISCONNECT] User disconnected: ${socketId}`);
    
    const room = storage.getRoomByUser(socketId);
    if (room) {
      // Clean up WebRTC state for video calls
      if (room.isVideoCall) {
        storage.clearWebRTCState(room.id);
      }
      
      // Find partner and notify them
      const partnerId = room.users.find(id => id !== socketId);
      if (partnerId) {
        const partnerWs = findWebSocketBySocketId(partnerId);
        if (partnerWs && partnerWs.readyState === WebSocket.OPEN) {
          if (room.isVideoCall) {
            partnerWs.send(JSON.stringify({
              type: 'partner_disconnected',
              message: 'Your video partner has disconnected'
            }));
          } else {
            partnerWs.send(JSON.stringify({
              type: 'partner_disconnected',
              message: 'Your partner has disconnected'
            }));
          }
          
          // Add partner back to appropriate queue
          const partnerUser: SocketUser = {
            socketId: partnerId,
            joinedAt: new Date().toISOString(),
            ipAddress: '',
            userAgent: ''
          };
          
          if (room.isVideoCall) {
            storage.addUserToVideoQueue(partnerUser);
            partnerWs.send(JSON.stringify({
              type: 'video_waiting',
              message: 'Looking for someone to video chat with...'
            }));
            // Try to match with others
            setTimeout(async () => {
              await tryMatchVideoUsersWithPreference();
            }, 500);
          } else {
            storage.addUserToQueue(partnerUser);
            partnerWs.send(JSON.stringify({
              type: 'waiting',
              message: 'Looking for someone to chat with...'
            }));
            // Try to match with others
            setTimeout(async () => {
              await tryMatchTextUsersWithPreference();
            }, 500);
          }
        }

        // Log the disconnect
        await storage.createAuditLog({
          socketId,
          partnerSocketId: partnerId,
          action: 'disconnect',
          ipAddress,
          userAgent,
          details: 'User disconnected from chat'
        });
      }
    }

    // Clean up user data
    storage.removeUserFromRoom(socketId); // This also removes from both queues
  }

  // Helper function to find WebSocket by socket ID
  function findWebSocketBySocketId(socketId: string): ExtendedWebSocket | null {
    const clientsArray = Array.from(wss.clients);
    for (const client of clientsArray) {
      const extendedClient = client as ExtendedWebSocket;
      if (extendedClient.socketId === socketId && extendedClient.readyState === WebSocket.OPEN) {
        return extendedClient;
      }
    }
    return null;
  }

  return httpServer;
}
