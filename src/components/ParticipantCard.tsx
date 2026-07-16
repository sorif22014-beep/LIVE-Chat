import React from "react";
import { Mic, MicOff, Crown, Hand, Trash2, Shield, Sparkles } from "lucide-react";
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
}) => {
  const t = translations[currentLanguage];

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
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
      className={`relative flex flex-col items-center justify-between p-5 rounded-2xl transition-all duration-300 border bg-brand-panel shadow-2xl ${
        isSpeaking
          ? "border-brand-highlight shadow-[0_0_15px_rgba(102,252,241,0.35)] scale-[1.02]"
          : participant.isHandRaised
          ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
          : "border-slate-700 hover:border-brand-accent/40"
      }`}
    >
      {/* Hand Raised Banner */}
      {participant.isHandRaised && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-amber-400 text-slate-950 font-bold rounded-full text-[10px] uppercase tracking-wide flex items-center gap-1 shadow-lg animate-bounce">
          <Hand className="w-3 h-3 fill-slate-950" />
          <span>{t.handRaised}</span>
        </div>
      )}

      {/* Speaking Glow Ripple */}
      {isSpeaking && (
        <span className="absolute top-4 right-4 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-highlight opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-highlight"></span>
        </span>
      )}

      {/* Profile Avatar Stage */}
      <div className="relative mt-2 flex items-center justify-center">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center text-brand-dark text-2xl font-extrabold font-sans shadow-inner border-2 ${
            isSpeaking ? "border-brand-highlight" : "border-slate-700"
          } ${bgColor}`}
        >
          {getInitials(participant.username)}
        </div>

        {/* Small Badges stacked on top-right of the avatar */}
        <div className="absolute -bottom-1 -right-1 flex gap-1">
          {participant.isHost && (
            <div className="p-1.5 bg-brand-accent text-brand-dark rounded-full shadow-md" title={t.hostTag}>
              <Crown className="w-3.5 h-3.5 fill-brand-dark stroke-[2.5]" />
            </div>
          )}
          {participant.isMuted ? (
            <div className="p-1.5 bg-rose-600 text-white rounded-full shadow-md" title={t.muteMic}>
              <MicOff className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="p-1.5 bg-brand-accent text-brand-dark rounded-full shadow-md">
              <Mic className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          )}
        </div>
      </div>

      {/* User Information */}
      <div className="text-center mt-4 w-full">
        <p className="text-brand-text font-bold truncate px-2 text-base">
          {participant.username}
          {isMe && <span className="text-xs text-brand-accent ml-1 font-normal">({t.youTag})</span>}
        </p>
        <p className="text-xs text-brand-accent mt-0.5 tracking-wide font-semibold">
          {participant.isHost ? t.hostTag : "Peer"}
        </p>
      </div>

      {/* Host Controls Panel Overlay (Shown to Local Host only, and only on other users) */}
      {isLocalHost && !isMe && (
        <div className="mt-4 pt-3 border-t border-slate-700/60 w-full flex flex-col gap-1.5">
          <p className="text-[9px] text-center font-bold tracking-widest text-brand-light uppercase flex items-center justify-center gap-1">
            <Shield className="w-3 h-3 text-brand-accent" />
            {t.hostControls}
          </p>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {/* Toggle Mute Peer */}
            <button
              id={`host-mute-${participant.socketId}`}
              onClick={() => onMutePeer(participant.socketId, participant.isMuted)}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                participant.isMuted
                  ? "bg-brand-accent/15 text-brand-highlight border border-brand-accent/30 hover:bg-brand-accent/30"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20"
              }`}
            >
              <MicOff className="w-3 h-3" />
              <span>{participant.isMuted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Kick Peer */}
            <button
              id={`host-kick-${participant.socketId}`}
              onClick={() => onKickPeer(participant.socketId)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-all duration-200 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Kick</span>
            </button>
          </div>

          {/* Lower Hand button if user has hand raised */}
          {participant.isHandRaised && (
            <button
              id={`host-lower-${participant.socketId}`}
              onClick={() => onLowerHand(participant.socketId)}
              className="mt-1 flex items-center justify-center gap-1 w-full py-1.5 px-2 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all duration-200 cursor-pointer"
            >
              <Hand className="w-3 h-3" />
              <span>{t.lowerPeerHand}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
