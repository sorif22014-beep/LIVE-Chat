import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface User {
  socketId: string;
  username: string;
  isMuted: boolean;
  isHandRaised: boolean;
  isHost: boolean;
  joinedAt: number;
  avatarUrl?: string;
}

interface Room {
  roomId: string;
  password?: string;
  users: Map<string, User>;
}

const activeRooms = new Map<string, Room>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));
  const server = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

  // Google Search Grounding with gemini-3.5-flash
  app.post("/api/ai/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const interaction = await ai.interactions.create({
        model: "gemini-3.5-flash",
        input: query,
        tools: [{ type: "google_search" }],
      });

      let fullOutput = "";
      for (const step of interaction.steps) {
        if (step.type === "model_output") {
          const textContent: any = step.content?.find((c: any) => c.type === "text");
          if (textContent && textContent.text) {
            fullOutput += textContent.text;
          }
        }
      }

      res.json({ text: fullOutput });
    } catch (err: any) {
      console.error("AI Search Grounding error:", err);
      res.status(500).json({ error: err.message || "Search grounding failed" });
    }
  });

  // Create and Edit Images using gemini-3.1-flash-image
  app.post("/api/ai/generate-image", async (req, res) => {
    try {
      const { prompt, image } = req.body; // image can be a base64 string
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      let interaction;
      if (image) {
        // Edit image
        // Base64 needs to strip headers if present (e.g. data:image/png;base64,...)
        let base64Data = image;
        let mimeType = "image/png";
        if (image.includes(";base64,")) {
          const parts = image.split(";base64,");
          mimeType = parts[0].replace("data:", "");
          base64Data = parts[1];
        }

        interaction = await ai.interactions.create({
          model: "gemini-3.1-flash-image",
          input: [
            {
              type: "image",
              data: base64Data,
              mime_type: mimeType,
            },
            {
              type: "text",
              text: prompt,
            },
          ],
          response_modalities: ["image", "text"],
        });
      } else {
        // Create new image
        interaction = await ai.interactions.create({
          model: "gemini-3.1-flash-image",
          input: prompt,
          response_modalities: ["image", "text"],
          generation_config: {
            image_config: {
              aspect_ratio: "1:1",
              image_size: "1K",
            },
          },
        });
      }

      let generatedImageUrl = "";
      for (const step of interaction.steps) {
        if (step.type === "model_output") {
          const imageContent = step.content?.find((c: any) => c.type === "image");
          if (imageContent && imageContent.data) {
            const mimeType = imageContent.mime_type || "image/png";
            generatedImageUrl = `data:${mimeType};base64,${imageContent.data}`;
            break;
          }
        }
      }

      if (!generatedImageUrl) {
        return res.status(500).json({ error: "No image was generated" });
      }

      res.json({ imageUrl: generatedImageUrl });
    } catch (err: any) {
      console.error("Image generation error:", err);
      res.status(500).json({ error: err.message || "Image generation failed" });
    }
  });

  // Generate Music using lyria-3-clip-preview / lyria-3-pro-preview
  app.post("/api/ai/generate-music", async (req, res) => {
    try {
      const { prompt, isPro } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const model = isPro ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: prompt,
      });

      let audioBase64 = "";
      let lyrics = "";
      let mimeType = "audio/wav";

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !lyrics) {
            lyrics = part.text;
          }
        }
      }

      if (!audioBase64) {
        return res.status(500).json({ error: "No music audio was generated" });
      }

      res.json({ audioBase64, lyrics, mimeType });
    } catch (err: any) {
      console.error("Music generation error:", err);
      res.status(500).json({ error: err.message || "Music generation failed" });
    }
  });

  app.get("/api/rooms", (req, res) => {
    const roomsList = Array.from(activeRooms.values()).map(room => ({
      roomId: room.roomId,
      usersCount: room.users.size,
      users: Array.from(room.users.values()).map(u => ({
        username: u.username,
        avatarUrl: u.avatarUrl,
        isHost: u.isHost,
      })),
      hasPassword: !!room.password,
    }));
    res.json(roomsList);
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

  // Helper to broadcast active rooms list to anyone in the lobby
  function broadcastRoomsUpdate() {
    const roomsList = Array.from(activeRooms.values()).map(room => ({
      roomId: room.roomId,
      usersCount: room.users.size,
      users: Array.from(room.users.values()).map(u => ({
        username: u.username,
        avatarUrl: u.avatarUrl,
        isHost: u.isHost,
      })),
      hasPassword: !!room.password,
    }));
    io.to("lobby").emit("lobby-rooms-update", roomsList);
  }

  // Socket.IO Room & WebRTC Signaling Logic
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;

    // Lobby Socket Listeners
    socket.on("join-lobby", () => {
      socket.join("lobby");
      // Send active rooms list immediately
      const roomsList = Array.from(activeRooms.values()).map(room => ({
        roomId: room.roomId,
        usersCount: room.users.size,
        users: Array.from(room.users.values()).map(u => ({
          username: u.username,
          avatarUrl: u.avatarUrl,
          isHost: u.isHost,
        })),
        hasPassword: !!room.password,
      }));
      socket.emit("lobby-rooms-update", roomsList);
    });

    socket.on("leave-lobby", () => {
      socket.leave("lobby");
    });

    socket.on("send-lobby-chat", ({ username, text, avatarUrl }) => {
      const chatMsg = {
        id: `lobby-msg-${Date.now()}-${Math.random()}`,
        username,
        text,
        avatarUrl,
        timestamp: Date.now(),
      };
      io.to("lobby").emit("lobby-chat-message", chatMsg);
    });

    socket.on("join-room", ({ roomId, username, password, bypass, isMuted = false, isHandRaised = false, avatarUrl }) => {
      try {
        if (!roomId || !username) {
          socket.emit("error-message", "Room ID and username are required.");
          return;
        }

        const isNewRoom = !activeRooms.has(roomId);

        // Retrieve or initialize the room
        let room = activeRooms.get(roomId);
        if (room) {
          // Room exists, check password if it has one and we are NOT bypassing
          if (room.password && !bypass) {
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
          avatarUrl: avatarUrl || undefined,
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
            avatarUrl: u.avatarUrl,
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
          avatarUrl,
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
        
        // Broadcast rooms list update to the lobby
        broadcastRoomsUpdate();

        // If newly created room, broadcast live alert to lobby
        if (isNewRoom) {
          io.to("lobby").emit("lobby-announcement", {
            id: `announce-${Date.now()}-${Math.random()}`,
            username,
            roomId,
            avatarUrl,
            timestamp: Date.now(),
          });
        }
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

    socket.on("update-avatar", ({ avatarUrl }) => {
      if (!currentRoomId) return;
      const room = activeRooms.get(currentRoomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user) {
        user.avatarUrl = avatarUrl;
        io.to(currentRoomId).emit("user-state-changed", {
          socketId: socket.id,
          avatarUrl,
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
        avatarUrl: user.avatarUrl,
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
        broadcastRoomsUpdate();
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

      broadcastRoomsUpdate();
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
