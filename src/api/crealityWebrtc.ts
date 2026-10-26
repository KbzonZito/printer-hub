import { request } from './http';

// Stock Creality OS (Hi, K1, K2...) serves its camera over WebRTC on port 8000.
// The signalling endpoint takes the SDP offer as base64-encoded JSON and answers
// the same way (same scheme go2rtc uses for its "creality" format).

export function crealityWebrtcUrl(host: string): string {
  return `http://${host}:8000/call/webrtc_local`;
}

function waitForIce(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, ms);
  });
}

function decodeAnswer(text: string): RTCSessionDescriptionInit {
  const trimmed = text.trim();
  try {
    return JSON.parse(atob(trimmed));
  } catch {
    return JSON.parse(trimmed);
  }
}

export async function connectCrealityWebrtc(
  url: string,
  onStream: (stream: MediaStream) => void,
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.ontrack = (ev) => onStream(ev.streams[0] ?? new MediaStream([ev.track]));
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc, 1500);
    const offer = { type: 'offer', sdp: pc.localDescription!.sdp };
    const res = await request(url, {
      method: 'POST',
      body: btoa(JSON.stringify(offer)),
      headers: { 'Content-Type': 'plain/text' },
      timeout: 6000,
    });
    await pc.setRemoteDescription(decodeAnswer(await res.text()));
    return pc;
  } catch (err) {
    pc.close();
    throw err;
  }
}
