# Stranger Chat

## Overview

Stranger Chat is an anonymous chat application similar to Omegle that allows users to connect randomly with other online users for real-time text and video conversations. The application is built as a full-stack solution using React for the frontend and Express with WebSocket support for the backend. Users can start chatting without any sign-up process, making it truly anonymous. The system includes essential moderation features like user reporting and comprehensive audit logging for safety and compliance.

## Recent Changes (August 30, 2025)

- **Fixed critical WebRTC signaling issues (August 30, 2025)**:
  - Separated WebRTC offer creation from initial setup to ensure proper timing
  - Added explicit offer triggering when initiator is paired and media ready
  - Fixed "No peer connection available" errors by creating connections on demand
  - Enhanced server-side pairing logic to properly avoid recent pairings
  - Added comprehensive logging for WebRTC signaling debugging
  - Improved timing delays to ensure peer connections are established before signaling
- **Enhanced video pairing logic to match specified requirements**:
  - When users click "Next", both are added to queue for re-matching
  - Smart pairing avoids immediate re-connection when other users available
  - Falls back to reconnecting same users only when no other options exist
  - Added detailed matching logs to track pairing decisions
- **Fixed local video preservation on partner disconnect**:
  - Local video stream now preserved when partner disconnects
  - Only remote video and peer connection are cleaned up
  - Users can continue to next match without losing their video setup

## Previous Changes (August 14, 2025)

- Added WebRTC support for random video chat functionality
- Implemented peer-to-peer video calling with audio/video controls
- Created dedicated video chat interface with picture-in-picture local video
- Added WebRTC signaling through WebSocket server
- Updated landing page with separate "Start Text Chat" and "Start Video Chat" buttons
- Enhanced audit logging to track video chat sessions and WebRTC signaling
- Implemented media state management for video/audio toggle functionality
- **Fixed NAT traversal issues for long-distance video chat connections**:
  - Added multiple STUN servers (Google, Mozilla, VoIP providers) for better connectivity
  - Integrated free TURN servers (OpenRelay) for relay when direct connection fails
  - Optimized ICE configuration with larger candidate pool and better transport policies
  - Added automatic connection retry mechanism with ICE restart capability
  - Implemented comprehensive connection state logging for debugging
  - Enhanced media constraints for better codec negotiation and bandwidth efficiency
- **Fixed video streaming connectivity and "Next" button behavior (August 14, 2025)**:
  - Improved WebRTC initialization timing with better peer connection setup
  - Enhanced "Next" button to properly handle waiting users in queue
  - Fixed issue where waiting users got errors when clicking "Next" - now they stay in queue
  - Added smart matching logic to avoid immediate re-pairing when other users are available
  - Improved video connection state management and error handling
  - Added comprehensive logging for debugging video pairing and WebRTC signaling
  - **Removed mirror image effect from local video for natural appearance**
  - **Added remote audio mute button to control other person's voice independently**
  - **Fixed auto-start video functionality (August 14, 2025)**:
    - Removed extra "Start Video" button - video now auto-starts when paired
    - Improved mobile device camera support with mobile-first media constraints
    - Enhanced WebRTC initialization timing with better ICE gathering wait
    - Added fallback permission handling for mobile browsers
    - Optimized media constraints specifically for mobile device compatibility
- **Fixed text chat overflow and layout issues (August 14, 2025)**:
  - Implemented WhatsApp-style internal scrolling for chat messages
  - Fixed video canvas overflow when two peers connect by adding overflow:hidden constraints
  - Added auto-scroll to bottom for new messages with smooth behavior
  - Set max-height (600px) constraints to prevent upward chat overflow
  - Maintained responsive layout while preventing layout shifts from message overflow
- **Enhanced mobile and tablet responsiveness (August 18, 2025)**:
  - Added responsive design that hides text chat sidebar on mobile and tablet views
  - Implemented icon-only media control buttons for mobile/tablet to prevent overflow
  - Created animated mobile chat overlay that slides from bottom (45% screen height)
  - Added backdrop click-to-close functionality for mobile chat overlay
  - Integrated chat toggle button with media controls for seamless mobile experience
  - Maintained all chat functionality in mobile overlay including Next button and message history

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built using React with TypeScript and follows a component-based architecture. It uses Vite as the build tool and development server, providing fast hot module replacement. The UI is constructed with shadcn/ui components built on top of Radix UI primitives, ensuring accessibility and consistent design patterns. Styling is handled through Tailwind CSS with custom CSS variables for theming.

