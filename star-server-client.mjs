
const SERVER_URL = 'wss://tadpole-server.onrender.com/socket';

export function createConnection(callbacks = {}) {
  let socket = null;
  let session = null;
  let retryTimer = null;
  let stopped = false;

  function setStatus(state, message = '') {
    callbacks.onStatus?.({ state, message });
  }

  function connect() {
    if (stopped) return;

    setStatus('connecting');

    try {
      socket = new WebSocket(SERVER_URL);
    } catch (error) {
      setStatus('disconnected', error.message);
      scheduleRetry();
      return;
    }

    socket.addEventListener('open', () => {
      setStatus('connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'welcome') {
          session = data.session;
          callbacks.onConnect?.(session);
        }

        callbacks.onMessage?.(data);
      } catch (error) {
        console.error('Invalid server message:', error);
      }
    });

    socket.addEventListener('close', () => {
      setStatus('disconnected');
      scheduleRetry();
    });

    socket.addEventListener('error', () => {
      setStatus('disconnected');
    });
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, 3000);
  }

  connect();

  return {
    send(data) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
    getSession() {
      return session;
    }
  };
}
