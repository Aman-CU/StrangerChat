## StrangerChat Codebase Guide (Plain-English function map)

This document explains what each important file, function, and piece of logic does in simple terms. It does not change any source code.

### Server

- `server/index.ts`
  - Creates the Express app, turns on JSON parsing, and prints short logs for any `/api/*` request.
  - Calls `registerRoutes(app)` to attach API and WebSocket handling. That returns an HTTP server.
  - In development: wires up Vite dev middleware with hot-reload. In production: serves static files.
  - Starts listening on `PORT` (default 5000).

- `server/routes.ts`
  - `registerRoutes(app)`
    - Adds `GET /api/audit-logs` to return recent audit records.
    - Creates a WebSocket server at `/ws` and handles all realtime chat messages.
    - For every WebSocket connection:
      - Assigns a unique `socketId`, replies with `{type:'connected'}`.
      - Listens for messages by `type` and routes to helpers below.
    - Heartbeat pings keep track of dead sockets and close them if unresponsive.
  - `handleJoinQueue(ws, socketId, ip, ua)`
    - Puts the user into the text waiting line, logs it, tries to pair 2 people.
    - If nobody is found yet, sends `{type:'waiting'}` to the user.
  - `handleSendMessage(ws, socketId, content)`
    - Finds your current room and the partner’s socket, relays the text, and confirms back.
    - Logs a message audit entry (without storing message text).
  - `handleNextUser(ws, socketId, ip, ua, videoMode?)`
    - If you’re in a room, removes both you and your partner from the room.
    - Adds both back into the appropriate queue (text or video) and tells both they’re waiting again.
    - After a short delay, tries to pair again with a preference to avoid the same two people re-pairing if others exist.
  - `handleReportUser(ws, socketId, ip, ua)`
    - Logs a report for the current partner and then behaves like clicking Next.
  - `handleStartVideo(ws, socketId, ip, ua)`
    - Puts the user into the video waiting line, logs it, tries to make a video room.
    - If paired, each side gets `{type:'video_paired', isInitiator: boolean}`. A short time later `{type:'webrtc_ready'}` is sent so clients start WebRTC.
  - `handleWebRTCSignal(ws, socketId, signal)`
    - Forwards WebRTC signals (offer/answer/ICE/media toggles) to the partner in the same room.
  - `handleDisconnect(socketId, ip, ua)`
    - When a socket closes, notifies the partner, places the partner back in the right queue, and tries to re-match.
  - `tryMatchTextUsersWithPreference(avoidPair: string[] = [])`
    - If 2+ people are waiting for text, picks a pair. If `avoidPair` contains the last pair, tries to choose different partners when possible.
  - `tryMatchVideoUsersWithPreference(avoidPair: string[] = [])`
    - Same as above, but for video chats. Sets `room.isVideoCall = true` and sends `video_paired` to both sides.
  - `findWebSocketBySocketId(id)`
    - Looks up a WebSocket in the current connection list by the server-assigned `socketId`.

- `server/storage.ts`
  - `MemStorage` is an in-memory database for this app.
    - Audit logs: `createAuditLog`, `getAuditLogs(limit)`.
    - Queues: `addUserToQueue`, `getWaitingUsers`, and video equivalents.
    - Rooms: `createRoom(user1,user2)`, `getRoomByUser(socketId)`, `removeRoom(roomId)`, `removeUserFromRoom(socketId)`.
    - WebRTC state cleanup: `clearWebRTCState(roomId)`.
  - `storage` exports a single instance used by the server.

- `server/vite.ts`
  - `setupVite(app, server)` enables Vite as middleware in dev (including a crypto polyfill many libs expect).
  - `serveStatic(app)` serves the built client from `server/public` in production.

### Shared

- `shared/schema.ts`
  - Database table shape for audit logs (via Drizzle) and Zod schemas for validation.
  - Chat types used across client and server: `ChatMessage`, `SocketUser`, `ChatRoom`.
  - WebRTC signaling type `WebRTCSignal` and simple `MediaState` flags.

