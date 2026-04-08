type MessageHandler = (data: unknown) => void;
type StatusHandler = (status: "connected" | "disconnected" | "reconnecting") => void;

export class GraphSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;

  constructor(
    url: string,
    token: string,
    onMessage: MessageHandler,
    onStatus: StatusHandler
  ) {
    this.url = url;
    this.token = token;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(): void {
    this.shouldReconnect = true;
    const wsUrl = `${this.url}/ws/graph?token=${this.token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.onStatus("connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.onStatus("disconnected");
      if (this.shouldReconnect) {
        this.onStatus("reconnecting");
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  updateToken(token: string): void {
    this.token = token;
    this.disconnect();
    this.connect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }
}
