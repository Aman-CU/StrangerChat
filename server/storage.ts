import { type AuditLog, type InsertAuditLog, type SocketUser, type ChatRoom } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Audit log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  
  // Chat queue and room management
  addUserToQueue(user: SocketUser): void;
  removeUserFromQueue(socketId: string): void;
  getWaitingUsers(): SocketUser[];
  addUserToVideoQueue(user: SocketUser): void;
  removeUserFromVideoQueue(socketId: string): void;
  getWaitingVideoUsers(): SocketUser[];
  createRoom(user1: SocketUser, user2: SocketUser): ChatRoom;
  getRoomByUser(socketId: string): ChatRoom | undefined;
  removeRoom(roomId: string): void;
  removeUserFromRoom(socketId: string): void;
  
  // WebRTC state management
  clearWebRTCState(roomId: string): void;
}

export class MemStorage implements IStorage {
  private auditLogs: Map<string, AuditLog>;
  private waitingQueue: SocketUser[];
  private videoWaitingQueue: SocketUser[];
  private chatRooms: Map<string, ChatRoom>;
  private userRoomMap: Map<string, string>; // socketId -> roomId
  private webrtcState: Map<string, any>; // roomId -> WebRTC state

  constructor() {
    this.auditLogs = new Map();
    this.waitingQueue = [];
    this.videoWaitingQueue = [];
    this.chatRooms = new Map();
    this.userRoomMap = new Map();
    this.webrtcState = new Map();
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const log: AuditLog = {
      ...insertLog,
      id,
      timestamp: new Date(),
      details: insertLog.details ?? null,
      partnerSocketId: insertLog.partnerSocketId ?? null,
      ipAddress: insertLog.ipAddress ?? null,
      userAgent: insertLog.userAgent ?? null,
    };
    this.auditLogs.set(id, log);
    
    // Log to console for MVP compliance tracking
    console.log(`[AUDIT] ${log.action.toUpperCase()} - Socket: ${log.socketId}${log.partnerSocketId ? `, Partner: ${log.partnerSocketId}` : ''} - ${log.timestamp.toISOString()}`);
    if (log.details) {
      console.log(`[AUDIT] Details: ${log.details}`);
    }
    
    return log;
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  addUserToQueue(user: SocketUser): void {
    // Remove if already in queue
    this.removeUserFromQueue(user.socketId);
    this.waitingQueue.push(user);
  }

  removeUserFromQueue(socketId: string): void {
    this.waitingQueue = this.waitingQueue.filter(user => user.socketId !== socketId);
  }

  getWaitingUsers(): SocketUser[] {
    return [...this.waitingQueue];
  }

  addUserToVideoQueue(user: SocketUser): void {
    // Remove if already in queue
    this.removeUserFromVideoQueue(user.socketId);
    this.videoWaitingQueue.push(user);
  }

  removeUserFromVideoQueue(socketId: string): void {
    this.videoWaitingQueue = this.videoWaitingQueue.filter(user => user.socketId !== socketId);
  }

  getWaitingVideoUsers(): SocketUser[] {
    return [...this.videoWaitingQueue];
  }

  createRoom(user1: SocketUser, user2: SocketUser): ChatRoom {
    const roomId = randomUUID();
    const room: ChatRoom = {
      id: roomId,
      users: [user1.socketId, user2.socketId],
      createdAt: new Date().toISOString(),
    };
    
    this.chatRooms.set(roomId, room);
    this.userRoomMap.set(user1.socketId, roomId);
    this.userRoomMap.set(user2.socketId, roomId);
    
    // Remove both users from waiting queue and video queue
    this.removeUserFromQueue(user1.socketId);
    this.removeUserFromQueue(user2.socketId);
    this.removeUserFromVideoQueue(user1.socketId);
    this.removeUserFromVideoQueue(user2.socketId);
    
    return room;
  }

  getRoomByUser(socketId: string): ChatRoom | undefined {
    const roomId = this.userRoomMap.get(socketId);
    return roomId ? this.chatRooms.get(roomId) : undefined;
  }

  removeRoom(roomId: string): void {
    const room = this.chatRooms.get(roomId);
    if (room) {
      // Remove user mappings
      room.users.forEach(socketId => {
        this.userRoomMap.delete(socketId);
      });
      this.chatRooms.delete(roomId);
      
      // Clean up WebRTC state
      this.clearWebRTCState(roomId);
    }
  }

  removeUserFromRoom(socketId: string): void {
    const roomId = this.userRoomMap.get(socketId);
    if (roomId) {
      const room = this.chatRooms.get(roomId);
      if (room) {
        // Remove the entire room when one user leaves
        this.removeRoom(roomId);
      }
    }
    
    // Also remove from both queues
    this.removeUserFromQueue(socketId);
    this.removeUserFromVideoQueue(socketId);
  }

  clearWebRTCState(roomId: string): void {
    // Remove any WebRTC signaling state for this room
    this.webrtcState.delete(roomId);
    console.log(`[CLEANUP] WebRTC state cleared for room ${roomId}`);
  }
}

export const storage = new MemStorage();
