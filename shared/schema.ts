import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  socketId: text("socket_id").notNull(),
  partnerSocketId: text("partner_socket_id"),
  action: text("action").notNull(), // 'report', 'connect', 'disconnect', 'message'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  details: text("details"), // Additional context like message content for reports
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Chat-related types for Socket.IO communication
export interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  isOwn: boolean;
}

export interface SocketUser {
  socketId: string;
  joinedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ChatRoom {
  id: string;
  users: [string, string]; // Two socket IDs
  createdAt: string;
  isVideoCall?: boolean;
}

// WebRTC signaling types
export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'toggle-video' | 'toggle-audio';
  data: any;
  from: string;
  to: string;
}

export interface MediaState {
  video: boolean;
  audio: boolean;
}
