import React, { useRef } from "react";
import { Mic, MicOff, Crown, Hand, Trash2, Shield, Sparkles, Camera } from "lucide-react";
import { Participant, Language, translations } from "../types";

interface ParticipantCardProps {
  participant: Participant;
  isMe: boolean;
  isSpeaking: boolean;
  isLocalHost: boolean;
  currentLanguage: Language;
  onMutePeer: (socketId: string, currentMuted: boolean) => void;
  onKickPeer: (socketId: string) => void;
  onLowerHand: (socketId: string) => void;
  onUpdateAvatar?: (avatarUrl: string) => void;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  isMe,
  isSpeaking,
  isLocalHost,
  currentLanguage,
  onMutePeer,
  onKickPeer,
  onLowerHand,
  onUpdateAvatar,
}) => {
  const t = translations[currentLanguage];
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleAvatarClick = () => {
    if (isMe && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpdateAvatar) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          onUpdateAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate a stable aesthetic color based on username hash
  const getBgColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "bg-emerald-600",
      "bg-teal-600",
      "bg-cyan-600",
      "bg-sky-600",
      "bg-indigo-600",
      "bg-violet-600",
      "bg-fuchsia-600",
      "bg-pink-600",
      "bg-rose-600",
      "bg-orange-600",
    ];
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const bgColor = getBgColor(participant.username);

  return (
    <div
      id={`participant-${participant.socketId}`}
      className={`relative flex flex-col items-center justify-between p-1.5 md:p-5 rounded-xl md:rounded-2xl transition-all duration-300 border bg-brand-panel shadow-md md:shadow-2xl ${
        isSpeaking
          ? "border-brand-highlight shadow-[0_0_8px_rgba(102,252,241,0.35)] md:shadow-[0_0_15px_rgba(102,252,241,0.35)] scale-[1.02]"
          : participant.isHandRaised
          ? "border-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.25)] md:shadow-[0_0_12px_rgba(245,158,11,0.25)]"
          : "border-slate-700 hover:border-brand-accent/40"
      }`}
    >
      {/* Hand Raised Banner */}
      {participant.isHandRaised && (
        <div className="absolute -top-2 md:-top-3 left-1/2 transform -translate-x-1/2 px-1.5 md:px-3 py-0.5 md:py-1 bg-amber-400 text-slate-950 font-bold rounded-full text-[8px] md:text-[10px] uppercase tracking-wide flex items-center gap-0.5 md:gap-1 shadow-lg animate-bounce z-10">
          <Hand className="w-2 md:w-3 h-2 md:h-3 fill-slate-950" />
          <span className="hidden md:inline">{t.handRaised}</span>
        </div>
      )}

      {/* Speaking Glow Ripple */}
      {isSpeaking && (
        <span className="absolute top-1.5 md:top-4 right-1.5 md:right-4 flex h-1.5 md:h-3 w-1.5 md:w-3 z-10">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-highlight opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 md:h-3 w-1.5 md:w-3 bg-brand-highlight"></span>
        </span>
      )}

      {/* Profile Avatar Stage */}
      <div className="relative mt-1 md:mt-2 flex items-center justify-center">
        <div
          onClick={handleAvatarClick}
          className={`w-9 h-9 md:w-20 md:h-20 rounded-full flex items-center justify-center text-brand-dark text-[10px] md:text-2xl font-extrabold font-sans shadow-inner border md:border-2 overflow-hidden relative group ${
            isMe ? "cursor-pointer hover:opacity-90" : ""
          } ${
            isSpeaking ? "border-brand-highlight" : "border-slate-700"
          } ${participant.avatarUrl ? "bg-slate-950" : bgColor}`}
        >
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.username}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            getInitials(participant.username)
          )}

          {/* Change Avatar overlay for current user */}
          {isMe && (
            <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity duration-200">
              <Camera className="w-3.5 h-3.5 md:w-6 md:h-6 text-brand-highlight" />
              <span className="text-[6px] md:text-[9px] text-white font-bold tracking-wide uppercase mt-0.5 md:mt-1 scale-[0.8] md:scale-100">
                {currentLanguage === "en" ? "Upload" : "ছবি দিন"}
              </span>
            </div>
          )}
        </div>

        {/* Hidden File Input */}
        {isMe && (
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        )}

        {/* Small Badges stacked on top-right/bottom-right of the avatar */}
        <div className="absolute -bottom-1 -right-1 flex gap-0.5 md:gap-1">
          {participant.isHost && (
            <div className="p-0.5 md:p-1.5 bg-brand-accent text-brand-dark rounded-full shadow-md" title={t.hostTag}>
              <Crown className="w-2 md:w-3.5 h-2 md:h-3.5 fill-brand-dark stroke-[2.5]" />
            </div>
          )}
          {participant.isMuted ? (
            <div className="p-0.5 md:p-1.5 bg-rose-600 text-white rounded-full shadow-md" title={t.muteMic}>
              <MicOff className="w-2 md:w-3.5 h-2 md:h-3.5" />
            </div>
          ) : (
            <div className="p-0.5 md:p-1.5 bg-brand-accent text-brand-dark rounded-full shadow-md">
              <Mic className="w-2 md:w-3.5 h-2 md:h-3.5 stroke-[2.5]" />
            </div>
          )}
        </div>
      </div>

      {/* User Information */}
      <div className="text-center mt-1.5 md:mt-4 w-full">
        <p className="text-brand-text font-bold truncate px-0.5 text-[9px] md:text-base leading-tight">
          {participant.username}
          {isMe && <span className="text-[7px] md:text-xs text-brand-accent ml-0.5 font-normal">({t.youTag})</span>}
        </p>
        <p className="text-[7px] md:text-xs text-brand-accent mt-0.5 tracking-wide font-semibold leading-none">
          {participant.isHost ? t.hostTag : "Peer"}
        </p>
      </div>

      {/* Host Controls Panel Overlay (Shown to Local Host only, and only on other users) */}
      {isLocalHost && !isMe && (
        <div className="mt-1.5 md:mt-3 pt-1.5 md:pt-3 border-t border-slate-700/60 w-full flex flex-col gap-1 md:gap-1.5">
          <p className="hidden md:flex text-[9px] text-center font-bold tracking-widest text-brand-light uppercase items-center justify-center gap-1">
            <Shield className="w-3 h-3 text-brand-accent" />
            {t.hostControls}
          </p>
          <div className="flex md:grid md:grid-cols-2 gap-1 justify-center mt-0.5">
            {/* Toggle Mute Peer */}
            <button
              id={`host-mute-${participant.socketId}`}
              onClick={() => onMutePeer(participant.socketId, participant.isMuted)}
              className={`flex items-center justify-center gap-1 p-1 md:py-1.5 md:px-2 rounded-md md:rounded-lg text-[9px] md:text-xs font-bold transition-all duration-200 cursor-pointer ${
                participant.isMuted
                  ? "bg-brand-accent/15 text-brand-highlight border border-brand-accent/30 hover:bg-brand-accent/30"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20"
              }`}
              title={participant.isMuted ? "Unmute Peer" : "Mute Peer"}
            >
              <MicOff className="w-2.5 md:w-3 h-2.5 md:h-3" />
              <span className="hidden md:inline">{participant.isMuted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Kick Peer */}
            <button
              id={`host-kick-${participant.socketId}`}
              onClick={() => onKickPeer(participant.socketId)}
              className="flex items-center justify-center gap-1 p-1 md:py-1.5 md:px-2 rounded-md md:rounded-lg text-[9px] md:text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-all duration-200 cursor-pointer"
              title="Kick Peer"
            >
              <Trash2 className="w-2.5 md:w-3 h-2.5 md:h-3" />
              <span className="hidden md:inline">Kick</span>
            </button>
          </div>

          {/* Lower Hand button if user has hand raised */}
          {participant.isHandRaised && (
            <button
              id={`host-lower-${participant.socketId}`}
              onClick={() => onLowerHand(participant.socketId)}
              className="flex items-center justify-center gap-1 w-full p-1 md:py-1.5 md:px-2 rounded-md md:rounded-lg text-[9px] md:text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all duration-200 cursor-pointer"
              title={t.lowerPeerHand}
            >
              <Hand className="w-2.5 md:w-3 h-2.5 md:h-3" />
              <span className="hidden md:inline">{t.lowerPeerHand}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