### Client

- `client/src/main.tsx`
  - React app entry point. Mounts `App` and imports global CSS.

- `client/src/App.tsx`
  - Provides React Query, tooltips, and toaster contexts.
  - Sets up routes: `/` shows the chat page, anything else shows the 404 page.

- `client/src/pages/chat.tsx`
  - Uses the `useSocket` hook to manage connection state.
  - Shows one of:
    - `LandingPage` before joining;
    - `VideoChat` while in video mode;
    - `ChatInterface` for text mode.

- `client/src/hooks/useSocket.ts`
  - Opens a WebSocket to the server at `/ws` and tracks a simple state machine:
    - `connecting → connected → waiting/paired` (text) or `video_waiting/video_paired` (video)
  - Public actions you can call from UI:
    - `joinQueue()` – ask to join text queue.
    - `startVideoChat()` – ask to join video queue.
    - `sendMessage(text)` – send a chat message to your current partner.
    - `nextUser()` – leave the current room and get queued again.
    - `reportUser()` – report the current partner and then move on.
    - `sendWebRTCSignal(signal)` – forward WebRTC messages to the server.
  - Handles server events and updates local state/messages accordingly.

- `client/src/hooks/useWebRTC.ts`
  - Owns camera/microphone, the `RTCPeerConnection`, and media toggles.
  - `startCall()` – gets local media and prepares the peer connection.
  - `createOffer()` – initiator makes an SDP offer and emits it via the provided `onSignal` callback.
  - `handleSignal(signal)` – reacts to incoming offer/answer/ICE and updates the peer connection.
  - `toggleVideo()` / `toggleAudio()` – enable/disable local tracks and inform the other side via signals.
  - `cleanup()` – tear down the remote side of the call while keeping local camera ready for the next pairing.
  - `reassignVideoStreams()` – safely re-attach media streams to video elements after layout changes.

- `client/src/components/LandingPage.tsx`
  - Simple welcome screen with two buttons: start text chat or start video chat. Displays connection status if needed.

- `client/src/components/ChatInterface.tsx`
  - Text chat UI: header, message list, input, and buttons for Next/Report.
  - Auto-scrolls on new messages and disables input while waiting.

- `client/src/components/VideoChat.tsx`
  - Video chat UI and controls (layout switch, dark mode, mic/video toggles, mobile chat overlay).
  - Hooks into `useWebRTC` to:
    - initialize local media when mounted,
    - create an offer once both sides are ready and you are the initiator,
    - re-assign streams after layout or state changes,
    - clean up when the partner disconnects.

- `client/src/hooks/use-mobile.tsx`
  - `useIsMobile()` – returns true if viewport width is below a fixed breakpoint.

- `client/src/hooks/use-toast.ts`
  - Small toast manager based on a reducer. Exposes `useToast()` and `toast()` helper.

- `client/src/pages/not-found.tsx`
  - Minimal 404 page used for routes that don’t exist.

### How the flow works (quick recap)

1) User clicks Start → the client sends `join_queue` (text) or `start_video` (video).
2) Server pulls two people from the correct queue and creates a room.
   - Text: both receive `{type:'paired'}`.
   - Video: both receive `{type:'video_paired'}`; then `{type:'webrtc_ready'}` to begin signaling.
3) For video, the initiator creates an offer, the receiver answers, ICE candidates are exchanged, and the videos appear.
4) Clicking Next or reporting tears down the room, puts both users back in the queue, and tries to match them with different partners if available.

This file is meant as a quick “what does this do?” map. For deeper internals, open the files side-by-side with this guide.

---

## Architecture and Flow (step by step)

This is the end-to-end journey from opening the app to chatting and moving to the next person.

1) App loads in the browser
   - The browser requests `/` from the server.
   - In development, Vite middleware serves `client/index.html` and the React bundle; in production, prebuilt files are served from `server/public`.
   - React mounts `App` and shows the `Chat` page.

