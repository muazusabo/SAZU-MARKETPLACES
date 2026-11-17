'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { apiBaseUrl } from '@/lib/api';
import { getAccessToken, refreshAccessToken } from '@/lib/auth-client';
import { buyerApi } from '@/lib/buyer-api';

export interface VoiceCall {
  callId: string; conversationId: string; peerName: string;
  direction: 'incoming' | 'outgoing'; status: 'incoming' | 'outgoing' | 'connecting' | 'active'; muted: boolean;
}
interface CallAck { ok: boolean; callId?: string; error?: string }
interface RealtimeValue {
  connected: boolean; unreadMessages: number; unreadNotifications: number; refreshCounts(): Promise<void>;
  voiceCall: VoiceCall | null; startVoiceCall(conversationId: string, peerName: string): Promise<void>;
  answerVoiceCall(): Promise<void>; declineVoiceCall(): Promise<void>; endVoiceCall(): Promise<void>; toggleMute(): void;
}
const RealtimeContext = createContext<RealtimeValue | null>(null);

function readVoiceCall(ref: { current: VoiceCall | null }) {
  return ref.current;
}

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function emitCallAck(socket: Socket, event: string, payload: unknown): Promise<CallAck> {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (error: Error | null, response: CallAck) => {
      if (error) reject(new Error('The call request timed out. Check your connection and try again.'));
      else resolve(response);
    });
  });
}

