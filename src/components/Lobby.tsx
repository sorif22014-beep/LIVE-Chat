import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, MicOff, Globe, Sparkles, LogIn, PlusCircle, Volume2, Shield, Lock, Camera,
  MessageSquare, Send, Users, User, UserCheck, Bell, Flame, HelpCircle,
  Music, Search, Image as ImageIcon, Trash2, Disc
} from "lucide-react";
import { Language, translations } from "../types";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  db,
  doc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  limit
} from "../lib/firebase";

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

  // Firebase auth & creations state
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [creations, setCreations] = useState<any[]>([]);

  // AI Inputs & Outputs
  const [aiSubTab, setAiSubTab] = useState<"search" | "image" | "music">("search");
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchResult, setAiSearchResult] = useState("");
  const [aiImagePrompt, setAiImagePrompt] = useState("");
  const [aiImageInput, setAiImageInput] = useState<string>(""); // base64 source for editing
  const [aiImageOutput, setAiImageOutput] = useState("");
  const [aiMusicPrompt, setAiMusicPrompt] = useState("");
  const [aiMusicPro, setAiMusicPro] = useState(false);
  const [aiMusicOutput, setAiMusicOutput] = useState("");
  const [aiMusicLyrics, setAiMusicLyrics] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Active Navigation Tab: 'home' | 'create' | 'live' | 'profile' | 'ai'
  const [activeTab, setActiveTab] = useState<"home" | "create" | "live" | "profile" | "ai">("home");

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

  // Helper to fetch active rooms via API
  const fetchActiveRooms = async () => {
    try {
      const res = await fetch("/api/rooms");
      if (res.ok) {
        const rooms = await res.json();
        setActiveRooms(rooms);
      }
    } catch (err) {
      console.warn("Error polling active rooms:", err);
    }
  };

  // Load Saved Profile & Initial Rooms on Mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("surokkha_username");
    const savedAvatar = localStorage.getItem("surokkha_avatar");
    if (savedUsername) setUsername(savedUsername);
    if (savedAvatar) setAvatarUrl(savedAvatar);

    // Initial load of active rooms
    fetchActiveRooms();

    // Setup fallback short interval polling so user never misses a live room
    const pollInterval = setInterval(fetchActiveRooms, 3500);

    return () => {
      clearInterval(pollInterval);
    };
  }, []);

  // Firebase auth & data sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        setUsername(user.displayName || "আড্ডাবাজ");
        setAvatarUrl(user.photoURL || "");
        localStorage.setItem("surokkha_username", user.displayName || "আড্ডাবাজ");
        localStorage.setItem("surokkha_avatar", user.photoURL || "");

        // Sync user profile in Firestore
        try {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            username: user.displayName || "আড্ডাবাজ",
            avatarUrl: user.photoURL || "",
            email: user.email,
            lastLoginAt: Date.now()
          }, { merge: true });

          loadCreations(user.uid);
        } catch (e) {
          console.error("Firestore sync error:", e);
        }
      } else {
        setFirebaseUser(null);
        setCreations([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadCreations = async (uid: string) => {
    try {
      const q = query(
        collection(db, "ai_creations"),
        where("userId", "==", uid),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCreations(list);
    } catch (e) {
      console.error("Error loading creations:", e);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setUsername(result.user.displayName || "আড্ডাবাজ");
        setAvatarUrl(result.user.photoURL || "");
        setProfileSaved(true);
      }
    } catch (err: any) {
      console.error("Google login failed:", err);
      setError(language === "en" ? "Google Sign-In failed" : "গুগল সাইন-ইন ব্যর্থ হয়েছে");
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOut(auth);
      setUsername("");
      setAvatarUrl("");
      setProfileSaved(false);
      localStorage.removeItem("surokkha_username");
      localStorage.removeItem("surokkha_avatar");
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };

  // Connect to Lobby Socket
  useEffect(() => {
    const socketUrl = window.location.origin;
    const socket = io(socketUrl);
    lobbySocketRef.current = socket;

    const joinLobby = () => {
      socket.emit("join-lobby");
      fetchActiveRooms(); // refresh list when socket joins
    };

    if (socket.connected) {
      joinLobby();
    }

    socket.on("connect", () => {
      joinLobby();
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

  // AI Handler methods
  const runAiSearch = async () => {
    if (!aiSearchQuery.trim()) return;
    setAiLoading(true);
    setError(null);
    setAiSearchResult("");
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiSearchQuery }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiSearchResult(data.text);
        
        // Save to Firestore if user is logged in
        if (firebaseUser) {
          try {
            await addDoc(collection(db, "ai_creations"), {
              userId: firebaseUser.uid,
              type: "search",
              prompt: aiSearchQuery,
              resultText: data.text,
              timestamp: Date.now()
            });
            loadCreations(firebaseUser.uid);
          } catch (e) {
            console.error("Failed saving search creation to Firestore", e);
          }
        }
      } else {
        throw new Error(data.error || "Search grounding failed");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during Search Grounding");
    } finally {
      setAiLoading(false);
    }
  };

  const runAiImage = async () => {
    if (!aiImagePrompt.trim()) return;
    setAiLoading(true);
    setError(null);
    setAiImageOutput("");
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiImagePrompt, image: aiImageInput || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiImageOutput(data.imageUrl);
        
        // Save to Firestore if user is logged in
        if (firebaseUser) {
          try {
            await addDoc(collection(db, "ai_creations"), {
              userId: firebaseUser.uid,
              type: "image",
              prompt: aiImagePrompt,
              resultUrl: data.imageUrl,
              timestamp: Date.now()
            });
            loadCreations(firebaseUser.uid);
          } catch (e) {
            console.error("Failed saving image creation to Firestore", e);
          }
        }
      } else {
        throw new Error(data.error || "Image generation failed");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during Image Generation");
    } finally {
      setAiLoading(false);
    }
  };

  const runAiMusic = async () => {
    if (!aiMusicPrompt.trim()) return;
    setAiLoading(true);
    setError(null);
    setAiMusicOutput("");
    setAiMusicLyrics("");
    try {
      const res = await fetch("/api/ai/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiMusicPrompt, isPro: aiMusicPro }),
      });
      const data = await res.json();
      if (res.ok) {
        const audioUrl = `data:${data.mimeType};base64,${data.audioBase64}`;
        setAiMusicOutput(audioUrl);
        setAiMusicLyrics(data.lyrics || "");

        // Save to Firestore if user is logged in
        if (firebaseUser) {
          try {
            await addDoc(collection(db, "ai_creations"), {
              userId: firebaseUser.uid,
              type: "music",
              prompt: aiMusicPrompt,
              resultUrl: audioUrl,
              lyrics: data.lyrics || "",
              isPro: aiMusicPro,
              timestamp: Date.now()
            });
            loadCreations(firebaseUser.uid);
          } catch (e) {
            console.error("Failed saving music creation to Firestore", e);
          }
        }
      } else {
        throw new Error(data.error || "Music generation failed");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during Music Generation");
    } finally {
      setAiLoading(false);
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

        {/* Top Header Actions (Google Sign In + Language selector) */}
        <div className="flex items-center gap-3">
          {firebaseUser ? (
            <div className="flex items-center gap-2 bg-brand-panel/80 border border-slate-700/60 rounded-xl p-1.5 pr-3 shadow-md">
              <img 
                src={avatarUrl || firebaseUser.photoURL || ""} 
                alt="Google Avatar" 
                className="w-6 h-6 rounded-full border border-brand-accent object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
              <span className="text-[11px] font-black text-white max-w-[85px] truncate">
                {username || firebaseUser.displayName}
              </span>
              <button
                type="button"
                onClick={handleGoogleSignOut}
                className="text-[9.5px] text-rose-400 hover:text-rose-300 font-extrabold ml-1.5 transition-colors cursor-pointer uppercase tracking-tight"
                title={language === "en" ? "Sign Out" : "লগ আউট"}
              >
                {language === "en" ? "Exit" : "বিদায়"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-highlight transition-all text-xs font-black cursor-pointer shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{language === "en" ? "Login" : "লগইন"}</span>
            </button>
          )}

          {/* Language Selector */}
          <button
            type="button"
            onClick={() => onLanguageChange(language === "en" ? "bn" : "en")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 bg-brand-panel/60 hover:bg-brand-panel hover:border-brand-accent transition-all text-xs font-extrabold cursor-pointer text-brand-light"
          >
            <Globe className="w-4 h-4 text-brand-highlight" />
            <span>{language === "en" ? "বাংলা" : "English"}</span>
          </button>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <div className="max-w-6xl w-full mx-auto mb-6 z-10">
        <div className="flex p-1 bg-brand-panel/90 border border-slate-700/60 rounded-2xl shadow-lg gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none whitespace-nowrap min-w-[80px] ${
              activeTab === "home"
                ? "bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(102,252,241,0.25)] scale-[1.01]"
                : "text-brand-light hover:text-brand-highlight hover:bg-brand-dark/40"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>{language === "en" ? "Home Chat" : "হুম পেজ"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none whitespace-nowrap min-w-[80px] ${
              activeTab === "create"
                ? "bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(102,252,241,0.25)] scale-[1.01]"
                : "text-brand-light hover:text-brand-highlight hover:bg-brand-dark/40"
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>{language === "en" ? "Create Room" : "রুম তৈরি"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`relative flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none whitespace-nowrap min-w-[80px] ${
              activeTab === "live"
                ? "bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(102,252,241,0.25)] scale-[1.01]"
                : "text-brand-light hover:text-brand-highlight hover:bg-brand-dark/40"
            }`}
          >
            <div className="relative">
              <Users className="w-4 h-4 shrink-0" />
              {activeRooms.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
            </div>
            <span>{language === "en" ? "Live Addas" : "লাইভ মেসে"}</span>
            {activeRooms.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${activeTab === "live" ? "bg-brand-dark text-brand-highlight" : "bg-rose-500 text-white ml-0.5"}`}>
                {activeRooms.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none whitespace-nowrap min-w-[80px] ${
              activeTab === "ai"
                ? "bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(102,252,241,0.25)] scale-[1.01]"
                : "text-brand-light hover:text-brand-highlight hover:bg-brand-dark/40"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{language === "en" ? "AI Studio" : "এআই স্টুডিও"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none whitespace-nowrap min-w-[80px] ${
              activeTab === "profile"
                ? "bg-brand-accent text-brand-dark shadow-[0_0_15px_rgba(102,252,241,0.25)] scale-[1.01]"
                : "text-brand-light hover:text-brand-highlight hover:bg-brand-dark/40"
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span>{language === "en" ? "Profile" : "প্রোফাইল"}</span>
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      <main className="max-w-6xl w-full mx-auto z-10 my-auto items-stretch">
        {/* Render Tab Content */}
        {activeTab === "home" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Box: Quick Live Status & Invitation */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2 uppercase tracking-wide pb-3 border-b border-slate-700/40 mb-4">
                    <Sparkles className="w-4.5 h-4.5 text-brand-highlight" />
                    {language === "en" ? "Welcome to Surokkha" : "সুরক্ষা আড্ডায় স্বাগতম"}
                  </h3>
                  <p className="text-xs text-brand-light leading-relaxed mb-4">
                    {language === "en"
                      ? "Create your custom room code or join existing ones. Start speaking instantly with high-quality WebRTC audio!"
                      : "আপনার কাস্টম রুম কোড তৈরি করুন অথবা বিদ্যমান রুমে সরাসরি যুক্ত হোন। প্রিমিয়াম WebRTC অডিওর মাধ্যমে আজই আড্ডা শুরু করুন!"}
                  </p>
                  
                  {/* Nickname verification alert */}
                  {!username.trim() && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 font-bold leading-normal mb-4">
                      ⚠ {language === "en" 
                        ? "Please complete your Profile tab setup to set your nickname before joining!"
                        : "আড্ডায় যোগ দেওয়ার পূর্বে দয়া করে প্রোফাইল ট্যাব থেকে আপনার ডাকনাম সেট করুন!"}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className="bg-brand-accent hover:bg-brand-highlight text-brand-dark font-black text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow"
                    >
                      <PlusCircle className="w-4 h-4 stroke-[2.5]" />
                      <span>{language === "en" ? "Create Adda" : "রুম তৈরি করুন"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("profile")}
                      className="bg-brand-dark hover:bg-slate-900 border border-slate-700 text-brand-light font-black text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <User className="w-4 h-4" />
                      <span>{language === "en" ? "My Profile" : "আমার প্রোফাইল"}</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* INSTANT LIVE ROOMS PREVIEW ON HOME PAGE */}
              <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-4">
                  <h3 className="text-xs font-extrabold text-white flex items-center gap-2 uppercase tracking-wide">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    {language === "en" ? "Active Live Rooms Now" : "চলতি লাইভ আড্ডা (হোম)"}
                  </h3>
                  <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase font-mono">
                    {activeRooms.length} {language === "en" ? "Live" : "টি লাইভ"}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[160px] overflow-y-auto scrollbar-thin pr-1">
                  {activeRooms.length === 0 ? (
                    <div className="text-center py-5 bg-brand-dark/40 border border-dashed border-slate-700/60 rounded-xl">
                      <p className="text-[11px] font-bold text-brand-light">
                        {language === "en" ? "No live rooms active right now" : "বর্তমানে কোনো লাইভ আড্ডা নেই"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab("create")}
                        className="text-[10px] text-brand-highlight hover:underline mt-1.5 font-bold block mx-auto"
                      >
                        {language === "en" ? "Go Live first! 🎤" : "প্রথম আড্ডাটি শুরু করুন! 🎤"}
                      </button>
                    </div>
                  ) : (
                    activeRooms.map((room) => (
                      <div 
                        key={room.roomId} 
                        className="flex items-center justify-between bg-brand-dark/65 hover:bg-brand-dark/95 p-3 rounded-xl border border-slate-700/60 hover:border-brand-highlight/50 transition-all shadow-sm group"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-white font-mono truncate">
                              {room.roomId}
                            </span>
                            {room.hasPassword && <Lock className="w-3 h-3 text-amber-400" />}
                          </div>
                          <span className="text-[10px] text-brand-light font-bold block mt-0.5">
                            {room.usersCount} {language === "en" ? "active" : "জন সক্রিয়"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDirectJoin(room.roomId, room.hasPassword)}
                          className="bg-brand-highlight hover:bg-white text-brand-dark font-black text-[10px] px-3 py-1.5 rounded-lg shrink-0 shadow transition-all uppercase"
                        >
                          {language === "en" ? "Join" : "যোগ দিন"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Right Box: Lobby Chat */}
            <div className="lg:col-span-7">
              <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl flex flex-col justify-between min-h-[380px]">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-4">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide">
                      <MessageSquare className="w-4 h-4 text-brand-highlight" />
                      {language === "en" ? "Lobby Public Chat" : "লবি আড্ডা লাইভ চ্যাট"}
                    </h3>
                    <span className="bg-brand-accent/15 border border-brand-accent/20 text-brand-highlight text-[9px] px-2 py-0.5 rounded font-bold uppercase font-mono">
                      {language === "en" ? "Open Board" : "উন্মুক্ত বোর্ড"}
                    </span>
                  </div>

                  {/* Chat Log container */}
                  <div className="space-y-2.5 h-[230px] overflow-y-auto scrollbar-thin pr-1 mb-4 bg-brand-dark/45 rounded-xl p-3.5 border border-slate-800/80">
                    {lobbyMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center">
                        <MessageSquare className="w-6 h-6 text-slate-600 mb-1 animate-pulse" />
                        <p className="text-[11px] text-slate-500 font-bold leading-normal">
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
                          <div className="bg-brand-panel border border-slate-750 p-2.5 rounded-xl rounded-tl-none flex-1 min-w-0">
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
                    className="flex-1 bg-brand-dark border border-slate-700 focus:border-brand-highlight focus:outline-none text-xs px-3.5 py-2.5 rounded-xl text-brand-text placeholder:text-brand-light/30"
                  />
                  <button
                    type="submit"
                    disabled={!lobbyChatInput.trim()}
                    className="bg-brand-accent hover:bg-brand-highlight disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-dark p-2.5 rounded-xl transition-colors shrink-0 shadow-sm"
                  >
                    <Send className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}

        {activeTab === "create" && (
          <div className="max-w-xl mx-auto">
            {/* ROOM JOIN / CREATE FORM */}
            <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide pb-3 border-b border-slate-700/40 mb-4">
                <PlusCircle className="w-4.5 h-4.5 text-brand-highlight" />
                {language === "en" ? "Create or Join a Room" : "রুম তৈরি করুন বা যোগ দিন"}
              </h3>

              {/* Toggle Creator / Joiner modes */}
              <div className="flex bg-brand-dark p-1 rounded-lg border border-slate-700/60 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMode(true);
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                    isCreateMode
                      ? "bg-brand-accent text-brand-dark shadow-md"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Create Room" : "রুম তৈরি করুন"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMode(false);
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                    !isCreateMode
                      ? "bg-brand-accent text-brand-dark shadow-md"
                      : "text-brand-light hover:text-brand-highlight"
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Join Room" : "রুমে যোগ দিন"}</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="w-full bg-gradient-to-r from-brand-accent to-brand-highlight text-brand-dark font-extrabold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(102,252,241,0.25)] hover:shadow-[0_0_20px_rgba(102,252,241,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer border-t border-white/20 active:scale-[0.98] text-sm uppercase tracking-wider font-sans"
                >
                  <Mic className="w-4 h-4 stroke-[2.5]" />
                  <span>{isCreateMode ? t.createBtn : t.joinBtn}</span>
                </button>
              </form>
            </section>
          </div>
        )}

        {activeTab === "live" && (
          <div className="max-w-2xl mx-auto">
            {/* LIVE NOW / ACTIVE ROOMS FEED */}
            <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl flex flex-col">
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
              <div className="space-y-3.5 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
                {activeRooms.length === 0 ? (
                  <div className="text-center py-12 bg-brand-dark/40 border border-dashed border-slate-700/60 rounded-xl flex flex-col items-center justify-center">
                    <Flame className="w-9 h-9 text-slate-500 mb-2 animate-pulse" />
                    <p className="text-xs font-bold text-brand-light">
                      {language === "en" ? "No live rooms active right now" : "বর্তমানে কোনো লাইভ আড্ডা নেই"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className="text-[10px] text-brand-highlight hover:underline mt-2 font-bold uppercase tracking-wider"
                    >
                      {language === "en" ? "Create your own live adda room 🎤" : "আপনার নিজের লাইভ আড্ডা রুম চালু করুন 🎤"}
                    </button>
                  </div>
                ) : (
                  activeRooms.map((room) => (
                    <div 
                      key={room.roomId} 
                      className="flex items-center justify-between bg-brand-dark/65 hover:bg-brand-dark/95 p-4 rounded-xl border border-slate-700/60 hover:border-brand-highlight/50 transition-all shadow-md group"
                    >
                      <div className="flex items-center gap-3.5 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
                          <Users className="w-5.5 h-5.5 text-brand-highlight" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-extrabold text-white font-mono tracking-wide truncate group-hover:text-brand-highlight transition-colors">
                              {room.roomId}
                            </span>
                            {room.hasPassword && (
                              <Lock className="w-3.5 h-3.5 text-amber-400" title={language === "en" ? "Password protected" : "পাসওয়ার্ড দ্বারা সুরক্ষিত"} />
                            )}
                          </div>
                          {/* Member avatar cluster */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-brand-light mr-1.5">
                              {room.usersCount} {language === "en" ? "active" : "জন সক্রিয়"} •
                            </span>
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {room.users.slice(0, 5).map((user: any, idx: number) => (
                                <div 
                                  key={idx} 
                                  className="w-4.5 h-4.5 rounded-full border border-brand-dark overflow-hidden bg-slate-800" 
                                  title={user.username}
                                >
                                  {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[7px] font-extrabold text-white bg-slate-700">
                                      {user.username.substring(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {room.usersCount > 5 && (
                                <div className="w-4.5 h-4.5 rounded-full bg-slate-900 border border-brand-dark flex items-center justify-center text-[7.5px] text-brand-light font-bold">
                                  +{room.usersCount - 5}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleDirectJoin(room.roomId, room.hasPassword)}
                        className="bg-brand-highlight hover:bg-white text-brand-dark font-extrabold text-xs px-4 py-2 rounded-xl shrink-0 shadow-md transition-colors uppercase tracking-wider"
                      >
                        {language === "en" ? "Join" : "যোগ দিন"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="max-w-xl mx-auto">
            {/* PROFILE EDIT SYSTEM PANEL */}
            <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-5">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide">
                  <User className="w-4.5 h-4.5 text-brand-highlight" />
                  {language === "en" ? "Profile Settings" : "প্রোফাইল এডিট সিস্টেম"}
                </h3>
                <span className="px-2 py-0.5 bg-brand-highlight/10 border border-brand-highlight/20 text-[9px] text-brand-highlight rounded font-bold uppercase font-mono">
                  {language === "en" ? "Identity" : "পরিচয়"}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Avatar upload */}
                <div className="relative group shrink-0">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full border-3 border-dashed border-slate-500 hover:border-brand-accent bg-brand-dark/50 flex items-center justify-center cursor-pointer overflow-hidden transition-all shadow-inner relative"
                    title={language === "en" ? "Upload avatar image" : "প্রোফাইল ছবি দিন"}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Camera className="w-7 h-7 text-slate-400 group-hover:text-brand-accent transition-colors" />
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
                      className="absolute bottom-0 right-0 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-1.5 border border-brand-dark shadow transition-colors"
                      title={language === "en" ? "Remove photo" : "ছবি মুছুন"}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Name & Save */}
                <div className="flex-1 w-full space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-brand-light uppercase tracking-wider mb-1.5">
                      {language === "en" ? "Your Nickname" : "আপনার ডাকনাম (আড্ডার নাম)"}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t.usernamePlaceholder}
                      maxLength={20}
                      className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-semibold"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      className="bg-brand-accent hover:bg-brand-highlight text-brand-dark font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all uppercase shadow-md border-t border-white/10 active:scale-[0.98]"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>{language === "en" ? "Save Profile" : "সংরক্ষণ করুন"}</span>
                    </button>
                    {profileSaved && (
                      <span className="text-xs text-emerald-400 font-bold flex items-center animate-fadeIn">
                        ✓ {language === "en" ? "Saved Successfully!" : "সংরক্ষিত হয়েছে!"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left/Middle Column: AI Generators & Inputs */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-700/40 mb-5">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles className="w-4.5 h-4.5 text-amber-400 animate-pulse" />
                    {language === "en" ? "Gemini & Lyria AI Studio" : "জেমিনি ও লিরিয়া এআই স্টুডিও"}
                  </h3>
                  <span className="px-2 py-0.5 bg-amber-400/15 border border-amber-400/20 text-[9px] text-amber-300 rounded font-bold uppercase font-mono">
                    {language === "en" ? "Interactive Hub" : "ইন্টারেক্টিভ হাব"}
                  </span>
                </div>

                {/* Sub tabs selector */}
                <div className="grid grid-cols-3 bg-brand-dark p-1 rounded-xl border border-slate-700/50 mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAiSubTab("search");
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      aiSubTab === "search"
                        ? "bg-brand-accent text-brand-dark shadow-md"
                        : "text-brand-light hover:text-brand-highlight"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{language === "en" ? "Google Search" : "গুগল সার্চ"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiSubTab("image");
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      aiSubTab === "image"
                        ? "bg-brand-accent text-brand-dark shadow-md"
                        : "text-brand-light hover:text-brand-highlight"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{language === "en" ? "Create Image" : "ছবি তৈরি"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiSubTab("music");
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      aiSubTab === "music"
                        ? "bg-brand-accent text-brand-dark shadow-md"
                        : "text-brand-light hover:text-brand-highlight"
                    }`}
                  >
                    <Music className="w-3.5 h-3.5" />
                    <span>{language === "en" ? "Generate Music" : "মিউজিক তৈরি"}</span>
                  </button>
                </div>

                {/* AI Error Notification */}
                {error && (
                  <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold leading-relaxed animate-fadeIn">
                    ⚠ {error}
                  </div>
                )}

                {/* Sub Tab: Search Grounding */}
                {aiSubTab === "search" && (
                  <div className="space-y-4">
                    <p className="text-xs text-brand-light leading-relaxed mb-1">
                      {language === "en"
                        ? "Ask Gemini using Google Search Grounding to search the real-world live web for accurate, real-time facts."
                        : "গুগল সার্চ গ্রাউন্ডিং সহযোগে জেমিনিকে প্রশ্ন করুন এবং বাস্তব সময়ের সঠিক ও হালনাগাদ তথ্য জেনে নিন।"}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiSearchQuery}
                        onChange={(e) => setAiSearchQuery(e.target.value)}
                        placeholder={
                          language === "en"
                            ? "e.g., What is the current price of Ethereum today?"
                            : "যেমন: আজকের আন্তর্জাতিক বাজারে অপরিশোধিত তেলের দাম কত?"
                        }
                        className="flex-1 bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-semibold"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runAiSearch();
                        }}
                      />
                      <button
                        type="button"
                        onClick={runAiSearch}
                        disabled={aiLoading || !aiSearchQuery.trim()}
                        className="bg-brand-accent hover:bg-brand-highlight disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-dark px-5 py-2 rounded-xl text-xs font-black transition-colors uppercase tracking-wider shrink-0 shadow-sm"
                      >
                        {aiLoading ? (
                          <div className="w-4 h-4 border-2 border-brand-dark border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <span>{language === "en" ? "Search" : "সার্চ"}</span>
                        )}
                      </button>
                    </div>

                    {aiSearchResult && (
                      <div className="mt-5 bg-brand-dark/50 border border-slate-800 rounded-xl p-4.5 animate-fadeIn">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-700/20 pb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            {language === "en" ? "Grounding Fact Sheet" : "সার্চ গ্রাউন্ডিং তথ্য"}
                          </span>
                        </div>
                        <p className="text-xs text-brand-text leading-relaxed whitespace-pre-wrap font-sans font-medium">
                          {aiSearchResult}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab: Image Generation & Editing */}
                {aiSubTab === "image" && (
                  <div className="space-y-4">
                    <p className="text-xs text-brand-light leading-relaxed mb-1">
                      {language === "en"
                        ? "Generate high-fidelity custom images from a prompt, or upload a photo to perform creative AI edits."
                        : "যেকোনো টেক্সট প্রম্পট দিয়ে হাই-কোয়ালিটি ছবি তৈরি করুন, অথবা কোনো ছবি আপলোড করে সেটির উপর জাদুকরি এডিটিং করুন।"}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Upload block for reference image */}
                      <div className="border border-dashed border-slate-700 hover:border-brand-accent bg-brand-dark/45 p-4 rounded-xl flex flex-col items-center justify-center text-center relative cursor-pointer group transition-colors min-h-[120px]">
                        {aiImageInput ? (
                          <div className="relative w-full h-24 rounded-lg overflow-hidden border border-slate-800 bg-brand-panel">
                            <img src={aiImageInput} alt="Uploaded preview" className="w-full h-full object-contain" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAiImageInput("");
                              }}
                              className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-500 text-white p-1 rounded-full border border-brand-dark shadow transition-colors"
                              title={language === "en" ? "Remove photo" : "ছবি মুছুন"}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center" onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e: any) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  if (typeof reader.result === "string") {
                                    setAiImageInput(reader.result);
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}>
                            <Camera className="w-7 h-7 text-slate-500 group-hover:text-brand-accent mb-2 transition-colors" />
                            <span className="text-[10px] font-black text-brand-light uppercase tracking-wider">
                              {language === "en" ? "Source/Reference Image (Optional)" : "উৎস ছবি যুক্ত করুন (ঐচ্ছিক)"}
                            </span>
                            <span className="text-[8px] text-slate-500 font-semibold mt-0.5">
                              {language === "en" ? "Click to upload image for edit" : "ছবিটি এডিট করার জন্য ক্লিক করুন"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Prompt input column */}
                      <div className="flex flex-col justify-between gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-brand-light uppercase tracking-wider mb-1.5">
                            {language === "en" ? "Design/Edit Prompt" : "ডিজাইন বা এডিট প্রম্পট"}
                          </label>
                          <textarea
                            value={aiImagePrompt}
                            onChange={(e) => setAiImagePrompt(e.target.value)}
                            placeholder={
                              language === "en"
                                ? "e.g., A futuristic synthwave cyberpunk DJ desk in 8k..."
                                : "যেমন: ৮কে রেজোলিউশনে একটি সাইবারপাঙ্ক স্টাইলের ফিউচারিস্টিক আড্ডা রুম..."
                            }
                            maxLength={250}
                            className="w-full bg-brand-dark text-brand-text rounded-xl px-3.5 py-2.5 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-semibold resize-none h-20"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={runAiImage}
                          disabled={aiLoading || !aiImagePrompt.trim()}
                          className="w-full bg-gradient-to-r from-brand-accent to-brand-highlight disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-dark font-black py-3 px-4 rounded-xl shadow-md transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-1.5"
                        >
                          {aiLoading ? (
                            <div className="w-4 h-4 border-2 border-brand-dark border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-brand-dark" />
                              <span>
                                {aiImageInput
                                  ? (language === "en" ? "Edit Reference Image" : "ছবি এডিট করুন")
                                  : (language === "en" ? "Generate Image" : "নতুন ছবি তৈরি")}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {aiImageOutput && (
                      <div className="mt-5 bg-brand-dark/50 border border-slate-800 rounded-xl p-4 animate-fadeIn flex flex-col items-center">
                        <div className="w-full flex items-center justify-between mb-3 border-b border-slate-700/20 pb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {language === "en" ? "Generated Artwork Output" : "আর্টওয়ার্ক আর্ট আউটপুট"}
                          </span>
                          <a
                            href={aiImageOutput}
                            download="surokkha_ai_art.png"
                            className="text-[10px] text-brand-highlight hover:underline font-bold uppercase tracking-tight"
                          >
                            {language === "en" ? "Download 1K" : "ডাউনলোড ১কে"}
                          </a>
                        </div>
                        <div className="max-w-sm w-full border border-slate-700/50 rounded-xl overflow-hidden shadow-lg bg-black">
                          <img src={aiImageOutput} alt="AI Artwork" className="w-full h-auto object-cover" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab: Music Generation */}
                {aiSubTab === "music" && (
                  <div className="space-y-4">
                    <p className="text-xs text-brand-light leading-relaxed mb-1">
                      {language === "en"
                        ? "Generate beautiful 30s clips or full-length tracks using Google Lyria AI with automated lyrics and instrumentals."
                        : "লিরিকস ও ইনস্ট্রুমেন্টাল সহ গুগল লিরিয়া এআই ব্যবহার করে চমৎকার মিউজিক বা গান তৈরি করে নিন মুহূর্তেই।"}
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-brand-light uppercase tracking-wider mb-1.5">
                          {language === "en" ? "Song / Clip Style Prompt" : "গানের বা সুরের ধরণ ও বিবরণ"}
                        </label>
                        <input
                          type="text"
                          value={aiMusicPrompt}
                          onChange={(e) => setAiMusicPrompt(e.target.value)}
                          placeholder={
                            language === "en"
                              ? "e.g., Upbeat Bengali folk song with ektara, modern hip hop beat"
                              : "যেমন: একতারা এবং আধুনিক হিপহপ বিট সংবলিত হাসিখুশি বাংলা লোকগীতি"
                          }
                          className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-xs border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-semibold"
                        />
                      </div>

                      {/* Pro toggle option */}
                      <div className="flex items-center justify-between bg-brand-dark/45 p-3 rounded-xl border border-slate-800">
                        <div className="flex flex-col pr-3">
                          <span className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                            {language === "en" ? "Lyria-3 Pro rendering" : "লিরিয়া-৩ প্রো রেন্ডারিং"}
                          </span>
                          <span className="text-[9px] text-slate-500 font-semibold mt-0.5">
                            {language === "en" ? "Enable for full orchestration and pro output" : "সম্পূর্ণ সুর ও প্রো কোয়ালিটি গানের জন্য চালু করুন"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAiMusicPro(!aiMusicPro)}
                          className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                            aiMusicPro ? "bg-brand-accent" : "bg-slate-800"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-brand-dark shadow transform duration-200 ${
                              aiMusicPro ? "translate-x-4" : "translate-x-0"
                            }`}
                          ></div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={runAiMusic}
                        disabled={aiLoading || !aiMusicPrompt.trim()}
                        className="w-full bg-gradient-to-r from-brand-accent to-brand-highlight disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-brand-dark font-black py-3 px-4 rounded-xl shadow-md transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-1.5"
                      >
                        {aiLoading ? (
                          <div className="w-4 h-4 border-2 border-brand-dark border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Music className="w-4 h-4 text-brand-dark" />
                            <span>{language === "en" ? "Compose Song Clip" : "মিউজিক সুর বাঁধুন"}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {aiMusicOutput && (
                      <div className="mt-5 bg-brand-dark/50 border border-slate-800 rounded-xl p-4.5 animate-fadeIn flex flex-col items-center gap-4">
                        {/* Interactive dynamic track wrapper */}
                        <div className="w-full flex items-center gap-4 bg-brand-dark/80 p-3 rounded-xl border border-slate-700/60 shadow-inner">
                          <div className="w-11 h-11 rounded-full bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center shrink-0">
                            <Disc className="w-6 h-6 text-brand-highlight animate-spin" style={{ animationDuration: "5s" }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold text-brand-light block uppercase tracking-wider">
                              {language === "en" ? "Interactive Audio Clip" : "ইন্টারেক্টিভ গান / সুর"}
                            </span>
                            <span className="text-xs font-semibold text-white truncate block">
                              {aiMusicPrompt}
                            </span>
                          </div>
                        </div>

                        <audio src={aiMusicOutput} controls className="w-full h-8" />

                        {aiMusicLyrics && (
                          <div className="w-full bg-brand-panel/60 border border-slate-750 rounded-lg p-3.5 mt-1">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider mb-1.5 pb-1.5 border-b border-slate-700/10">
                              {language === "en" ? "Composed Lyrics" : "রচিত গানের লিরিক্স"}
                            </span>
                            <p className="text-xs text-brand-text leading-relaxed whitespace-pre-wrap font-sans font-medium text-center italic">
                              {aiMusicLyrics}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Creations History */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <section className="bg-brand-panel/85 backdrop-blur-md rounded-2xl p-5 border border-slate-700/80 shadow-xl flex flex-col justify-between min-h-[300px]">
                <div>
                  <h4 className="text-xs font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wide pb-2.5 border-b border-slate-700/40 mb-4">
                    <Sparkles className="w-4 h-4 text-brand-highlight" />
                    {language === "en" ? "My Studio Notebook" : "স্টুডিও নোটবুক"}
                  </h4>

                  {!firebaseUser ? (
                    <div className="text-center py-8 bg-brand-dark/40 border border-dashed border-slate-750 rounded-xl p-4">
                      <LogIn className="w-7 h-7 text-slate-600 mb-2.5 mx-auto" />
                      <p className="text-[11px] font-bold text-brand-light leading-relaxed">
                        {language === "en"
                          ? "Login with Google above to securely save and access your creations anytime on our secure database!"
                          : "সুরক্ষিত ক্লাউড ডেটাবেজে আপনার তৈরি মিউজিক, ছবি ও সার্চ ডাটা সংরক্ষণ করতে উপরে গুগল লগইন করুন!"}
                      </p>
                    </div>
                  ) : creations.length === 0 ? (
                    <div className="text-center py-8 bg-brand-dark/40 border border-dashed border-slate-750 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-brand-light">
                        {language === "en" ? "Notebook is currently empty" : "নোটবুক খালি আছে"}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-1">
                        {language === "en" ? "Generate search info, images, or tracks to add items!" : "সার্চ, ছবি বা মিউজিক তৈরি করলে তা এখানে দেখতে পাবেন"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
                      {creations.map((c) => (
                        <div key={c.id} className="bg-brand-dark/65 border border-slate-750 p-3 rounded-xl flex flex-col gap-2 relative group hover:border-slate-700 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider bg-slate-800 text-brand-light flex items-center gap-1">
                              {c.type === "search" && <Search className="w-2.5 h-2.5" />}
                              {c.type === "image" && <ImageIcon className="w-2.5 h-2.5" />}
                              {c.type === "music" && <Music className="w-2.5 h-2.5" />}
                              <span>{c.type}</span>
                            </span>
                            <span className="text-[8px] text-slate-500 font-mono">
                              {new Date(c.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <p className="text-[10px] text-white font-semibold line-clamp-2 leading-normal">
                            "{c.prompt}"
                          </p>

                          {c.type === "search" && c.resultText && (
                            <p className="text-[9px] text-brand-light font-medium line-clamp-3 bg-brand-dark/30 p-1.5 rounded leading-relaxed">
                              {c.resultText}
                            </p>
                          )}

                          {c.type === "image" && c.resultUrl && (
                            <div className="w-full h-16 rounded overflow-hidden bg-black border border-slate-800">
                              <img src={c.resultUrl} alt="creation mini" className="w-full h-full object-cover" />
                            </div>
                          )}

                          {c.type === "music" && c.resultUrl && (
                            <audio src={c.resultUrl} controls className="w-full h-6" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Trust & Policy Details Footer */}
      <footer className="max-w-6xl w-full mx-auto mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 text-xs text-brand-light font-medium border-t border-slate-800/60 pt-4">
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
