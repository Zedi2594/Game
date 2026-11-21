
const SERVER_URL = 'wss://tadpole-server.onrender.com/socket';

export function createConnection(callbacks = {}) {
  let socket = null;
  let retryTimer = null;
  let stopped = false;

  function setStatus(state, error) {
    callbacks.onStatus?.({ state, error });
  }

  function connect() {
    if (stopped) return;

    clearTimeout(retryTimer);
    retryTimer = null;
    setStatus('connecting');

    socket = new WebSocket(SERVER_URL);

    socket.addEventListener('open', () => {
      setStatus('connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.t === 'w') {
          callbacks.onConnect?.({ id: message.id });
        }
      } catch (error) {
        console.error('Server message error:', error);
      }

      callbacks.onMessage?.(event);
    });

    socket.addEventListener('error', () => {
      setStatus('error', new Error('Could not connect to Tadpole server'));
    });

    socket.addEventListener('close', () => {
      if (stopped) return;
      setStatus('connecting');
      retryTimer = setTimeout(connect, 3000);
    });
  }

  connect();

  return {
    send(data) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    },

    retry() {
      if (stopped) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      socket?.close();
      connect();
    },

    close() {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    }
  };
}