/**
 * Keeps one authenticated WebSocket open while signed in. The server only pushes (new messages, notifications, read receipts);
 * everything the user does still goes through the REST API. If the socket is down, pages fall back to polling.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [voiceCall, setVoiceCallState] = useState<VoiceCall | null>(null);
  const voiceCallRef = useRef<VoiceCall | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const setVoiceCall = useCallback((call: VoiceCall | null) => {
    voiceCallRef.current = call;
    setVoiceCallState(call);
  }, []);

  const clearVoiceCall = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingCandidatesRef.current = [];
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setVoiceCall(null);
  }, [setVoiceCall]);

  const createPeerConnection = useCallback(() => {
    const peer = new RTCPeerConnection(RTC_CONFIG);
    localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!));
    peer.onicecandidate = (event) => {
      const callId = readVoiceCall(voiceCallRef)?.callId;
      if (event.candidate && callId) socketRef.current?.emit('call:signal', { callId, signal: { type: 'ice', candidate: event.candidate.toJSON() } });
    };
    peer.ontrack = (event) => {
      if (!remoteAudioRef.current) return;
      remoteAudioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void remoteAudioRef.current.play().catch(() => toast.error('Tap the call controls to enable call audio.'));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        const call = voiceCallRef.current;
        if (call) setVoiceCall({ ...call, status: 'active' });
      } else if (peer.connectionState === 'failed') {
        const callId = readVoiceCall(voiceCallRef)?.callId;
        if (callId) socketRef.current?.emit('call:end', { callId });
        toast.error('The voice connection failed. Check your network and try again.');
        clearVoiceCall();
      }
    };
    peerRef.current = peer;
    return peer;
  }, [clearVoiceCall, setVoiceCall]);

  const refreshCounts = useCallback(async () => {
    try {
      const [m, n] = await Promise.all([buyerApi.unreadMessages(), buyerApi.unreadNotifications()]);
      setUnreadMessages(m.count); setUnreadNotifications(n.count);
    } catch { /* counts are best-effort */ }
  }, []);

  const startVoiceCall = useCallback(async (conversationId: string, peerName: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return void toast.error('Connecting to calls… try again in a moment.');
    if (voiceCallRef.current) return void toast.error('Finish the current call before starting another.');
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error('Voice calls require microphone access on a secure connection.');
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      createPeerConnection();
      const result = await emitCallAck(socket, 'call:initiate', { conversationId });
      if (!result.ok || !result.callId) throw new Error(result.error ?? 'Could not start the call.');
      if (!voiceCallRef.current) {
        setVoiceCall({ callId: result.callId, conversationId, peerName, direction: 'outgoing', status: 'outgoing', muted: false });
      }
    } catch (error) {
      const callId = readVoiceCall(voiceCallRef)?.callId;
      if (callId) socketRef.current?.emit('call:end', { callId });
      clearVoiceCall();
      toast.error(error instanceof Error ? error.message : 'Could not start the call.');
    }
  }, [clearVoiceCall, createPeerConnection, setVoiceCall]);

  const answerVoiceCall = useCallback(async () => {
    const call = voiceCallRef.current;
    const socket = socketRef.current;
    if (!call || call.direction !== 'incoming' || !socket?.connected) return;
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error('Voice calls require microphone access on a secure connection.');
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      createPeerConnection();
      const result = await emitCallAck(socket, 'call:accept', { callId: call.callId });
      if (!result.ok) throw new Error(result.error ?? 'Could not answer the call.');
      const latest = voiceCallRef.current;
      if (latest) setVoiceCall({ ...latest, status: 'connecting' });
    } catch (error) {
      socketRef.current?.emit('call:decline', { callId: call.callId });
      clearVoiceCall();
      toast.error(error instanceof Error ? error.message : 'Could not answer the call.');
    }
  }, [clearVoiceCall, createPeerConnection, setVoiceCall]);

  const declineVoiceCall = useCallback(async () => {
    const call = voiceCallRef.current;
    if (!call || call.direction !== 'incoming') return;
    try {
      const result = await emitCallAck(socketRef.current!, 'call:decline', { callId: call.callId });
      if (!result.ok) toast.error(result.error ?? 'Could not decline the call.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decline the call.');
    } finally { clearVoiceCall(); }
  }, [clearVoiceCall]);

  const endVoiceCall = useCallback(async () => {
    const call = voiceCallRef.current;
    if (!call) return;
    try {
      const socket = socketRef.current;
      if (socket?.connected) {
        const result = await emitCallAck(socket, 'call:end', { callId: call.callId });
        if (!result.ok) toast.error(result.error ?? 'Could not end the call.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end the call.');
    } finally { clearVoiceCall(); }
  }, [clearVoiceCall]);

  const toggleMute = useCallback(() => {
    const call = voiceCallRef.current;
    if (!call) return;
    const muted = !call.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setVoiceCall({ ...call, muted });
  }, [setVoiceCall]);

  useEffect(() => {
    if (status !== 'authenticated') { setUnreadMessages(0); setUnreadNotifications(0); setConnected(false); clearVoiceCall(); return; }
    let closed = false; let attempts = 0; let retry: ReturnType<typeof setTimeout> | undefined;
    void refreshCounts();

    const socket = io(new URL(apiBaseUrl()).origin, {
      path: '/socket.io', transports: ['websocket', 'polling'], reconnectionDelay: 1000, reconnectionDelayMax: 15000,
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    });
    socketRef.current = socket;
    // The server closes a socket the moment its access token expires (or rejects a stale one): refresh, then reconnect with backoff.
    const reauth = () => {
      if (closed || attempts >= 6) return;
      socket.disconnect();
      retry = setTimeout(async () => { attempts++; if (await refreshAccessToken()) { if (!closed) socket.connect(); } }, Math.min(30_000, 500 * 2 ** attempts));
    };

    socket.on('ready', () => { attempts = 0; setConnected(true); void refreshCounts(); });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (voiceCallRef.current) clearVoiceCall();
      if (reason === 'io server disconnect') reauth();
    });
    socket.on('auth_error', (p: { reason?: string }) => { if (p?.reason !== 'too_many_connections') reauth(); });
    socket.on('message:new', (p: { conversationId: string; message: { mine: boolean } }) => {
      if (!p.message.mine) setUnreadMessages((c) => c + 1);
      void qc.invalidateQueries({ queryKey: ['messages', p.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversation', p.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('conversation:read', (p: { conversationId: string }) => { void qc.invalidateQueries({ queryKey: ['messages', p.conversationId] }); });
    socket.on('notification:new', () => { setUnreadNotifications((c) => c + 1); void qc.invalidateQueries({ queryKey: ['notifications'] }); });

    socket.on('call:incoming', (p: { callId: string; conversationId: string; callerName: string }) => {
      if (voiceCallRef.current) return;
      setVoiceCall({ callId: p.callId, conversationId: p.conversationId, peerName: p.callerName, direction: 'incoming', status: 'incoming', muted: false });
    });
    socket.on('call:outgoing', (p: { callId: string; conversationId: string; calleeName: string }) => {
      if (voiceCallRef.current?.callId === p.callId) return;
      setVoiceCall({ callId: p.callId, conversationId: p.conversationId, peerName: p.calleeName, direction: 'outgoing', status: 'outgoing', muted: false });
    });
    socket.on('call:accepted', async (p: { callId: string }) => {
      const call = voiceCallRef.current;
      if (!call || call.callId !== p.callId || call.direction !== 'outgoing') return;
      setVoiceCall({ ...call, status: 'connecting' });
      try {
        const peer = peerRef.current ?? createPeerConnection();
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socketRef.current?.emit('call:signal', { callId: p.callId, signal: { type: 'offer', sdp: offer.sdp } });
      } catch {
        toast.error('Could not establish the voice call.');
        void endVoiceCall();
      }
    });
    socket.on('call:answered_elsewhere', (p: { callId: string }) => {
      if (voiceCallRef.current?.callId === p.callId) {
        clearVoiceCall();
        toast.info('The call was answered in another tab.');
      }
    });
    socket.on('call:signal', async (p: { callId: string; signal: { type: 'offer'; sdp: string } | { type: 'answer'; sdp: string } | { type: 'ice'; candidate: RTCIceCandidateInit } }) => {
      const call = voiceCallRef.current;
      const peer = peerRef.current;
      if (!call || call.callId !== p.callId || !peer) return;
      try {
        if (p.signal.type === 'offer') {
          await peer.setRemoteDescription({ type: 'offer', sdp: p.signal.sdp });
          for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socketRef.current?.emit('call:signal', { callId: p.callId, signal: { type: 'answer', sdp: answer.sdp } });
        } else if (p.signal.type === 'answer') {
          await peer.setRemoteDescription({ type: 'answer', sdp: p.signal.sdp });
          for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
        } else if (peer.remoteDescription) {
          await peer.addIceCandidate(p.signal.candidate);
        } else {
          pendingCandidatesRef.current.push(p.signal.candidate);
        }
      } catch {
        toast.error('Could not establish the voice call.');
        void endVoiceCall();
      }
    });
    socket.on('call:ended', (p: { callId: string; reason: string }) => {
      if (voiceCallRef.current?.callId !== p.callId) return;
      clearVoiceCall();
      if (p.reason === 'declined') toast.info('The other person declined the call.');
      else if (p.reason === 'timeout') toast.info('No answer. The call ended.');
      else if (p.reason === 'connection_lost') toast.info('The call ended because a participant disconnected.');
    });

    const onFocus = () => void refreshCounts();
    window.addEventListener('focus', onFocus);
    return () => {
      closed = true; clearTimeout(retry); window.removeEventListener('focus', onFocus);
      if (socketRef.current === socket) socketRef.current = null;
      clearVoiceCall();
      socket.removeAllListeners(); socket.disconnect();
    };
  }, [status, qc, refreshCounts, clearVoiceCall, createPeerConnection, setVoiceCall, endVoiceCall]);

  const value = useMemo(() => ({
    connected, unreadMessages, unreadNotifications, refreshCounts,
    voiceCall, startVoiceCall, answerVoiceCall, declineVoiceCall, endVoiceCall, toggleMute,
  }), [connected, unreadMessages, unreadNotifications, refreshCounts, voiceCall, startVoiceCall, answerVoiceCall, declineVoiceCall, endVoiceCall, toggleMute]);
  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
      {voiceCall && (
        <aside role="dialog" aria-label="Voice call" aria-live="polite" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-sm rounded-2xl border bg-card p-4 shadow-xl sm:inset-x-auto sm:right-5">
          <p className="font-bold">{voiceCall.status === 'incoming' ? `Incoming call from ${voiceCall.peerName}` : voiceCall.status === 'outgoing' ? `Calling ${voiceCall.peerName}…` : voiceCall.status === 'connecting' ? `Connecting to ${voiceCall.peerName}…` : `On a call with ${voiceCall.peerName}`}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {voiceCall.status === 'incoming' ? (
              <>
                <Button size="sm" onClick={() => { void answerVoiceCall(); }}><Phone aria-hidden className="mr-1 size-4" />Answer</Button>
                <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { void declineVoiceCall(); }}><PhoneOff aria-hidden className="mr-1 size-4" />Decline</Button>
              </>
            ) : (
              <>
                {voiceCall.status === 'active' && <Button size="sm" variant="outline" onClick={toggleMute}>{voiceCall.muted ? <MicOff aria-hidden className="mr-1 size-4" /> : <Mic aria-hidden className="mr-1 size-4" />}{voiceCall.muted ? 'Unmute' : 'Mute'}</Button>}
                <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { void endVoiceCall(); }}><PhoneOff aria-hidden className="mr-1 size-4" />End call</Button>
              </>
            )}
          </div>
        </aside>
      )}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
