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
  Disc
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
  const [roomId, setRoomId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [myId, setMyId] = useState("");

  const t = translations[language];

  // Room participants list
  const [participants, setParticipants] = useState<Participant[]>([]);
  // Local microphone status
  const [isMuted, setIsMuted] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  
  // Chat messaging
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active speaking tracking
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

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
  const handleJoinRoom = async (userNickname: string, selectedRoomId: string, password?: string) => {
    try {
      setUsername(userNickname);
      setRoomId(selectedRoomId);
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

      // 3. Emit Join Event
      socket.emit("join-room", {
        roomId: selectedRoomId,
        username: userNickname,
        password,
        isMuted,
        isHandRaised,
      });

      // 4. Configure Socket listeners
      setupSocketListeners(socket, localStream);
      setInRoom(true);

    } catch (err: any) {
      console.error("[Room Join Failed] Mic permission is necessary:", err);
      setErrorMsg(t.errorMicRequired);
    }
  };

  // Configure Socket.IO event listeners
  const setupSocketListeners = (socket: Socket, localStream: MediaStream) => {
    
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
      
      // Seed initial participants list
      const initialParticipants = users.map((u: any) => ({
        socketId: u.socketId,
        username: u.username,
        isMuted: u.isMuted,
        isHandRaised: u.isHandRaised,
        isHost: u.isHost,
      }));
      setParticipants(initialParticipants);

      // Establish peer connections to ALL existing users in the room
      initialParticipants.forEach((peer: Participant) => {
        initiatePeerConnection(peer.socketId, localStream, socket);
      });
    });

    // Handle incoming participant joining
    socket.on("user-joined", (newUser: Participant) => {
      setParticipants((prev) => {
        // Prevent duplicate addition in case of lag/race conditions
        if (prev.some((p) => p.socketId === newUser.socketId)) return prev;
        return [...prev, newUser];
      });
      // Existing clients sit back and wait for the new client to offer SDP
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

    // Handle remote state updates (mute, raise hand)
    socket.on("user-state-changed", ({ socketId, isMuted: peerMuted, isHandRaised: peerHand }) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.socketId === socketId) {
            return {
              ...p,
              isMuted: peerMuted !== undefined ? peerMuted : p.isMuted,
              isHandRaised: peerHand !== undefined ? peerHand : p.isHandRaised,
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
    const url = `${window.location.origin}/?room=${roomId}`;
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
    setPeerStreams({});
    setParticipants([]);
    setChatMessages([]);
    setIsHandRaised(false);
    setIsMuted(false);
    setIsHost(false);
  };

  return (
    <div className="bg-brand-dark min-h-screen text-brand-text flex flex-col justify-between font-sans selection:bg-brand-accent/30 selection:text-brand-highlight">
      
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
        <div className="flex flex-col h-screen max-h-screen overflow-hidden">
          
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
                  <span className="w-1.5 h-1.5 bg-brand-highlight rounded-full animate-ping"></span>
                  <span className="text-[10px] text-brand-light font-semibold font-sans">
                    {t.roomCode}: <span className="font-mono font-bold text-brand-highlight">{roomId}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Room Action Triggers */}
            <div className="flex items-center gap-2.5">
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
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            
            {/* LEFT / CENTER: Active Room Stage (Grid of Users) */}
            <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col justify-between bg-brand-dark scrollbar-thin">
              
              {/* Users Stage grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                {/* Local user card (You) */}
                <ParticipantCard
                  participant={{
                    socketId: "me",
                    username,
                    isMuted,
                    isHandRaised,
                    isHost,
                  }}
                  isMe={true}
                  isSpeaking={activeSpeakers.has("me")}
                  isLocalHost={isHost}
                  currentLanguage={language}
                  onMutePeer={() => {}}
                  onKickPeer={() => {}}
                  onLowerHand={() => {}}
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
              </div>

              {/* If no other users are present, show help screen */}
              {participants.length === 0 && (
                <div className="my-auto py-12 flex flex-col items-center justify-center text-center max-w-sm mx-auto animate-fadeIn">
                  <div className="w-16 h-16 bg-brand-panel rounded-3xl border border-slate-700 flex items-center justify-center text-brand-highlight mb-5 shadow-2xl">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">
                    {language === "en" ? "Waiting for others to join..." : "অন্যদের যুক্ত হওয়ার জন্য অপেক্ষা করুন..."}
                  </h3>
                  <p className="text-xs text-brand-light leading-relaxed mb-6">
                    {language === "en"
                      ? "Share the invite link with your friends to start chatting right away!"
                      : "আপনার বন্ধুদের সাথে লিঙ্কটি শেয়ার করুন এবং এখনই চ্যাট শুরু করুন!"}
                  </p>
                  <button
                    onClick={handleCopyLink}
                    className="bg-brand-accent/15 border border-brand-accent/30 text-brand-highlight font-bold px-4 py-2 rounded-xl text-xs hover:bg-brand-accent/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{t.copyLink}</span>
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR: Chat & Participants Panel */}
            <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-700 bg-brand-panel flex flex-col h-64 md:h-full shrink-0 z-10">
              {/* Sidebar Tabs headers */}
              <div className="flex bg-brand-dark p-1 border-b border-slate-700 shrink-0">
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "chat"
                      ? "bg-brand-panel text-brand-highlight rounded-lg shadow-sm"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t.chatTab}</span>
                  {chatMessages.length > 0 && (
                    <span className="ml-1 bg-brand-accent text-brand-dark text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {chatMessages.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("participants")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "participants"
                      ? "bg-brand-panel text-brand-highlight rounded-lg shadow-sm"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.participantsTab}</span>
                  <span className="ml-1 bg-brand-dark text-brand-light text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-slate-700">
                    {participants.length + 1}
                  </span>
                </button>
              </div>

              {/* Chat Tab Panel Workspace */}
              {activeTab === "chat" ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* Messages Stream Container */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
                    {chatMessages.map((msg) => {
                      const isSystem = msg.type === "system" || msg.socketId === "system";
                      const isOwn = msg.socketId === myId;

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-1.5">
                            <span className="px-3 py-1 bg-brand-dark/90 border border-slate-700/60 rounded-full text-[10px] text-brand-light font-bold text-center leading-relaxed">
                              📢 {language === "bn" && msg.textBn ? msg.textBn : msg.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                          <span className="text-[10px] text-brand-light font-bold mb-0.5 px-1 truncate max-w-[150px]">
                            {msg.username} {isOwn && `(${t.youTag})`}
                          </span>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed shadow-md ${
                              isOwn
                                ? "bg-brand-accent text-brand-dark font-bold rounded-tr-none"
                                : "bg-brand-dark text-brand-text border border-slate-700 rounded-tl-none"
                            }`}
                          >
                            <p className="break-words font-sans">{msg.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Quick Emoji Toolbar Panel */}
                  <div className="px-3 py-1 bg-brand-dark/50 border-t border-slate-700/80 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
                    {["🎤", "👏", "👍", "🔥", "❤️", "😂", "😂❤️", "🇧🇩", "🤝"].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleQuickEmoji(emoji)}
                        className="p-1 hover:bg-brand-panel rounded text-sm transition-all focus:outline-none cursor-pointer active:scale-90"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Message Form Input */}
                  <form onSubmit={handleSendChat} className="p-3 bg-brand-dark border-t border-slate-700/80 flex gap-2 shrink-0">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={t.chatInputPlaceholder}
                      maxLength={180}
                      className="flex-1 bg-brand-panel border border-slate-700 focus:outline-none focus:border-brand-highlight text-xs px-3.5 py-2.5 rounded-xl font-medium text-brand-text placeholder:text-brand-light/40"
                    />
                    <button
                      type="submit"
                      className="p-2.5 bg-brand-accent text-brand-dark rounded-xl hover:bg-brand-highlight active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center shrink-0 shadow"
                    >
                      <Send className="w-4 h-4 fill-brand-dark stroke-[2.5]" />
                    </button>
                  </form>

                </div>
              ) : (
                /* Participants Tab Panel Workspace */
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
                  <div className="space-y-2">
                    {/* Me User list */}
                    <div className="flex justify-between items-center bg-brand-dark p-3 rounded-xl border border-slate-700">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-7 h-7 rounded-full bg-brand-accent flex items-center justify-center text-[10px] font-extrabold text-brand-dark">
                          ME
                        </div>
                        <span className="text-xs font-bold text-brand-text truncate pr-2">
                          {username} <span className="text-[10px] text-brand-light font-normal">({t.youTag})</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isHost && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                        {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5 text-brand-highlight" />}
                        {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                      </div>
                    </div>

                    {/* Peer User list */}
                    {participants.map((p) => (
                      <div key={p.socketId} className="flex justify-between items-center bg-brand-dark p-3 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="w-7 h-7 rounded-full bg-brand-panel border border-slate-700 flex items-center justify-center text-[10px] font-extrabold text-brand-light uppercase">
                            {p.username.substring(0, 2)}
                          </div>
                          <span className="text-xs font-bold text-brand-text truncate pr-2">
                            {p.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                          {p.isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5 text-brand-highlight" />}
                          {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>

          {/* Bottom Call Controllers Bar */}
          <footer className="bg-brand-panel border-t border-slate-700 px-4 py-4 md:py-5 flex items-center justify-between z-10 shrink-0">
            {/* Left speaker indicator status label */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-brand-highlight animate-pulse"></div>
              <span className="text-xs text-brand-light font-bold font-sans">
                {t.connected}
              </span>
            </div>

            {/* Middle major control call buttons */}
            <div className="flex items-center gap-3.5 mx-auto sm:mx-0">
              {/* Mic Toggler */}
              <button
                onClick={handleToggleMute}
                id="toggle-mic-btn"
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-center active:scale-95 shadow-md ${
                  isMuted
                    ? "bg-rose-600/15 border-rose-600/40 text-rose-400 hover:bg-rose-600/25"
                    : "bg-brand-dark border-slate-700 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isMuted ? t.unmuteMic : t.muteMic}
              >
                {isMuted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
              </button>

              {/* Hand Toggler */}
              <button
                onClick={handleToggleHand}
                id="toggle-hand-btn"
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-center active:scale-95 shadow-md ${
                  isHandRaised
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
                    : "bg-brand-dark border-slate-700 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isHandRaised ? t.lowerHand : t.raiseHand}
              >
                <Hand className={`w-5.5 h-5.5 ${isHandRaised ? "fill-amber-400" : ""}`} />
              </button>

              {/* Mixed Session Audio Recording Button */}
              <button
                onClick={handleToggleRecording}
                id="toggle-record-btn"
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-center active:scale-95 shadow-md ${
                  isRecording
                    ? "bg-red-600/20 border-red-500 text-red-500 animate-pulse hover:bg-red-600/35"
                    : "bg-brand-dark border-slate-700 text-brand-light hover:bg-brand-panel hover:border-brand-accent"
                }`}
                title={isRecording ? t.stopRecording : t.startRecording}
              >
                <Disc className={`w-5.5 h-5.5 ${isRecording ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Right Hangup trigger button */}
            <button
              onClick={handleLeaveRoom}
              id="leave-room-btn"
              className="bg-red-600 text-white font-extrabold px-4 md:px-5 py-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(220,38,38,0.25)] hover:bg-red-500 cursor-pointer active:scale-95 transition-all text-xs"
              title={t.leaveBtn}
            >
              <LogOut className="w-4 h-4 rotate-180" />
              <span className="hidden sm:inline">{t.leaveBtn}</span>
            </button>
          </footer>

        </div>
      )}
    </div>
  );
}
