import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";

interface User {
  socketId: string;
  username: string;
  isMuted: boolean;
  isHandRaised: boolean;
  isHost: boolean;
  joinedAt: number;
}

interface Room {
  roomId: string;
  password?: string;
  users: Map<string, User>;
}

const activeRooms = new Map<string, Room>();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Socket.IO configuration with CORS enabled for standard development environments
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // REST API Endpoints
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", activeRoomsCount: activeRooms.size });
  });

  app.get("/api/rooms/:roomId", (req, res) => {
    const { roomId } = req.params;
    const room = activeRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const usersList = Array.from(room.users.values()).map(u => ({
      username: u.username,
      isHost: u.isHost,
    }));
    res.json({ roomId, usersCount: room.users.size, users: usersList });
  });

  // Socket.IO Room & WebRTC Signaling Logic
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;

    socket.on("join-room", ({ roomId, username, password, isMuted = false, isHandRaised = false }) => {
      try {
        if (!roomId || !username) {
          socket.emit("error-message", "Room ID and username are required.");
          return;
        }

        // Retrieve or initialize the room
        let room = activeRooms.get(roomId);
        if (room) {
          // Room exists, check password if it has one
          if (room.password) {
            if (!password) {
              socket.emit("password-required", { roomId, username });
              return;
            }
            if (room.password !== password) {
              socket.emit("join-failed", "incorrect-password");
              return;
            }
          }
        } else {
          // Creating room, store optional password
          room = { roomId, password: password || undefined, users: new Map() };
          activeRooms.set(roomId, room);
        }

        currentRoomId = roomId;
        socket.join(roomId);

        // The first user to join is designated as the Host
        const isHost = room.users.size === 0;

        const newUser: User = {
          socketId: socket.id,
          username,
          isMuted,
          isHandRaised,
          isHost,
          joinedAt: Date.now(),
        };

        room.users.set(socket.id, newUser);

        // Prepare existing users list to send to the joiner
        const existingUsers = Array.from(room.users.values())
          .filter((u) => u.socketId !== socket.id)
          .map((u) => ({
            socketId: u.socketId,
            username: u.username,
            isMuted: u.isMuted,
            isHandRaised: u.isHandRaised,
            isHost: u.isHost,
          }));

        // Send confirmation to the joining user
        socket.emit("room-joined", {
          users: existingUsers,
          isHost,
          myId: socket.id,
        });

        // Broadcast user-joined event to existing participants in the room
        socket.to(roomId).emit("user-joined", {
          socketId: socket.id,
          username,
          isMuted,
          isHandRaised,
          isHost,
        });

        // System notification message
        const systemMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          socketId: "system",
          username: "System",
          text: `${username} joined the chat`,
          textBn: `${username} আড্ডায় যোগ দিয়েছেন`,
          timestamp: Date.now(),
          type: "system",
        };
        io.to(roomId).emit("chat-message", systemMessage);

        console.log(`[Socket] User ${username} (${socket.id}) joined room ${roomId}. Host: ${isHost}`);
      } catch (err) {
        console.error("Error in join-room handler:", err);
        socket.emit("error-message", "An error occurred while joining the room.");
      }
    });

    // Relay SDP Offer/Answer to specific targeted peers
    socket.on("relay-sdp", ({ targetSocketId, sdp }) => {
      if (currentRoomId) {
        io.to(targetSocketId).emit("relay-sdp", {
          senderSocketId: socket.id,
          sdp,
        });
      }
    });

    // Relay ICE Candidates to targeted peers
    socket.on("relay-ice", ({ targetSocketId, candidate }) => {
      if (currentRoomId) {
        io.to(targetSocketId).emit("relay-ice", {
          senderSocketId: socket.id,
          candidate,
        });
      }
    });

    // Handle user state updates (e.g. mute toggle, hand raise)
    socket.on("toggle-mute", ({ isMuted }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user) {
        user.isMuted = isMuted;
        socket.to(currentRoomId).emit("user-state-changed", {
          socketId: socket.id,
          isMuted,
        });
      }
    });

    socket.on("toggle-raise-hand", ({ isHandRaised }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user) {
        user.isHandRaised = isHandRaised;
        io.to(currentRoomId).emit("user-state-changed", {
          socketId: socket.id,
          isHandRaised,
        });
      }
    });

    // Text Chat messaging within the active room
    socket.on("send-chat", ({ text }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;

      const chatMsg = {
        id: `msg-${Date.now()}-${Math.random()}`,
        socketId: socket.id,
        username: user.username,
        text,
        timestamp: Date.now(),
        type: "user",
      };

      io.to(currentRoomId).emit("chat-message", chatMsg);
    });

    // Host Control: Mute another user
    socket.on("host-mute-user", ({ targetSocketId, isMuted }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const sender = room.users.get(socket.id);
      if (!sender || !sender.isHost) {
        socket.emit("error-message", "Unauthorized host command.");
        return;
      }

      const targetUser = room.users.get(targetSocketId);
      if (targetUser) {
        targetUser.isMuted = isMuted;
        // Notify the specific target peer to mute their microphone track
        io.to(targetSocketId).emit("force-mute", { isMuted });
        // Notify all clients in the room about the target state change
        io.to(currentRoomId).emit("user-state-changed", {
          socketId: targetSocketId,
          isMuted,
        });

        // Broadcast a system message
        const systemMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          socketId: "system",
          username: "System",
          text: `${targetUser.username} was ${isMuted ? "muted" : "unmuted"} by the host`,
          textBn: `হোস্ট ${targetUser.username}-কে ${isMuted ? "মিউট" : "আনমিউট"} করেছেন`,
          timestamp: Date.now(),
          type: "system",
        };
        io.to(currentRoomId).emit("chat-message", systemMessage);
      }
    });

    // Host Control: Remove/Kick another user
    socket.on("host-kick-user", ({ targetSocketId }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const sender = room.users.get(socket.id);
      if (!sender || !sender.isHost) {
        socket.emit("error-message", "Unauthorized host command.");
        return;
      }

      const targetUser = room.users.get(targetSocketId);
      if (targetUser) {
        io.to(targetSocketId).emit("force-kick");
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.leave(currentRoomId);
        }
        
        room.users.delete(targetSocketId);
        io.to(currentRoomId).emit("user-left", { socketId: targetSocketId });

        const systemMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          socketId: "system",
          username: "System",
          text: `${targetUser.username} was removed by the host`,
          textBn: `হোস্ট ${targetUser.username}-কে গ্রুপ থেকে বের করে দিয়েছেন`,
          timestamp: Date.now(),
          type: "system",
        };
        io.to(currentRoomId).emit("chat-message", systemMessage);
      }
    });

    // Host Control: Lower another user's hand
    socket.on("host-lower-hand", ({ targetSocketId }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const sender = room.users.get(socket.id);
      if (!sender || !sender.isHost) {
        socket.emit("error-message", "Unauthorized host command.");
        return;
      }

      const targetUser = room.users.get(targetSocketId);
      if (targetUser) {
        targetUser.isHandRaised = false;
        io.to(targetSocketId).emit("force-lower-hand");
        io.to(currentRoomId).emit("user-state-changed", {
          socketId: targetSocketId,
          isHandRaised: false,
        });
      }
    });

    // Handle explicit leaving of room
    socket.on("leave-room", () => {
      handleUserDeparture(socket);
    });

    // Handle hard disconnection
    socket.on("disconnect", () => {
      handleUserDeparture(socket);
    });

    function handleUserDeparture(s: Socket) {
      if (!currentRoomId) return;
      const rId = currentRoomId;
      currentRoomId = null; // Prevent duplicate execution of departure logic

      const room = activeRooms.get(rId);
      if (!room) return;

      const user = room.users.get(s.id);
      if (!user) return;

      room.users.delete(s.id);
      console.log(`[Socket] User ${user.username} left room ${rId}.`);

      // Inform other room participants
      s.to(rId).emit("user-left", { socketId: s.id });

      // System notification
      const systemMessage = {
        id: `sys-${Date.now()}-${Math.random()}`,
        socketId: "system",
        username: "System",
        text: `${user.username} left the chat`,
        textBn: `${user.username} আড্ডা থেকে বিদায় নিয়েছেন`,
        timestamp: Date.now(),
        type: "system",
      };
      io.to(rId).emit("chat-message", systemMessage);

      // If room is empty, clear it from active map
      if (room.users.size === 0) {
        activeRooms.delete(rId);
        console.log(`[Socket] Room ${rId} is now empty and has been removed.`);
        return;
      }

      // If the user who left was the Host, delegate Host status to the oldest remaining participant
      if (user.isHost) {
        const remainingUsers = Array.from(room.users.values()).sort(
          (a, b) => a.joinedAt - b.joinedAt
        );
        if (remainingUsers.length > 0) {
          const newHost = remainingUsers[0];
          newHost.isHost = true;
          io.to(rId).emit("host-changed", { hostSocketId: newHost.socketId });

          const hostMsg = {
            id: `sys-${Date.now()}-${Math.random()}`,
            socketId: "system",
            username: "System",
            text: `${newHost.username} is now the host`,
            textBn: `${newHost.username} এখন হোস্ট-এর দায়িত্ব পেয়েছেন`,
            timestamp: Date.now(),
            type: "system",
          };
          io.to(rId).emit("chat-message", hostMsg);
          console.log(`[Socket] Host changed to ${newHost.username} in room ${rId}.`);
        }
      }
    }
  });

  // Serve Frontend assets using Vite middleware in development or static Express in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Voice Group Chat running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Bootstrapping failed:", err);
});