2) WebSocket connection is established
   - `useSocket` immediately opens a WebSocket to the same origin at `/ws`.
   - The server assigns a `socketId` and replies with `{type:'connected'}`.
   - The landing screen buttons become usable (text or video).

3) User chooses text or video
   - Text: the client sends `{type:'join_queue'}`.
   - Video: the client sends `{type:'start_video'}`.
   - The server removes the user from any prior room, adds them to the corresponding waiting queue, logs an audit entry, and tries to match.
   - If no match yet, the client is told `{type:'waiting'}` or `{type:'video_waiting'}`.

4) Server pairs two users into a room
   - When 2+ users are available in a queue, the server creates a room and removes both from the queue.
   - Text flow: both clients receive `{type:'paired', roomId}` and switch to the text UI.
   - Video flow: both clients receive `{type:'video_paired', roomId, isInitiator}`, then a short delay later `{type:'webrtc_ready'}` to kick off signaling.

5) WebRTC setup (video only)
   - Both clients call `startCall()` to get camera/mic and create a `RTCPeerConnection`.
   - The initiator creates an SDP offer and sends it to the server with `{type:'webrtc_signal', signal:{type:'offer',...}}`.
   - The server forwards signals to the partner in the same room.
   - The receiver sets the remote description, creates an answer, sends it back.
   - Both sides exchange ICE candidates (STUN/TURN discovery) until a media path is found.
   - When tracks arrive, the remote video renders; call state becomes `connected`.

6) Messaging
   - Text UI: typing and sending calls `sendMessage`, which the server relays to the partner; sender also gets a `message_sent` echo for consistent display.
   - Video UI: optional side chat uses the same `sendMessage` mechanism.

7) Next (find a different partner)
   - Client sends `{type:'next_user', videoMode:boolean}`.
   - Server logs the action, clears any video state, removes the room, and places both users back into the appropriate queue.
   - Both clients are told they’re waiting again (`waiting`/`video_waiting`).
   - A short delay lets the old room fully close; then the server attempts to match again using a preference to avoid pairing the same two people if others are available (falls back to re-pairing if they are the only two).

8) Disconnects
   - If a socket closes or a partner drops, the server notifies the remaining user with `partner_disconnected`, places them back in the right queue, and soon attempts to re-match.
   - The client cleans up any existing peer connection and returns to waiting state.

9) Audit logs
   - Each important event (queue join, paired, message, next, report, webrtc signaling) is recorded in memory and available at `/api/audit-logs`.

10) Production build and serving
   - `npm run build` compiles the client and bundles the server to `dist`.
   - `npm start` launches the bundled server; it serves both the API and the built client from a single port.

### ICE, STUN, and TURN in this app

Where it lives
- `client/src/hooks/useWebRTC.ts` defines `iceServers` used by the `RTCPeerConnection`.
  - Multiple Google STUN servers for public address discovery.
  - Public OpenRelay TURN servers as a fallback when direct/STUN paths fail (e.g., symmetric NATs, firewalled networks).

What happens during connection
1) After pairing, both clients create an `RTCPeerConnection` with the `iceServers` list.
2) The initiator generates an SDP offer; both sides then start ICE gathering.
3) Each candidate found by the browser is sent via `{type:'webrtc_signal', signal:{type:'ice-candidate'}}` to the server, which forwards it to the partner.
4) The peer connection tries candidates in this order (simplified):
   - Host candidates (same LAN)
   - Server-reflexive from STUN (public IP:port discovered)
   - Relayed via TURN (traffic routed through TURN when direct path fails)
5) Once a pair of candidates works, media flows and the call state moves to `connected`.

Notes on production TURN
- The included OpenRelay TURN is public and best-effort. For reliability, deploy your own TURN (e.g., coturn) and replace entries in `iceServers` with your credentials:
  - `turn:your-turn.example.com:3478` (udp)
  - `turns:your-turn.example.com:5349` (tls)
  - Provide `username` and `credential`.
