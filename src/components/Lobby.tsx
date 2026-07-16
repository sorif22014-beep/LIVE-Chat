import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, MicOff, Globe, Sparkles, LogIn, PlusCircle, Volume2, Shield, Lock, Camera,
  MessageSquare, Send, Users, User, UserCheck, Bell, Flame, HelpCircle
} from "lucide-react";
import { Language, translations } from "../types";

interface LobbyProps {
  initialRoomId?: string;
  onJoin: (username: string, roomId: string, password?: string, avatarUrl?: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  initialRoomId = "",
  onJoin,
  language,
  onLanguageChange,
}) => {
  // Profile settings
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // Form states
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isCreateMode, setIsCreateMode] = useState(!initialRoomId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Real-time Lobby States
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [lobbyMessages, setLobbyMessages] = useState<any[]>([]);
  const [lobbyChatInput, setLobbyChatInput] = useState("");
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [lobbyUsersCount, setLobbyUsersCount] = useState(1);

  // Microphone test states
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lobbySocketRef = useRef<Socket | null>(null);
  const lobbyChatEndRef = useRef<HTMLDivElement>(null);

  const t = translations[language];

  // Load Saved Profile on Mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("surokkha_username");
    const savedAvatar = localStorage.getItem("surokkha_avatar");
    if (savedUsername) setUsername(savedUsername);
    if (savedAvatar) setAvatarUrl(savedAvatar);
  }, []);

  // Connect to Lobby Socket
  useEffect(() => {
    const socketUrl = window.location.origin;
    const socket = io(socketUrl);
    lobbySocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-lobby");
    });

    // Receive active rooms list
    socket.on("lobby-rooms-update", (rooms: any[]) => {
      setActiveRooms(rooms);
    });

    // Receive lobby chat message
    socket.on("lobby-chat-message", (msg: any) => {
      setLobbyMessages((prev) => {
        const updated = [...prev, msg];
        return updated.slice(-60); // Keep last 60 messages
      });
    });

    // Receive live announcements (someone goes live)
    socket.on("lobby-announcement", (announcement: any) => {
      setAnnouncements((prev) => [...prev, announcement]);
      
      // Auto dismiss after 5 seconds
      setTimeout(() => {
        setAnnouncements((prev) => prev.filter((a) => a.id !== announcement.id));
      }, 5000);
    });

    return () => {
      socket.emit("leave-lobby");
      socket.disconnect();
    };
  }, []);

  // Scroll lobby chat
  useEffect(() => {
    if (lobbyChatEndRef.current) {
      lobbyChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [lobbyMessages]);

  // Handle setting up the local mic preview
  useEffect(() => {
    async function setupMicPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setHasMicPermission(true);
        setError(null);

        // Web Audio Analyzer for live volume preview
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const audioContext = new AudioCtx();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const scaledLevel = Math.min(100, Math.round((average / 128) * 100));
          setMicLevel(scaledLevel);
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };

        checkVolume();
      } catch (err) {
        console.warn("Microphone access denied or not available:", err);
        setHasMicPermission(false);
        setError(t.errorMicRequired);
      }
    }

    setupMicPreview();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [t.errorMicRequired]);

  // Save profile manually
  const handleSaveProfile = () => {
    if (!username.trim()) {
      setError(language === "en" ? "Nickname cannot be empty" : "ডাকনাম খালি থাকতে পারে না");
      return;
    }
    localStorage.setItem("surokkha_username", username.trim());
    localStorage.setItem("surokkha_avatar", avatarUrl);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // Handle generating a random room ID
  const handleGenerateRoomId = () => {
    const prefixes = ["chill", "adda", "meeting", "shur", "surokkha", "bangla", "voice"];
    const suffix = Math.random().toString(36).substring(2, 7);
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    setRoomId(`${randomPrefix}-${suffix}`);
    setIsCreateMode(true);
    setError(null);
  };

  // Submit join/create room
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError(language === "en" ? "Please enter a nickname" : "দয়া করে একটি ডাকনাম লিখুন");
      return;
    }
    if (!roomId.trim()) {
      setError(language === "en" ? "Please provide a Room Code" : "দয়া করে আড্ডা রুমের কোড দিন");
      return;
    }

    // Save profile to localStorage automatically on join
    localStorage.setItem("surokkha_username", username.trim());
    localStorage.setItem("surokkha_avatar", avatarUrl);

    onJoin(
      username.trim(), 
      roomId.trim().toLowerCase(), 
      password.trim() || undefined, 
      avatarUrl || undefined
    );
  };

  // Direct Join from Active Rooms List
  const handleDirectJoin = (targetRoomId: string, hasPwd: boolean) => {
    if (!username.trim()) {
      setError(language === "en" ? "Please enter a nickname first" : "দয়া করে প্রথমে একটি ডাকনাম লিখুন");
      // Scroll to nickname input
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Save profile automatically
    localStorage.setItem("surokkha_username", username.trim());
    localStorage.setItem("surokkha_avatar", avatarUrl);

    if (hasPwd) {
      // If room has password, populate form and let user type password
      setRoomId(targetRoomId);
      setIsCreateMode(false);
      setError(language === "en" ? "This room requires a password. Please enter it below." : "এই রুমে যোগ দিতে পাসওয়ার্ড প্রয়োজন। নিচে পাসওয়ার্ড লিখুন।");
    } else {
      // If no password, join immediately!
      onJoin(
        username.trim(),
        targetRoomId.toLowerCase(),
        undefined,
        avatarUrl || undefined
      );
    }
  };

  // Send Lobby Chat Message
  const handleSendLobbyMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lobbyChatInput.trim()) return;
    if (!username.trim()) {
      setError(language === "en" ? "Enter a nickname to chat" : "চ্যাট করতে ডাকনাম লিখুন");
      return;
    }

    if (lobbySocketRef.current) {
      lobbySocketRef.current.emit("send-lobby-chat", {
        username: username.trim(),
        text: lobbyChatInput.trim(),
        avatarUrl,
      });
      setLobbyChatInput("");
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark text-brand-text flex flex-col justify-between py-6 px-4 relative overflow-hidden font-sans">
      {/* Decorative Blur Backdrops */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand-highlight/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Real-time Toast Announcements ("কেউ লাইভে গেলে হোমে ভাসা দিবে") */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {announcements.map((ann) => (
          <div 
            key={ann.id}
            onClick={() => handleDirectJoin(ann.roomId, false)}
            className="pointer-events-auto bg-slate-950/95 border-2 border-brand-highlight rounded-2xl p-4 shadow-[0_0_25px_rgba(102,252,241,0.35)] flex items-center gap-3 animate-slideUp cursor-pointer hover:border-white transition-all transform hover:scale-[1.02]"
          >
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-brand-highlight overflow-hidden shrink-0 flex items-center justify-center">
              {ann.avatarUrl ? (
                <img src={ann.avatarUrl} alt={ann.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-5 h-5 text-brand-highlight" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-[10px] text-amber-400 font-extrabold uppercase tracking-wider">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                {language === "en" ? "Lobby Live Alert" : "লাইভ এলার্ট 🎤"}
              </span>
              <p className="text-xs text-white font-bold leading-normal truncate mt-0.5">
                <span className="text-brand-highlight font-sans">{ann.username}</span> {language === "en" ? "started an Adda room!" : "আড্ডা শুরু করেছেন!"}
              </p>
              <p className="text-[10px] text-brand-light font-mono truncate mt-0.5">
                {language === "en" ? "Room" : "রুম"}: <span className="font-bold underline">{ann.roomId}</span>
              </p>
            </div>
            <button className="bg-brand-highlight hover:bg-white text-brand-dark font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg shrink-0 shadow transition-colors uppercase">
              {language === "en" ? "Join" : "যোগ দিন"}
            </button>
          </div>
        ))}
      </div>

      {/* Global Header */}
      <header className="max-w-6xl w-full mx-auto flex justify-between items-center z-10 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(69,162,158,0.4)]">
            <Mic className="w-6 h-6 text-brand-dark stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight text-white flex items-center gap-1">
              {t.title}
            </h1>
            <span className="text-[10px] text-brand-highlight font-mono tracking-widest uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {language === "en" ? "Real-time Lobby Dashboard" : "রিয়েল-টাইম লবি ড্যাশবোর্ড"}
            </span>
          </div>
        </div>

        {/* Language Selector */}
        <button
          onClick={() => onLanguageChange(language === "en" ? "bn" : "en")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-brand-panel/60 hover:bg-brand-panel hover:border-brand-accent transition-all text-xs font-bold cursor-pointer text-brand-light"
        >
          <Globe className="w-4 h-4 text-brand-highlight" />
          <span>{language === "en" ? "বাংলা" : "English"}</span>
        </button>
      </header>

      {/* Main Grid Layout */}
      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 my-auto items-stretch">
        
        {/* Left Column: Profile Card + Join Form (5 Columns on Large Screens) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* PROFILE EDIT SYSTEM PANEL */}
          <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide">
                <User className="w-4 h-4 text-brand-highlight" />
                {language === "en" ? "Profile Settings" : "প্রোফাইল এডিট সিস্টেম"}
              </h3>
              <span className="px-2 py-0.5 bg-brand-highlight/10 border border-brand-highlight/20 text-[9px] text-brand-highlight rounded font-bold uppercase font-mono">
                {language === "en" ? "Identity" : "পরিচয়"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Avatar upload */}
              <div className="relative group shrink-0">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full border-2 border-dashed border-slate-500 hover:border-brand-accent bg-brand-dark/50 flex items-center justify-center cursor-pointer overflow-hidden transition-all shadow-inner"
                  title={language === "en" ? "Upload avatar image" : "প্রোফাইল ছবি দিন"}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-400 group-hover:text-brand-accent transition-colors" />
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        if (typeof reader.result === "string") {
                          setAvatarUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  accept="image/*"
                  className="hidden"
                />
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="absolute -bottom-1 -right-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-1 border border-brand-dark shadow transition-colors"
                    title={language === "en" ? "Remove photo" : "ছবি মুছুন"}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Name & Save */}
              <div className="flex-1 space-y-2">
                <div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t.usernamePlaceholder}
                    maxLength={20}
                    className="w-full bg-brand-dark text-brand-text rounded-xl px-3.5 py-2 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-semibold"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="bg-brand-panel hover:bg-brand-dark border border-slate-600 hover:border-brand-highlight text-brand-light hover:text-white font-bold text-[10px] px-3.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase shrink-0"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-brand-highlight" />
                    <span>{language === "en" ? "Save Settings" : "সংরক্ষণ করুন"}</span>
                  </button>
                  {profileSaved && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center animate-fadeIn">
                      ✓ {language === "en" ? "Saved!" : "সংরক্ষিত!"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ROOM JOIN / CREATE FORM */}
          <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              {/* Toggle Creator / Joiner modes */}
              <div className="flex bg-brand-dark p-1 rounded-lg border border-slate-700/60 mb-4">
                <button
                  onClick={() => {
                    setIsCreateMode(true);
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                    isCreateMode
                      ? "bg-brand-accent text-brand-dark shadow-md"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Create Room" : "রুম তৈরি করুন"}</span>
                </button>
                <button
                  onClick={() => {
                    setIsCreateMode(false);
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                    !isCreateMode
                      ? "bg-brand-accent text-brand-dark shadow-md"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Join Room" : "রুমে যোগ দিন"}</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Room ID input */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-bold text-brand-light uppercase tracking-wider">
                      {language === "en" ? "Room Code" : "আড্ডা রুমের কোড"}
                    </label>
                    {isCreateMode && (
                      <button
                        type="button"
                        onClick={handleGenerateRoomId}
                        className="text-[10px] text-brand-highlight hover:text-brand-highlight/85 font-bold tracking-tight underline focus:outline-none cursor-pointer"
                      >
                        {language === "en" ? "Auto Code" : "অটো কোড দিন"}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder={t.roomNamePlaceholder}
                    maxLength={30}
                    required
                    className="w-full bg-brand-dark text-brand-text rounded-xl px-3.5 py-2.5 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-mono font-medium"
                  />
                </div>

                {/* Room Password Input */}
                <div>
                  <label className="block text-[10px] font-bold text-brand-light uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-brand-accent" />
                    <span>{t.roomPassword}</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.roomPasswordPlaceholder}
                    maxLength={20}
                    className="w-full bg-brand-dark text-brand-text rounded-xl px-3.5 py-2.5 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-mono font-medium"
                  />
                </div>

                {/* Real-time Mic Preview Meter */}
                <div className="bg-brand-dark/70 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-brand-highlight" />
                      <span className="text-[10px] font-bold text-brand-light uppercase tracking-wider">
                        {language === "en" ? "Microphone Test" : "মাইক্রোফোন টেস্ট"}
                      </span>
                    </div>
                    {hasMicPermission === true ? (
                      <span className="px-1.5 py-0.5 bg-brand-highlight/15 border border-brand-highlight/20 text-[8px] text-brand-highlight font-semibold rounded-full">
                        {language === "en" ? "Ready" : "প্রস্তুত"}
                      </span>
                    ) : hasMicPermission === false ? (
                      <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-[8px] text-rose-400 font-semibold rounded-full">
                        {language === "en" ? "Blocked" : "অনুমতি নেই"}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-[8px] text-yellow-400 font-semibold rounded-full animate-pulse">
                        {language === "en" ? "Awaiting" : "অনুমতি দিন"}
                      </span>
                    )}
                  </div>

                  {/* Glowing Volume Bar */}
                  <div className="w-full h-2 bg-brand-panel rounded-full overflow-hidden relative border border-slate-850">
                    <div
                      className="h-full bg-gradient-to-r from-brand-accent to-brand-highlight transition-all duration-75 shadow-[0_0_10px_rgba(102,252,241,0.5)]"
                      style={{ width: `${hasMicPermission ? micLevel : 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Error notifications */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold leading-relaxed">
                    {error}
                  </div>
                )}

                {/* Join Room CTA */}
                <button
                  type="submit"
                  id="submit-lobby-btn"
                  className="w-full bg-gradient-to-r from-brand-accent to-brand-highlight text-brand-dark font-extrabold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(102,252,241,0.25)] hover:shadow-[0_0_20px_rgba(102,252,241,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer border-t border-white/20 active:scale-[0.98] text-sm uppercase tracking-wider"
                >
                  <Mic className="w-4 h-4 stroke-[2.5]" />
                  <span>{isCreateMode ? t.createBtn : t.joinBtn}</span>
                </button>
              </form>
            </div>
          </section>
        </div>

        {/* Right Column: Live Rooms Feed + Lobby Chat (7 Columns on Large Screens) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* LIVE NOW / ACTIVE ROOMS FEED */}
          <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
                {language === "en" ? "Live Rooms Now" : "চলতি লাইভ আড্ডা রুমসমূহ"}
              </h3>
              <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase font-mono">
                {activeRooms.length} {language === "en" ? "Live" : "টি লাইভ"}
              </span>
            </div>

            {/* List of active rooms */}
            <div className="space-y-3 max-h-[190px] overflow-y-auto scrollbar-thin pr-1">
              {activeRooms.length === 0 ? (
                <div className="text-center py-8 bg-brand-dark/40 border border-dashed border-slate-700/60 rounded-xl flex flex-col items-center justify-center">
                  <Flame className="w-8 h-8 text-slate-500 mb-2 animate-pulse" />
                  <p className="text-xs font-bold text-brand-light">
                    {language === "en" ? "No live rooms active right now" : "বর্তমানে কোনো লাইভ আড্ডা নেই"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {language === "en" ? "Be the first to went live above!" : "উপরের ফর্ম থেকে প্রথম আড্ডা রুমটি চালু করুন!"}
                  </p>
                </div>
              ) : (
                activeRooms.map((room) => (
                  <div 
                    key={room.roomId} 
                    className="flex items-center justify-between bg-brand-dark/65 hover:bg-brand-dark/95 p-3.5 rounded-xl border border-slate-700/60 hover:border-brand-highlight/50 transition-all shadow-md group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-brand-highlight" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-white font-mono tracking-wide truncate group-hover:text-brand-highlight transition-colors">
                            {room.roomId}
                          </span>
                          {room.hasPassword && (
                            <Lock className="w-3 h-3 text-amber-400" title={language === "en" ? "Password protected" : "পাসওয়ার্ড দ্বারা সুরক্ষিত"} />
                          )}
                        </div>
                        {/* Member avatar cluster */}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] font-bold text-brand-light mr-1.5">
                            {room.usersCount} {language === "en" ? "active" : "জন সক্রিয়"} •
                          </span>
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {room.users.slice(0, 4).map((user: any, idx: number) => (
                              <div 
                                key={idx} 
                                className="w-4 h-4 rounded-full border border-brand-dark overflow-hidden bg-slate-800" 
                                title={user.username}
                              >
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[6px] font-extrabold text-white bg-slate-700">
                                    {user.username.substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ))}
                            {room.usersCount > 4 && (
                              <div className="w-4 h-4 rounded-full bg-slate-900 border border-brand-dark flex items-center justify-center text-[7px] text-brand-light font-bold">
                                +{room.usersCount - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDirectJoin(room.roomId, room.hasPassword)}
                      className="bg-brand-highlight hover:bg-white text-brand-dark font-extrabold text-[10px] px-3.5 py-1.5 rounded-lg shrink-0 shadow-md transition-colors uppercase tracking-wider"
                    >
                      {language === "en" ? "Join" : "যোগ দিন"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* LOBBY PUBLIC CHAT PANEL */}
          <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl flex-1 flex flex-col justify-between min-h-[250px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-3.5">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide">
                  <MessageSquare className="w-4 h-4 text-brand-highlight" />
                  {language === "en" ? "Lobby Public Chat" : "লবি আড্ডা লাইভ চ্যাট"}
                </h3>
                <span className="bg-brand-accent/15 border border-brand-accent/20 text-brand-highlight text-[9px] px-2 py-0.5 rounded font-bold uppercase font-mono">
                  {language === "en" ? "Open Board" : "উন্মুক্ত বোর্ড"}
                </span>
              </div>

              {/* Chat Log container */}
              <div className="space-y-2.5 h-[170px] overflow-y-auto scrollbar-thin pr-1 mb-3 bg-brand-dark/45 rounded-xl p-3 border border-slate-800/80">
                {lobbyMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <MessageSquare className="w-6 h-6 text-slate-600 mb-1 animate-pulse" />
                    <p className="text-[10px] text-slate-500 font-bold leading-normal">
                      {language === "en" ? "Lobby chat is clear. Start chatting!" : "লবি চ্যাট বোর্ড ফাকা আছে। হাই বলুন!"}
                    </p>
                  </div>
                ) : (
                  lobbyMessages.map((msg, idx) => (
                    <div key={idx} className="flex gap-2 text-xs">
                      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
                        {msg.avatarUrl ? (
                          <img src={msg.avatarUrl} alt={msg.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                      <div className="bg-brand-panel border border-slate-750 p-2 rounded-xl rounded-tl-none flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-extrabold text-brand-highlight text-[10px] font-sans">
                            {msg.username}
                          </span>
                          <span className="text-[8px] text-slate-500 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-text leading-normal break-all font-sans font-medium">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={lobbyChatEndRef} />
              </div>
            </div>

            {/* Send form */}
            <form onSubmit={handleSendLobbyMessage} className="flex gap-2">
              <input
                type="text"
                value={lobbyChatInput}
                onChange={(e) => setLobbyChatInput(e.target.value)}
                placeholder={language === "en" ? "Send message to lobby..." : "লবিতে আড্ডা চ্যাট করুন..."}
                maxLength={100}
                className="flex-1 bg-brand-dark border border-slate-700 focus:border-brand-highlight focus:outline-none text-xs px-3.5 py-2 rounded-xl text-brand-text placeholder:text-brand-light/30"
              />
              <button
                type="submit"
                disabled={!lobbyChatInput.trim()}
                className="bg-brand-accent hover:bg-brand-highlight disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-dark p-2 rounded-xl transition-colors shrink-0"
              >
                <Send className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>
          </section>
        </div>
      </main>

      {/* Trust & Policy Details Footer */}
      <footer className="max-w-6xl w-full mx-auto mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 text-xs text-brand-light font-medium">
        <p className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-brand-accent" />
          <span>{t.roomCapacity}</span>
        </p>
        <p className="text-center sm:text-right">
          {t.bengaliHelpText}
        </p>
      </footer>
    </div>
  );
};
