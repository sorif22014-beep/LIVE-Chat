import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Globe, Sparkles, LogIn, PlusCircle, Volume2, Shield, Lock } from "lucide-react";
import { Language, translations } from "../types";

interface LobbyProps {
  initialRoomId?: string;
  onJoin: (username: string, roomId: string, password?: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  initialRoomId = "",
  onJoin,
  language,
  onLanguageChange,
}) => {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isCreateMode, setIsCreateMode] = useState(!initialRoomId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Microhpone test meter states
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const t = translations[language];

  // If a room is passed in URL, make sure we join it
  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
      setIsCreateMode(false);
    }
  }, [initialRoomId]);

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
          // Scale to 0-100 range
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

    // Cleanup loop and microphone streams on unmount
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

  // Handle generating a random room ID
  const handleGenerateRoomId = () => {
    const prefixes = ["chill", "adda", "meeting", "shur", "surokkha", "bangla", "voice"];
    const suffix = Math.random().toString(36).substring(2, 7);
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    setRoomId(`${randomPrefix}-${suffix}`);
    setIsCreateMode(true);
    setError(null);
  };

  // Submit form
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

    // Pass up to parent
    onJoin(username.trim(), roomId.trim().toLowerCase(), password.trim() || undefined);
  };

  return (
    <div className="min-h-screen bg-brand-dark text-brand-text flex flex-col justify-between py-12 px-4 relative overflow-hidden font-sans">
      {/* Decorative Blur Backdrops */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand-highlight/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Global Header */}
      <header className="max-w-4xl w-full mx-auto flex justify-between items-center z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(69,162,158,0.4)]">
            <Mic className="w-6 h-6 text-brand-dark stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight text-white flex items-center gap-1">
              {t.title}
            </h1>
            <span className="text-[10px] text-brand-highlight font-mono tracking-widest uppercase">
              WebRTC Audio Platform
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

      {/* Main Content Layout */}
      <main className="max-w-md w-full mx-auto my-auto z-10">
        <div className="bg-brand-panel/75 backdrop-blur-md rounded-3xl p-8 border border-slate-700 shadow-2xl relative">
          
          {/* Welcome Message */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              {t.createRoom}
            </h2>
            <p className="text-brand-light text-sm mt-2 font-medium leading-relaxed">
              {t.tagline}
            </p>
          </div>

          {/* Toggle Creator / Joiner modes */}
          <div className="flex bg-brand-dark p-1.5 rounded-xl border border-slate-700/60 mb-6">
            <button
              onClick={() => {
                setIsCreateMode(true);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                isCreateMode
                  ? "bg-brand-accent text-brand-dark shadow-md"
                  : "text-brand-light hover:text-brand-highlight"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{language === "en" ? "Create Room" : "রুম তৈরি করুন"}</span>
            </button>
            <button
              onClick={() => {
                setIsCreateMode(false);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                !isCreateMode
                  ? "bg-brand-accent text-brand-dark shadow-md"
                  : "text-brand-light hover:text-brand-highlight"
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>{language === "en" ? "Join Room" : "বিদ্যমান রুমে যোগ দিন"}</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nickname Input */}
            <div>
              <label className="block text-xs font-bold text-brand-light uppercase tracking-wider mb-2">
                {language === "en" ? "Nickname" : "আপনার নাম (আড্ডায় ব্যবহারের জন্য)"}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t.usernamePlaceholder}
                maxLength={20}
                required
                className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-medium"
              />
            </div>

            {/* Room ID input */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-brand-light uppercase tracking-wider">
                  {language === "en" ? "Room ID" : "আড্ডা রুমের কোড (ID)"}
                </label>
                {isCreateMode && (
                  <button
                    type="button"
                    onClick={handleGenerateRoomId}
                    className="text-xs text-brand-highlight hover:text-brand-highlight/85 font-bold tracking-tight underline focus:outline-none cursor-pointer"
                  >
                    {language === "en" ? "Generate Auto" : "অটো কোড তৈরি করুন"}
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
                className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-mono font-medium"
              />
            </div>

            {/* Room Password Input */}
            <div>
              <label className="block text-xs font-bold text-brand-light uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-brand-accent" />
                <span>{t.roomPassword}</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.roomPasswordPlaceholder}
                maxLength={20}
                className="w-full bg-brand-dark text-brand-text rounded-xl px-4 py-3 text-sm border border-slate-700 focus:outline-none focus:border-brand-highlight focus:ring-1 focus:ring-brand-highlight transition-all font-mono font-medium"
              />
            </div>

            {/* Real-time Mic Preview Meter */}
            <div className="bg-brand-dark p-4 rounded-xl border border-slate-700/80 mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-brand-highlight" />
                  <span className="text-xs font-bold text-brand-light">
                    {language === "en" ? "Microphone Test" : "মাইক্রোফোন লেভেল টেস্ট"}
                  </span>
                </div>
                {hasMicPermission === true ? (
                  <span className="px-2 py-0.5 bg-brand-highlight/15 border border-brand-highlight/30 text-[10px] text-brand-highlight font-semibold rounded-full">
                    {language === "en" ? "Ready" : "প্রস্তুত"}
                  </span>
                ) : hasMicPermission === false ? (
                  <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-semibold rounded-full">
                    {language === "en" ? "Blocked" : "অনুমতি নেই"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400 font-semibold rounded-full animate-pulse">
                    {language === "en" ? "Awaiting Permission" : "অনুমতি চাওয়া হচ্ছে"}
                  </span>
                )}
              </div>

              {/* Glowing Volume Bar */}
              <div className="w-full h-2.5 bg-brand-panel rounded-full overflow-hidden relative border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-brand-accent to-brand-highlight transition-all duration-75 shadow-[0_0_10px_rgba(102,252,241,0.5)]"
                  style={{ width: `${hasMicPermission ? micLevel : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-brand-light/70 mt-1.5 leading-relaxed">
                {language === "en"
                  ? "Say something to check your volume level before entering."
                  : "রুমে যোগ দেওয়ার আগে কথা বলে আপনার অডিওর মাত্রা পরীক্ষা করুন।"}
              </p>
            </div>

            {/* Error notifications */}
            {error && (
              <div className="p-3 bg-red-500/15 border border-red-500/25 rounded-xl text-xs text-red-400 font-bold leading-relaxed">
                {error}
              </div>
            )}

            {/* Join Room CTA */}
            <button
              type="submit"
              id="submit-lobby-btn"
              className="w-full mt-6 bg-gradient-to-r from-brand-accent to-brand-highlight text-brand-dark font-extrabold py-3.5 px-4 rounded-xl shadow-[0_0_20px_rgba(102,252,241,0.2)] hover:shadow-[0_0_25px_rgba(102,252,241,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer border-t border-white/20 active:scale-[0.98] text-base"
            >
              <Mic className="w-5 h-5 stroke-[2.5]" />
              <span>{isCreateMode ? t.createBtn : t.joinBtn}</span>
            </button>
          </form>
        </div>
      </main>

      {/* Trust & Policy Details Footer */}
      <footer className="max-w-4xl w-full mx-auto mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 text-xs text-brand-light font-medium">
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