Key architectural decisions:
- **Wouter for routing**: Lightweight client-side routing solution chosen over React Router for minimal bundle size
- **TanStack Query**: Handles server state management and API interactions with built-in caching and error handling
- **Custom WebSocket hook**: Encapsulates all real-time communication logic in a reusable hook pattern
- **Component separation**: Clear separation between landing page and chat interface components for better maintainability

### Backend Architecture
The server uses Express.js with WebSocket support via the 'ws' library for real-time bidirectional communication. The architecture follows a modular pattern with separated concerns for routing, storage, and WebSocket handling.

Key architectural decisions:
- **Single server approach**: Both HTTP API and WebSocket connections are handled by the same Express server to simplify deployment in Replit
- **In-memory storage for MVP**: Uses a custom storage abstraction with in-memory implementation for rapid development, designed to be easily replaceable with persistent storage
- **Queue-based matchmaking**: Simple first-in-first-out queue system for pairing users randomly
- **Heartbeat mechanism**: Implements WebSocket ping/pong to detect and clean up broken connections

### Data Storage Solutions
Currently implements an in-memory storage system with a well-defined interface that can be easily swapped for persistent solutions like PostgreSQL with Drizzle ORM (configuration already present).

Storage components:
- **Audit logs**: Comprehensive logging of all user actions including connections, disconnections, messages, and reports
- **User queue management**: Temporary storage of users waiting to be matched
- **Chat room tracking**: Active chat sessions and user-to-room mappings
- **Connection monitoring**: WebSocket connection states and cleanup mechanisms

### Real-time Communication
WebSocket implementation provides instant messaging capabilities with automatic connection management and error recovery. Now enhanced with WebRTC support for video chat functionality.

Features:
- **Automatic reconnection**: Client automatically attempts to reconnect on connection loss
- **Message queuing**: Ensures message delivery reliability during brief connection issues
- **Connection state management**: Clear state transitions between connecting, waiting, paired, video_waiting, video_paired, and disconnected states
- **Partner notification**: Immediate notification when chat partner disconnects
- **WebRTC signaling**: Peer-to-peer video calling with offer/answer/ICE candidate exchange
- **Media controls**: Real-time video and audio toggle functionality with state synchronization
- **Dual chat modes**: Seamless switching between text-only and video chat experiences

### Security and Moderation
Built-in safety features for content moderation and user protection.

Implementation:
- **Report functionality**: Users can flag inappropriate behavior with full audit trail
- **Audit logging**: Complete tracking of all user interactions for moderation review
- **IP and User-Agent tracking**: Basic metadata collection for abuse investigation
- **Automatic cleanup**: Broken connections are detected and cleaned up to prevent resource leaks

## External Dependencies

### Frontend Dependencies
- **React**: Core framework for building the user interface
- **Vite**: Build tool and development server with fast HMR
- **shadcn/ui + Radix UI**: Component library providing accessible, customizable UI primitives
- **Tailwind CSS**: Utility-first CSS framework for styling
- **TanStack Query**: Server state management and data fetching
- **Wouter**: Lightweight client-side routing
- **Lucide React**: Icon library for consistent iconography

### Backend Dependencies
- **Express.js**: Web application framework for Node.js
- **ws**: WebSocket library for real-time communication
- **Drizzle ORM**: SQL ORM with TypeScript support (configured but not actively used in MVP)
- **@neondatabase/serverless**: PostgreSQL driver for serverless environments
- **connect-pg-simple**: PostgreSQL session store (configured for future use)

### Development and Build Tools
- **TypeScript**: Type safety across the entire application
- **ESBuild**: Fast JavaScript bundler for production builds
- **TSX**: TypeScript execution environment for development
- **Drizzle Kit**: Database migration and schema management tools

### Third-party Services
- **Neon Database**: Serverless PostgreSQL database (configured via environment variables)
- **Replit**: Hosting platform with built-in development environment support
- **WebSocket Protocol**: Standard protocol for real-time bidirectional communication

The application is designed to run entirely within the Replit environment, with all external dependencies being npm packages or standard web protocols. The database configuration is present but the MVP uses in-memory storage for immediate functionality.