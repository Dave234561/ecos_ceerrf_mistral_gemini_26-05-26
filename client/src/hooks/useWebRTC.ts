  roomId: string;
  signalingUrl?: string;
  onRemoteStream?: (stream: MediaStream) => void;
}

// (Supprimé : utiliser useWebRTCAudio à la place)

  const [connected, setConnected] = useState(false);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);

  // Start signaling connection
  useEffect(() => {
    ws.current = new WebSocket(signalingUrl);
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'join', roomId }));
    };
    ws.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'peer-joined':
          await createOffer();
          break;
        case 'signal':
          await handleSignal(data.signal);
          break;
        default:
          break;
      }
    };
    return () => {
      ws.current?.close();
    };
    // eslint-disable-next-line
  }, [roomId, signalingUrl]);

  // Setup local media and peer connection
  useEffect(() => {
    async function setup() {
      localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      peer.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      localStream.current.getTracks().forEach((track) => {
        peer.current?.addTrack(track, localStream.current!);
      });
      peer.current.ontrack = (event) => {
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
          if (onRemoteStream) onRemoteStream(remoteStream.current);
        }
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.current?.addTrack(track);
        });
      };
      peer.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current?.send(
            JSON.stringify({ type: 'signal', roomId, signal: { candidate: event.candidate } })
          );
        }
      };
      setConnected(true);
    }
    setup();
    return () => {
      localStream.current?.getTracks().forEach((t) => t.stop());
      peer.current?.close();
    };
    // eslint-disable-next-line
  }, [roomId]);

  const createOffer = useCallback(async () => {
    if (!peer.current) return;
    const offer = await peer.current.createOffer();
    await peer.current.setLocalDescription(offer);
    ws.current?.send(JSON.stringify({ type: 'signal', roomId, signal: { sdp: offer } }));
  }, [roomId]);

  const handleSignal = useCallback(async (signal: any) => {
    if (!peer.current) return;
    if (signal.sdp) {
      await peer.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await peer.current.createAnswer();
        await peer.current.setLocalDescription(answer);
        ws.current?.send(JSON.stringify({ type: 'signal', roomId, signal: { sdp: answer } }));
      }
    }
    if (signal.candidate) {
      await peer.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }, [roomId]);

  return {
    connected,
    localStream,
    remoteStream,
  };
}
