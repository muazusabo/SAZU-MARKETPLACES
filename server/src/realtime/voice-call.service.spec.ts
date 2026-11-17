import { DatabaseService } from '../database/database.service';
import { RealtimeService } from './realtime.service';
import { VoiceCallService } from './voice-call.service';

describe('VoiceCallService', () => {
  const conversationId = 'c5945dfb-4fa2-4c8f-a29c-cc7eb8131e5c';
  const callerId = 'efc69ab9-3752-4e8d-a3ca-ef69f1e7a602';
  const calleeId = '62e553fd-e334-47ee-aa2a-0e4847f22753';
  let service: VoiceCallService;
  let query: jest.Mock;
  let realtime: RealtimeService;
  let emit: jest.Mock;
  let except: jest.Mock;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [{
      other_id: calleeId, caller_name: 'Buyer', callee_name: 'Campus Shop', blocked: false,
    }] });
    const operator: { emit: jest.Mock; except: jest.Mock } = { emit: jest.fn(), except: jest.fn() };
    emit = operator.emit;
    except = operator.except;
    except.mockReturnValue(operator);
    const server = {
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([{}]) })),
      to: jest.fn(() => operator),
    };
    realtime = {
      server,
      emitToUser: jest.fn(),
    } as unknown as RealtimeService;
    service = new VoiceCallService({ query } as unknown as DatabaseService, realtime);
  });

  it('requires a verified account and a real conversation participant', async () => {
    await expect(service.initiate(callerId, 'socket-buyer', false, conversationId))
      .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Confirm your email/) });
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.initiate(callerId, 'socket-buyer', true, conversationId))
      .resolves.toMatchObject({ ok: false, error: 'Conversation not found.' });
  });

  it('authorizes call acceptance and signaling, then ends if the call socket disconnects', async () => {
    const started = await service.initiate(callerId, 'socket-buyer', true, conversationId);
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error(started.error);
    expect(emit).toHaveBeenCalledWith('call:incoming', expect.objectContaining({ callerName: 'Buyer' }));
    expect(emit).toHaveBeenCalledWith('call:outgoing', expect.objectContaining({ calleeName: 'Campus Shop' }));

    expect(service.accept(callerId, 'not-the-callee', started.callId).ok).toBe(false);
    expect(service.signal(callerId, started.callId, { type: 'offer', sdp: 'invalid' }).ok).toBe(false);
    expect(service.accept(calleeId, 'socket-seller', started.callId).ok).toBe(true);
    expect(service.signal(callerId, started.callId, { type: 'offer', sdp: 'v=0\r\ns=voice call\r\n' }).ok).toBe(true);
    expect(realtime.emitToUser).toHaveBeenCalledWith(calleeId, 'call:signal', expect.objectContaining({ callId: started.callId }));
    expect(except).toHaveBeenCalledWith('socket-seller');

    await service.disconnected(callerId, 'socket-buyer');
    expect(realtime.emitToUser).toHaveBeenCalledWith(callerId, 'call:ended', { callId: started.callId, reason: 'connection_lost' });
    expect(realtime.emitToUser).toHaveBeenCalledWith(calleeId, 'call:ended', { callId: started.callId, reason: 'connection_lost' });
    expect(service.end(callerId, started.callId).ok).toBe(false);
  });
});