- Keep at least one STUN server for quick NAT discovery; multiple endpoints improve success rate.

---

## Deployment (free-friendly)

Two easy paths:

### 1) Single-host (Render or Railway)
- Push repo to GitHub.
- Create a new Web Service from the repo.
- Build: `npm install && npm run build`
- Start: `npm start`
- Env: `NODE_ENV=production` (platform provides `PORT`).
- Result: Client served at `/`, WebSocket at `/ws` on same origin.

### 2) Split: Client on Vercel, Backend on Render/Railway
- Backend (Render/Railway):
  - Build: `npm install && npm run build`
  - Start: `npm start`
  - Env: `NODE_ENV=production`
  - Copy backend URL (e.g., `https://your-backend.onrender.com`). WS is `wss://.../ws`.
- Client (Vercel):
  - Framework: Vite
  - Build: `npm install && npm run build`
  - Output dir: `dist/public`
  - Env: `VITE_WS_URL=wss://your-backend.onrender.com/ws`
  - Result: Client runs on Vercel, connects to backend WS over the env URL.

Local dev (split testing)
- Run backend: `npm run dev` (http://localhost:5000)
- Create `.env.local` with `VITE_WS_URL=ws://localhost:5000/ws`
- Start client dev; it will connect to the local backend.

Notes
- Prefer Node 20.x on hosts. Free tiers may sleep (cold start delay).
- For reliability in video, replace public TURN with your own when moving beyond demos.

---

## Storage and Database

### Current storage (in-memory)
- Implemented in `server/storage.ts` via `MemStorage`.
- Stores in RAM:
  - Audit logs (user actions like join, paired, next, report, signaling types)
  - Waiting queues for text and video
  - Active rooms and user→room mappings
  - Minimal WebRTC state cleanup markers
- Pros: simple, fast, zero setup. Cons: data is lost on restart; not durable.

### Production-ready options

1) Keep in-memory (demo/testing)
- Good for small demos or portfolios. No persistence.

2) PostgreSQL with Drizzle ORM (recommended)
- You already have Drizzle schemas in `shared/schema.ts` and scripts in `package.json` (e.g., `db:push`).
- Use a free Postgres provider (Neon, Supabase, Railway) and wire it up.

Quick setup steps:
- Create a Postgres database (Neon/Supabase/Railway).
- Add an env var: `DATABASE_URL=postgresql://user:pass@host:port/dbname`.
- Install driver if needed (already listed): `@neondatabase/serverless`.
- Create a new storage implementation (e.g., `PostgresStorage`) that matches the `IStorage` interface in `server/storage.ts`:
  - Persist audit logs using the `auditLogs` table.
  - Add tables for rooms, users, and queues or keep queues in-memory and only persist audits.
- Run migrations: `npm run db:push`.
- Swap the exported `storage` instance to use `PostgresStorage` in production.

3) Redis for queues (optional optimization)
- Use Redis (e.g., Upstash free tier) for high-performance queues and presence.
- Keep long-term data (audit logs) in Postgres; real-time queues in Redis.

4) Hybrid approach (pragmatic)
- Persist audit logs in Postgres.
- Keep active rooms and queues in memory (fastest) or in Redis.
- This balances durability with low-latency real-time behavior.

### Recommendation
- For demos: keep current `MemStorage`.
- For production: use Postgres for audit logs (at minimum). Optionally move queues to Redis.
-What I'd Recommend for Your Project
For a demo/portfolio project:
Keep current in-memory storage
Add a simple "Clear Data" button for testing
For production:
Use Neon/Supabase PostgreSQL (free tier)
Replace MemStorage with PostgresStorage
Keep the same interface, just change the implementation
Would you like me to:
Show you how to set up PostgreSQL with your existing Drizzle setup?
Create a PostgresStorage class that replaces MemStorage?
Add a simple database migration script



