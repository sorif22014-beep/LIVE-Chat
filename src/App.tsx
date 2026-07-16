import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, 
  MicOff, 
  Hand, 
  LogOut, 
  Copy, 
  Check, 
  MessageSquare, 
  Users, 
  Languages, 
  ChevronRight, 
  Send,
  Sparkles,
  Activity,
  AlertTriangle,
  Smile,
  Crown,
  Lock,
  Disc,
  PlusCircle,
  X
} from "lucide-react";
import { Participant, ChatMessage, Language, translations } from "./types";
import { Lobby } from "./components/Lobby";
import { ParticipantCard } from "./components/ParticipantCard";

// Invisible audio player component to prevent React stream garbage collection
const AudioPlayer: React.FC<{ stream: MediaStream; socketId: string }> = ({ stream, socketId }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      // Ensure the browser doesn't block autoplay
      audioRef.current.play().catch((err) => {
        console.warn(`[Audio] Autoplay failed or blocked for peer ${socketId}:`, err);
      });
    }
  }, [stream, socketId]);

  return <audio id={`audio-${socketId}`} ref={audioRef} autoPlay playsInline className="hidden" />;
};

export default function App() {
  const [language, setLanguage] = useState<Language>("bn");
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState("");
  const [myAvatarUrl, setMyAvatarUrl] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [myId, setMyId] = useState("");
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const t = translations[language];

  // Room participants list
  const [participants, setParticipants] = useState<Participant[]>([]);
  // Mobile responsive grid seats layout
  const [maxSeats, setMaxSeats] = useState(5);
  // Local microphone status
  const [isMuted, setIsMuted] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  
  // Chat messaging
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active speaking tracking
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  // Room notifications for user joins
  const [roomNotifications, setRoomNotifications] = useState<any[]>([]);

  // Password prompt & recording states
  const [passwordRequiredData, setPasswordRequiredData] = useState<{ roomId: string; username: string } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [promptPasswordInput, setPromptPasswordInput] = useState("");

  // Recording session states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMixStreamRef = useRef<any>(null);

  // WebRTC & Socket.IO references (stored in refs to preserve across renders)
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [peerStreams, setPeerStreams] = useState<{ [socketId: string]: MediaStream }>({});
  
  // Audio analysis refs for speech indicators
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; dataArray: Uint8Array }>>(new Map());
  const speakingCheckIntervalRef = useRef<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Check URL query parameters for direct room joining
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room") || params.get("roomId");
    if (roomParam) {
      setRoomId(roomParam.toLowerCase());
    }
  }, []);

  // Autoscroll chat on new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      
      // Secondary fallback to absolutely guarantee scroll-to-bottom on all viewports
      const container = chatEndRef.current.parentElement;
      if (container) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }
    }
  }, [chatMessages]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupConnections();
    };
  }, []);

  // Set up local microphone stream
  const getLocalMicrophone = async (): Promise<MediaStream> => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  // Connect to room (Signal server and establish WebRTC mesh)
  const handleJoinRoom = async (userNickname: string, selectedRoomId: string, password?: string, avatarUrl?: string, bypass?: boolean) => {
    try {
      setUsername(userNickname);
      setRoomId(selectedRoomId);
      if (avatarUrl) {
        setMyAvatarUrl(avatarUrl);
      }
      setErrorMsg(null);
      setPasswordRequiredData(null); // Clear previous prompt if successfully retrying

      // 1. Gain microphone stream access
      const localStream = await getLocalMicrophone();
      // Ensure state matches actual stream track status
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
      }

      // Initialize speech analyzer for oneself
      setupLocalSpeechIndicator(localStream);

      // 2. Initialize Socket.IO connection
      const socketUrl = window.location.origin;
      const socket = io(socketUrl);
      socketRef.current = socket;

      // Check bypass in URL query if not passed explicitly
      const queryBypass = new URLSearchParams(window.location.search).get("bypass") === "true";
      const isBypass = bypass !== undefined ? bypass : queryBypass;

      // 3. Emit Join Event
      socket.emit("join-room", {
        roomId: selectedRoomId,
        username: userNickname,
        password,
        bypass: isBypass,
        isMuted,
        isHandRaised,
        avatarUrl,
      });

      // 4. Configure Socket listeners
      setupSocketListeners(socket, localStream, userNickname, avatarUrl || "");
      setInRoom(true);

    } catch (err: any) {
      console.error("[Room Join Failed] Mic permission is necessary:", err);
      setErrorMsg(t.errorMicRequired);
    }
  };

  // Configure Socket.IO event listeners
  const setupSocketListeners = (socket: Socket, localStream: MediaStream, nickname: string, avatar: string) => {
    
    socket.on("connect", () => {
      setIsSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setIsSocketConnected(false);
    });

    // Server requests room password
    socket.on("password-required", ({ roomId, username }) => {
      cleanupConnections();
      setPasswordRequiredData({ roomId, username });
      setPasswordError(null);
    });

    // Handle join failures (such as incorrect password)
    socket.on("join-failed", (reason: string) => {
      if (reason === "incorrect-password") {
        cleanupConnections();
        setPasswordError(t.incorrectPassword);
        setPasswordRequiredData({ roomId, username });
      }
    });

    // Triggered when client successfully registers on the server room
    socket.on("room-joined", ({ users, isHost: hostStatus, myId: assignedId }) => {
      setMyId(assignedId);
      setIsHost(hostStatus);
      setIsSocketConnected(true);
      
      // Seed initial participants list
      const initialParticipants = users.map((u: any) => ({
        socketId: u.socketId,
        username: u.username,
        isMuted: u.isMuted,
        isHandRaised: u.isHandRaised,
        isHost: u.isHost,
        avatarUrl: u.avatarUrl,
      }));
      setParticipants(initialParticipants);

      // Establish peer connections to ALL existing users in the room
      initialParticipants.forEach((peer: Participant) => {
        initiatePeerConnection(peer.socketId, localStream, socket);
      });

      // Show welcome message for ourselves!
      const welcomeSelf: ChatMessage = {
        id: `welcome-self-${Date.now()}`,
        socketId: "system",
        username: nickname,
        text: `joined the room. Welcome!`,
        textBn: `রুমে যোগদান করেছে। তাকে স্বাগত!`,
        timestamp: Date.now(),
        type: "system",
        subtype: "welcome",
        avatarUrl: avatar,
      };
      setChatMessages((prev) => [...prev, welcomeSelf]);

      // Float/toast notification for self
      const selfNotifId = `room-join-self-${Date.now()}`;
      setRoomNotifications((prev) => [
        ...prev,
        {
          id: selfNotifId,
          username: nickname,
          avatarUrl: avatar,
          timestamp: Date.now(),
        }
      ]);
      setTimeout(() => {
        setRoomNotifications((prev) => prev.filter((n) => n.id !== selfNotifId));
      }, 6000);
    });

    // Handle incoming participant joining
    socket.on("user-joined", (newUser: Participant) => {
      setParticipants((prev) => {
        // Prevent duplicate addition in case of lag/race conditions
        if (prev.some((p) => p.socketId === newUser.socketId)) return prev;
        return [...prev, newUser];
      });

      // Show welcome message for other joining user!
      const welcomeOther: ChatMessage = {
        id: `welcome-${newUser.socketId}-${Date.now()}`,
        socketId: "system",
        username: newUser.username,
        text: `joined the room. Welcome!`,
        textBn: `রুমে যোগদান করেছে। তাকে স্বাগত!`,
        timestamp: Date.now(),
        type: "system",
        subtype: "welcome",
        avatarUrl: newUser.avatarUrl,
      };
      setChatMessages((prev) => [...prev, welcomeOther]);

      // Float/toast notification for others joining
      const otherNotifId = `room-join-other-${newUser.socketId}-${Date.now()}`;
      setRoomNotifications((prev) => [
        ...prev,
        {
          id: otherNotifId,
          username: newUser.username,
          avatarUrl: newUser.avatarUrl,
          timestamp: Date.now(),
        }
      ]);
      setTimeout(() => {
        setRoomNotifications((prev) => prev.filter((n) => n.id !== otherNotifId));
      }, 6000);
    });

    // Handle signaling: SDP offers & answers
    socket.on("relay-sdp", async ({ senderSocketId, sdp }) => {
      try {
        let pc = peerConnectionsRef.current.get(senderSocketId);

        if (!pc) {
          // If no connection exists, construct one (this is typical for answering offers)
          pc = createPeerConnection(senderSocketId, localStream, socket);
          peerConnectionsRef.current.set(senderSocketId, pc);
        }

        if (sdp.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socket.emit("relay-sdp", {
            targetSocketId: senderSocketId,
            sdp: answer,
          });
        } else if (sdp.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      } catch (err) {
        console.error("[WebRTC] Error handling SDP:", err);
      }
    });

    // Handle signaling: ICE Candidates
    socket.on("relay-ice", async ({ senderSocketId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("[WebRTC] Error adding ICE Candidate:", err);
      }
    });

    // Handle remote state updates (mute, raise hand, avatar change)
    socket.on("user-state-changed", ({ socketId, isMuted: peerMuted, isHandRaised: peerHand, avatarUrl: peerAvatar }) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.socketId === socketId) {
            return {
              ...p,
              isMuted: peerMuted !== undefined ? peerMuted : p.isMuted,
              isHandRaised: peerHand !== undefined ? peerHand : p.isHandRaised,
              avatarUrl: peerAvatar !== undefined ? peerAvatar : p.avatarUrl,
            };
          }
          return p;
        })
      );
    });

    // Host status reassignment
    socket.on("host-changed", ({ hostSocketId }) => {
      setIsHost(socket.id === hostSocketId);
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          isHost: p.socketId === hostSocketId,
        }))
      );
    });

    // Text chat message broadcast
    socket.on("chat-message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    // Host Force controls: muted by host
    socket.on("force-mute", ({ isMuted: forceMuteState }) => {
      setIsMuted(forceMuteState);
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !forceMuteState;
      }
      socket.emit("toggle-mute", { isMuted: forceMuteState });
      
      // Push alert
      setErrorMsg(forceMuteState ? t.forceMutedMsg : null);
      setTimeout(() => setErrorMsg(null), 5000);
    });

    // Host Force controls: removed from room
    socket.on("force-kick", () => {
      cleanupConnections();
      setInRoom(false);
      setErrorMsg(t.kickedMsg);
      setTimeout(() => setErrorMsg(null), 8000);
    });

    // Host Force controls: lower hand
    socket.on("force-lower-hand", () => {
      setIsHandRaised(false);
      socket.emit("toggle-raise-hand", { isHandRaised: false });
    });

    // Handle user departing
    socket.on("user-left", ({ socketId }) => {
      // Discard RTCPeerConnection
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(socketId);
      }

      // Discard speech analysers
      analysersRef.current.delete(socketId);

      // Discard streaming elements
      setPeerStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });

      // Discard participant list
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
    });

    socket.on("error-message", (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    });

    socket.on("connect_error", () => {
      setErrorMsg(language === "en" ? "Connection error. Trying to reconnect..." : "সার্ভার সংযোগ সমস্যা। পুনরায় চেষ্টা করা হচ্ছে...");
    });
  };

  // Initiate an outgoing connection to an existing room peer
  const initiatePeerConnection = async (
    targetSocketId: string,
    localStream: MediaStream,
    socket: Socket
  ) => {
    try {
      const pc = createPeerConnection(targetSocketId, localStream, socket);
      peerConnectionsRef.current.set(targetSocketId, pc);

      // Create & send SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("relay-sdp", {
        targetSocketId,
        sdp: offer,
      });
    } catch (err) {
      console.error("[WebRTC] Error initiating peer connection:", err);
    }
  };

  // Instantiate and configure RTCPeerConnection
  const createPeerConnection = (
    targetSocketId: string,
    localStream: MediaStream,
    socket: Socket
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });

    // Feed local audio tracks into connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Share connection ICE candidates back to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("relay-ice", {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // When peer stream is received, play via dynamic HTML <audio> and inspect for speech indicators
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteStream) {
        setPeerStreams((prev) => ({
          ...prev,
          [targetSocketId]: remoteStream,
        }));
        setupRemoteSpeechIndicator(targetSocketId, remoteStream);
      }
    };

    return pc;
  };

  // Setup Web Audio API speech detection for local stream
  const setupLocalSpeechIndicator = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }

      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      source.connect(analyser);

      analysersRef.current.set("me", {
        analyser,
        dataArray: new Uint8Array(analyser.frequencyBinCount),
      });

      startSpeechCheckLoop();
    } catch (err) {
      console.warn("Speech indicator setup failed:", err);
    }
  };

  // Setup Web Audio API speech detection for a remote peer stream
  const setupRemoteSpeechIndicator = (socketId: string, stream: MediaStream) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      analysersRef.current.set(socketId, {
        analyser,
        dataArray: new Uint8Array(analyser.frequencyBinCount),
      });
    } catch (err) {
      console.warn(`Remote speech indicator setup failed for ${socketId}:`, err);
    }
  };

  // Periodic polling check to determine which streams exceed volume thresholds
  const startSpeechCheckLoop = () => {
    if (speakingCheckIntervalRef.current) return;

    speakingCheckIntervalRef.current = window.setInterval(() => {
      const currentlySpeaking = new Set<string>();

      analysersRef.current.forEach(({ analyser, dataArray }, socketId) => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Threshold level to filter noise and detect talking
        if (average > 18) {
          currentlySpeaking.add(socketId);
        }
      });

      // Update speaker map
      setActiveSpeakers(currentlySpeaking);
    }, 200);
  };

  // Toggle mixed room session audio recording
  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecordingSession();
    } else {
      startRecordingSession();
    }
  };

  const startRecordingSession = () => {
    try {
      if (!inRoom || !localStreamRef.current) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        alert("Web Audio API not supported in this browser.");
        return;
      }

      // Create a mixed audio context
      const recordingContext = new AudioCtx();
      const mixedDest = recordingContext.createMediaStreamDestination();

      // 1. Add local microphone to the mix
      const localSource = recordingContext.createMediaStreamSource(localStreamRef.current);
      localSource.connect(mixedDest);

      // 2. Add all other active peer streams to the mix
      Object.entries(peerStreams).forEach(([socketId, stream]) => {
        try {
          const peerSource = recordingContext.createMediaStreamSource(stream);
          peerSource.connect(mixedDest);
        } catch (e) {
          console.warn(`Failed to mix audio stream for peer ${socketId}:`, e);
        }
      });

      // 3. Set up MediaRecorder on the mixed destination stream
      const options = { mimeType: "audio/webm" };
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(mixedDest.stream, options);
      } catch (e) {
        mediaRecorder = new MediaRecorder(mixedDest.stream);
      }

      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        const extension = mediaRecorder.mimeType.includes("ogg") ? "ogg" : "webm";
        a.download = `Surokkha-Adda-Recording-${roomId}-${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        try {
          recordingContext.close();
        } catch (e) {}
      };

      mediaRecorder.start();
      setIsRecording(true);
      recordingMixStreamRef.current = recordingContext;

      setErrorMsg(t.recordingStarted);
      setTimeout(() => setErrorMsg(null), 5000);

    } catch (err) {
      console.error("Failed to start session recording:", err);
      setErrorMsg("Failed to start recording. Ensure microphone and audio resources are connected.");
    }
  };

  const stopRecordingSession = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setErrorMsg(t.recordingStopped);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // Copy meeting link to clipboard
  const handleCopyLink = () => {
    // Generate joining URL
    const url = `${window.location.origin}/?room=${roomId}&bypass=true`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch((err) => {
        console.warn("Clipboard failed, using manual fallback:", err);
        // Fallback alert
        alert(`${t.copyLink}: ${url}`);
      });
  };

  // Toggle local mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !nextMuted;
    }

    if (socketRef.current) {
      socketRef.current.emit("toggle-mute", { isMuted: nextMuted });
    }
  };

  // Toggle local hand raise
  const handleToggleHand = () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);

    if (socketRef.current) {
      socketRef.current.emit("toggle-raise-hand", { isHandRaised: nextHand });
    }
  };

  // Update local avatar picture inside active conversation
  const handleUpdateAvatar = (newAvatarUrl: string) => {
    setMyAvatarUrl(newAvatarUrl);
    if (socketRef.current) {
      socketRef.current.emit("update-avatar", { avatarUrl: newAvatarUrl });
    }
  };

  // Send textual message
  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;

    socketRef.current.emit("send-chat", { text: chatInput.trim() });
    setChatInput("");
  };

  // Quick Emoji Click trigger
  const handleQuickEmoji = (emoji: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("send-chat", { text: emoji });
  };

  // Host Action: force mute a participant
  const handleHostMutePeer = (targetSocketId: string, currentMuted: boolean) => {
    if (socketRef.current && isHost) {
      socketRef.current.emit("host-mute-user", {
        targetSocketId,
        isMuted: !currentMuted,
      });
    }
  };

  // Host Action: kick/remove participant
  const handleHostKickPeer = (targetSocketId: string) => {
    if (socketRef.current && isHost) {
      socketRef.current.emit("host-kick-user", { targetSocketId });
    }
  };

  // Host Action: lower peer hand
  const handleHostLowerHand = (targetSocketId: string) => {
    if (socketRef.current && isHost) {
      socketRef.current.emit("host-lower-hand", { targetSocketId });
    }
  };

  // Leave active group conversation and clear all hardware locks
  const handleLeaveRoom = () => {
    cleanupConnections();
    setInRoom(false);
    setErrorMsg(t.roomEnded);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // Clean and close all WebRTC, Audio, and Socket connections
  const cleanupConnections = () => {
    // 1. Tell socket we are leaving
    if (socketRef.current) {
      socketRef.current.emit("leave-room");
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 2. Shut down peer connections
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // 3. Clear audio streams and media hardware locks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // 4. Reset speech indicator loops
    if (speakingCheckIntervalRef.current) {
      clearInterval(speakingCheckIntervalRef.current);
      speakingCheckIntervalRef.current = null;
    }
    analysersRef.current.clear();
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // 5. Reset states
    setIsSocketConnected(false);
    setPeerStreams({});
    setParticipants([]);
    setChatMessages([]);
    setIsHandRaised(false);
    setIsMuted(false);
    setIsHost(false);
  };

  return (
    <div className={`bg-brand-dark text-brand-text flex flex-col font-sans selection:bg-brand-accent/30 selection:text-brand-highlight ${inRoom ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
      
      {/* PASSWORD REQUIRED MODAL OVERLAY */}
      {passwordRequiredData && (
        <div className="fixed inset-0 bg-brand-dark/95 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-brand-panel p-6 rounded-3xl border border-slate-700 max-w-sm w-full shadow-2xl relative">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-4">
                <Lock className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {t.enterPasswordToJoin}
              </h3>
              <p className="text-xs text-brand-light leading-relaxed mb-5">
                {t.passwordRequired}
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!promptPasswordInput.trim()) return;
                  handleJoinRoom(passwordRequiredData.username, passwordRequiredData.roomId, promptPasswordInput.trim());
                }}
                className="w-full space-y-4"
              >
                <input
                  type="password"
                  value={promptPasswordInput}
                  onChange={(e) => setPromptPasswordInput(e.target.value)}
                  placeholder="Enter Room Password"
                  required
                  autoFocus
                  className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-mono text-center"
                />

                {passwordError && (
                  <p className="text-xs text-rose-400 font-bold leading-normal">
                    {passwordError}
                  </p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordRequiredData(null);
                      setPasswordError(null);
                      setPromptPasswordInput("");
                    }}
                    className="flex-1 bg-brand-dark hover:bg-brand-panel border border-slate-700 text-brand-light font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-brand-accent to-brand-highlight text-brand-dark font-extrabold py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer hover:shadow-lg"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Invisible HTML <audio> players for WebRTC incoming voice streams */}
      {Object.entries(peerStreams).map(([socketId, stream]) => (
        <AudioPlayer key={socketId} socketId={socketId} stream={stream} />
      ))}

      {/* RENDER LOBBY */}
      {!inRoom ? (
        <Lobby
          initialRoomId={roomId}
          onJoin={handleJoinRoom}
          language={language}
          onLanguageChange={setLanguage}
        />
      ) : (
        /* RENDER VOICE CHAT ROOM */
        <div className="flex flex-col h-full w-full overflow-hidden relative">
          
          {/* Welcome floating cards overlay */}
          <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {roomNotifications.map((notif) => (
              <div
                key={notif.id}
                className="pointer-events-auto bg-slate-950/95 border-2 border-brand-highlight rounded-2xl p-4 shadow-[0_0_25px_rgba(102,252,241,0.35)] flex items-center gap-3 animate-slideInRight hover:border-white transition-all transform hover:scale-[1.02]"
              >
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-brand-highlight overflow-hidden shrink-0 flex items-center justify-center">
                  {notif.avatarUrl ? (
                    <img src={notif.avatarUrl} alt={notif.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 text-brand-light flex items-center justify-center font-bold text-xs uppercase">
                      {notif.username.slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-[10px] text-amber-400 font-extrabold uppercase tracking-wider">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                    {language === "en" ? "WELCOME 🎤" : "স্বাগতম 🎤"}
                  </span>
                  <p className="text-xs text-white font-bold leading-normal truncate mt-0.5 font-sans">
                    <span className="text-brand-highlight font-sans">{notif.username}</span>{" "}
                    {language === "en" ? "joined the Adda!" : "আড্ডায় যোগ দিয়েছেন!"}
                  </p>
                  <p className="text-[10px] text-brand-light font-medium truncate mt-0.5 font-sans">
                    {language === "en" ? "Let's welcome them!" : "সবাই মিলে তাকে স্বাগতম জানাই!"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Room Header */}
          <header className="bg-brand-panel border-b border-slate-700 py-3.5 px-4 md:px-6 flex flex-wrap gap-4 justify-between items-center z-10 shrink-0">
            {/* Left brand logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-accent rounded-lg flex items-center justify-center animate-pulse">
                <Activity className="w-4.5 h-4.5 text-brand-dark stroke-[2.5]" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-white leading-tight flex items-center gap-1.5">
                  <span>{t.title}</span>
                  <span className="px-1.5 py-0.5 bg-brand-highlight/15 border border-brand-highlight/30 text-[9px] text-brand-highlight font-mono tracking-wider uppercase rounded">
                    Adda Live
                  </span>
                </h2>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isSocketConnected ? "bg-emerald-400" : "bg-rose-500"}`}></span>
                  <span className="text-[10px] text-brand-light font-semibold font-sans">
                    {t.roomCode}: <span className="font-mono font-bold text-brand-highlight">{roomId}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Room Action Triggers */}
            <div className="flex items-center gap-2.5">
              {/* Participants list trigger (top corner) */}
              <button
                onClick={() => setShowParticipantsModal(true)}
                id="participants-toggle-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-brand-dark hover:bg-brand-panel hover:border-brand-accent transition-all text-xs font-bold text-brand-light cursor-pointer relative"
                title={language === "en" ? "Participants List" : "অংশগ্রহণকারীদের তালিকা"}
              >
                <Users className="w-3.5 h-3.5 text-brand-highlight animate-pulse" />
                <span>
                  {language === "en" ? "Participants" : "অংশগ্রহণকারী"}
                </span>
                <span className="bg-brand-accent text-brand-dark text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                  {participants.length + 1}
                </span>
              </button>

              {/* Copy invite link */}
              <button
                onClick={handleCopyLink}
                id="copy-link-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-brand-dark hover:bg-brand-panel hover:border-brand-accent transition-all text-xs font-bold text-brand-light cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-brand-highlight" />
                    <span className="text-brand-highlight">{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-brand-accent" />
                    <span>{t.copyLink}</span>
                  </>
                )}
              </button>

              {/* Language switcher */}
              <button
                onClick={() => setLanguage(language === "en" ? "bn" : "en")}
                id="lang-toggle-btn"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-brand-dark hover:bg-brand-panel text-xs font-bold text-brand-light cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5 text-brand-accent" />
                <span>{language === "en" ? "BN" : "EN"}</span>
              </button>
            </div>
          </header>

          {/* Alert messages bar */}
          {errorMsg && (
            <div className="bg-amber-500/15 border-b border-amber-500/25 px-4 py-2 flex items-center justify-center gap-2 shrink-0 text-xs text-amber-400 font-bold animate-fadeIn">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Main Workspace Panels Layout */}
          <div className="flex-1 flex flex-col overflow-hidden relative bg-brand-dark">
            
            {/* Main Stage & Chat Area (No page scroll, fits together) */}
            <div className="flex-1 flex flex-col p-2.5 md:p-4 gap-2.5 md:gap-4 overflow-hidden min-h-0">
              
              {/* SECTION 1: Seats Grid Room (Live Seats / Rooms) */}
              <div className="bg-brand-panel/20 border border-slate-800/80 p-2.5 md:p-5 rounded-2xl shadow-inner w-full max-h-[190px] md:max-h-[280px] overflow-y-auto shrink-0 scrollbar-thin">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-brand-light tracking-wide uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-highlight animate-pulse"></span>
                    {language === "en" ? "Live Rooms & Seats" : "লাইভ রুম ও সিট সমূহ"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {language === "en" ? `${1 + participants.length}/${maxSeats} Seats` : `${1 + participants.length}/${maxSeats}টি সিট`}
                  </span>
                </div>

                {/* Users Stage grid */}
                <div className="grid grid-cols-5 gap-1.5 md:gap-4 w-full">
                  {/* Local user card (You) */}
                  <ParticipantCard
                    participant={{
                      socketId: "me",
                      username,
                      isMuted,
                      isHandRaised,
                      isHost,
                      avatarUrl: myAvatarUrl,
                    }}
                    isMe={true}
                    isSpeaking={activeSpeakers.has("me")}
                    isLocalHost={isHost}
                    currentLanguage={language}
                    onMutePeer={() => {}}
                    onKickPeer={() => {}}
                    onLowerHand={() => {}}
                    onUpdateAvatar={handleUpdateAvatar}
                  />

                  {/* Other participants */}
                  {participants.map((p) => (
                    <ParticipantCard
                      key={p.socketId}
                      participant={p}
                      isMe={false}
                      isSpeaking={activeSpeakers.has(p.socketId)}
                      isLocalHost={isHost}
                      currentLanguage={language}
                      onMutePeer={handleHostMutePeer}
                      onKickPeer={handleHostKickPeer}
                      onLowerHand={handleHostLowerHand}
                    />
                  ))}

                  {/* Empty Seats Placeholders */}
                  {Array.from({ length: Math.max(0, maxSeats - (1 + participants.length)) }).map((_, idx) => (
                    <div
                      key={`empty-seat-${idx}`}
                      className="relative flex flex-col items-center justify-center p-1.5 md:p-5 rounded-xl md:rounded-2xl border border-dashed border-slate-700/60 bg-brand-panel/10 select-none animate-fadeIn"
                    >
                      <div className="w-9 h-9 md:w-20 md:h-20 rounded-full border border-dashed border-slate-700/80 flex items-center justify-center text-slate-600 bg-brand-dark/20">
                        <PlusCircle className="w-4 h-4 md:w-8 h-8 text-slate-600 stroke-[1.5]" />
                      </div>
                      <div className="text-center mt-1.5 md:mt-4 w-full">
                        <p className="text-[9px] md:text-sm font-semibold text-slate-500 leading-tight">
                          {language === "en" ? "Empty Seat" : "খালি সিট"}
                        </p>
                        <p className="text-[7px] md:text-xs text-slate-600 leading-none mt-0.5">
                          {language === "en" ? "Available" : "ফাঁকা"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Seat management controls */}
                <div className="flex justify-center mt-3.5 w-full">
                  <button
                    onClick={() => setMaxSeats((prev) => prev + 5)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-accent/10 border border-dashed border-brand-accent/30 text-brand-highlight hover:bg-brand-accent/20 hover:border-brand-accent text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
                    title={language === "en" ? "Add 5 Seats" : "+ ৫টি সিট/রুম বাড়ান"}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>{language === "en" ? "Add 5 Seats/Rooms" : "+ ৫টি সিট/রুম বাড়ান"}</span>
                  </button>
                </div>

                {/* If no other users are present, show helper info card inside section */}
                {participants.length === 0 && (
                  <div className="mt-4 p-3 bg-brand-highlight/5 border border-brand-highlight/15 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left animate-fadeIn">
                    <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                      <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <h4 className="text-[11px] font-bold text-white leading-tight">
                          {language === "en" ? "Waiting for others to join..." : "অন্যদের যুক্ত হওয়ার জন্য অপেক্ষা করুন..."}
                        </h4>
                        <p className="text-[9px] text-brand-light/70 mt-0.5 leading-none">
                          {language === "en" ? "Share the invite link with your friends to start chatting!" : "বন্ধুদের সাথে লিঙ্কটি শেয়ার করে চ্যাট শুরু করুন!"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="bg-brand-accent/15 border border-brand-accent/30 text-brand-highlight font-bold px-3 py-1.5 rounded-lg text-[10px] hover:bg-brand-accent/25 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{t.copyLink}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION 2: Live Chat & Comments (Floating transparent design) */}
              <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden relative">
                
                {/* Chat Stream Header (ambient and subtle, no background) */}
                <div className="px-1.5 py-2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-brand-highlight" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      {language === "en" ? "Live Chat & Comments" : "লাইভ কমেন্ট সমূহ"}
                    </span>
                    {chatMessages.length > 0 && (
                      <span className="bg-brand-accent/20 border border-brand-accent/40 text-brand-highlight text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                        {chatMessages.length}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-bold flex items-center gap-1 ${isSocketConnected ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? "bg-emerald-400" : "bg-rose-500"}`}></span>
                    {language === "en" 
                      ? (isSocketConnected ? "Connected" : "Connecting...") 
                      : (isSocketConnected ? "সংযুক্ত" : "সংযোগ হচ্ছে...")}
                  </span>
                </div>

                {/* Messages Stream Container (Floating bubbles, auto-scrolling) */}
                <div className="flex-1 overflow-y-auto px-1 py-1 space-y-2.5 scrollbar-thin">
                  {chatMessages.map((msg) => {
                    const isSystem = msg.type === "system" || msg.socketId === "system";
                    const isOwn = msg.socketId === myId;

                    if (isSystem) {
                      if (msg.subtype === "welcome") {
                        const level = (msg.username.length % 5) + 1;
                        return (
                          <div key={msg.id} className="flex justify-start my-1.5 animate-fadeIn">
                            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/40 rounded-full px-3 py-1 md:py-1.5 flex items-center gap-2 max-w-[95%] shadow-sm">
                              {/* Level Badge */}
                              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold tracking-tight shrink-0">
                                {`LV${level}`}
                              </span>
                              
                              {/* Crown Emote & Username */}
                              <span className="text-[10px] font-extrabold text-emerald-400 truncate max-w-[120px] flex items-center gap-0.5">
                                👑 {msg.username}
                              </span>

                              {/* Welcome text */}
                              <span className="text-[10px] font-bold text-slate-300">
                                {language === "bn" ? "রুমে যোগদান করেছে" : "joined the room"}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className="flex justify-start my-1 animate-fadeIn">
                          <div className="px-3.5 py-1.5 bg-slate-950/40 border border-slate-900/40 backdrop-blur-sm rounded-full text-[10px] text-brand-light font-bold flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse"></span>
                            <span>📢 {language === "bn" && msg.textBn ? msg.textBn : msg.text}</span>
                          </div>
                        </div>
                      );
                    }

                    // Simple, cute random level generation based on username length to simulate level badge in screenshot
                    const level = (msg.username.length % 5) + 1;

                    return (
                      <div key={msg.id} className="flex items-start gap-2.5 max-w-[90%] animate-fadeIn">
                        {/* Tiny sender avatar */}
                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-slate-700/50 bg-slate-900 flex items-center justify-center shadow-sm">
                          {msg.avatarUrl ? (
                            <img src={msg.avatarUrl} alt={msg.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[9px] font-bold text-brand-light uppercase">{msg.username.substring(0, 2)}</span>
                          )}
                        </div>

                        {/* Speech Bubble */}
                        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/60 rounded-2xl rounded-tl-none px-3.5 py-2 shadow-lg flex flex-wrap items-center gap-1.5 transition-all hover:bg-slate-900/95">
                          {/* Level Badge */}
                          <span className="text-[8px] px-1 py-0.5 rounded bg-gradient-to-r from-cyan-500 to-brand-accent text-brand-dark font-extrabold tracking-tight shrink-0">
                            {isOwn ? "ME" : `LV${level}`}
                          </span>

                          {/* Username */}
                          <span className="text-[10px] font-bold text-brand-highlight truncate max-w-[120px]">
                            {msg.username}
                          </span>

                          {/* Chat Message Text */}
                          <p className="text-xs text-brand-text font-medium leading-relaxed font-sans break-all select-all">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Emoji Toolbar Panel (inline floating directly above input) */}
                <div className="px-2 py-1.5 bg-slate-900/55 backdrop-blur-sm border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none w-full">
                  {["🎤", "👏", "👍", "🔥", "❤️", "😂", "😂❤️", "🇧🇩", "🤝"].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleQuickEmoji(emoji)}
                      className="p-1 hover:bg-slate-800 rounded text-sm transition-all focus:outline-none cursor-pointer active:scale-90 shrink-0"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Participants Modal Popup */}
          {showParticipantsModal && (
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
              <div className="bg-brand-panel border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-slate-700 flex justify-between items-center bg-brand-dark/50">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-brand-highlight" />
                    <h3 className="text-sm font-bold text-white">
                      {language === "en" ? "Active Participants" : "সক্রিয় অংশগ্রহণকারী"}
                    </h3>
                    <span className="bg-brand-accent/20 border border-brand-accent/30 text-brand-highlight text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {participants.length + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowParticipantsModal(false)}
                    className="text-slate-400 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-4 max-h-[300px] overflow-y-auto space-y-2.5 scrollbar-thin bg-brand-dark/20">
                  {/* Local User (Me) */}
                  <div className="flex justify-between items-center bg-brand-dark/60 p-3 rounded-xl border border-slate-700/60">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-brand-accent flex items-center justify-center text-xs font-extrabold text-brand-dark shadow-inner">
                        ME
                      </div>
                      <span className="text-xs font-bold text-brand-text truncate pr-2">
                        {username} <span className="text-[10px] text-brand-light font-normal">({t.youTag})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isHost && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" title={t.hostTag} />}
                      {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5 text-brand-highlight animate-pulse" />}
                      {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                    </div>
                  </div>

                  {/* Other Active Users */}
                  {participants.map((p) => (
                    <div key={p.socketId} className="flex justify-between items-center bg-brand-dark/60 p-3 rounded-xl border border-slate-700/60">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-brand-light uppercase shadow-inner">
                          {p.username.substring(0, 2)}
                        </div>
                        <span className="text-xs font-bold text-brand-text truncate pr-2">
                          {p.username}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" title={t.hostTag} />}
                        {p.isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5 text-brand-highlight" />}
                        {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Close Button Footer */}
                <div className="px-4 py-3 bg-brand-dark/30 border-t border-slate-700/60 flex justify-end">
                  <button
                    onClick={() => setShowParticipantsModal(false)}
                    className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-brand-light font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {language === "en" ? "Close" : "বন্ধ করুন"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Call Controllers Bar */}
          <footer className="bg-brand-panel border-t border-slate-800 px-3 md:px-6 py-3.5 flex items-center gap-3.5 z-10 shrink-0 w-full justify-between">
            {/* Left: Input Comment field (Pill styled like "কিছু লিখুন...") */}
            <form onSubmit={handleSendChat} className="flex-1 max-w-[280px] sm:max-w-md flex items-center relative group">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={language === "bn" ? "কিছু লিখুন..." : "Write a comment..."}
                maxLength={180}
                className="w-full bg-slate-900/90 border border-slate-700/60 focus:border-brand-highlight focus:outline-none text-xs px-4 py-2.5 rounded-full pr-10 font-medium text-brand-text placeholder:text-brand-light/40 shadow-inner transition-all"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className={`absolute right-1.5 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  chatInput.trim() 
                    ? "bg-brand-accent text-brand-dark hover:bg-brand-highlight scale-100" 
                    : "bg-transparent text-slate-500 scale-90 opacity-40 cursor-not-allowed"
                }`}
              >
                <Send className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </form>

            {/* Right/Middle: Actions (Mic, Hand, Record, Leave) styled as beautiful circle buttons */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              {/* Mic Toggler */}
              <button
                onClick={handleToggleMute}
                id="toggle-mic-btn"
                className={`w-9 h-9 md:w-11 md:h-11 rounded-full border transition-all cursor-pointer flex items-center justify-center active:scale-90 shadow-md ${
                  isMuted
                    ? "bg-rose-600/20 border-rose-600/40 text-rose-400 hover:bg-rose-600/35"
                    : "bg-slate-900/80 border-slate-700/50 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isMuted ? t.unmuteMic : t.muteMic}
              >
                {isMuted ? <MicOff className="w-4.5 h-4.5 md:w-5 h-5" /> : <Mic className="w-4.5 h-4.5 md:w-5 h-5" />}
              </button>

              {/* Hand Toggler */}
              <button
                onClick={handleToggleHand}
                id="toggle-hand-btn"
                className={`w-9 h-9 md:w-11 md:h-11 rounded-full border transition-all cursor-pointer flex items-center justify-center active:scale-90 shadow-md ${
                  isHandRaised
                    ? "bg-amber-500/25 border-amber-500/40 text-amber-400 hover:bg-amber-500/35"
                    : "bg-slate-900/80 border-slate-700/50 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isHandRaised ? t.lowerHand : t.raiseHand}
              >
                <Hand className={`w-4.5 h-4.5 md:w-5 h-5 ${isHandRaised ? "fill-amber-400" : ""}`} />
              </button>

              {/* Mixed Session Audio Recording Button */}
              <button
                onClick={handleToggleRecording}
                id="toggle-record-btn"
                className={`w-9 h-9 md:w-11 md:h-11 rounded-full border transition-all cursor-pointer flex items-center justify-center active:scale-90 shadow-md ${
                  isRecording
                    ? "bg-red-600/25 border-red-500 text-red-500 animate-pulse hover:bg-red-600/40"
                    : "bg-slate-900/80 border-slate-700/50 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isRecording ? t.stopRecording : t.startRecording}
              >
                <Disc className={`w-4.5 h-4.5 md:w-5 h-5 ${isRecording ? "animate-spin" : ""}`} />
              </button>

              {/* Leave Room Trigger */}
              <button
                onClick={handleLeaveRoom}
                id="leave-room-btn"
                className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.25)] hover:bg-rose-500 cursor-pointer active:scale-90 transition-all"
                title={t.leaveBtn}
              >
                <LogOut className="w-4 h-4 md:w-4.5 md:h-4.5 rotate-180" />
              </button>
            </div>
          </footer>

        </div>
      )}
    </div>
  );
}
