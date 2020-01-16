
interface Rule {
  match: string;
  audioUrl: string;
}

interface Theme {
  rules: Rule[];
}

interface Settings {
  currentTheme: Theme;
}

interface MessagingPeer {
  onReceive?: (msg: Object) => void;
  onDisconnect?: () => void;
  send: (msg: Object) => void;
  disconnect: () => void;
}


if (!window.chrome) window.chrome = (<any>window).browser;

const config = {
  defaultTheme: <Theme>{
    rules: [
      {
        match: "button, input[type=button], input[type=submit]",
        audioUrl: "https://support2.lsdsoftware.com/diepkhuc-content/sounds/old_school_ringtone.mp3"
      }
    ]
  }
}


function getSettings(): Promise<Settings> {
  return new Promise(function(fulfill) {
    chrome.storage.local.get(["currentTheme"], x => fulfill(x as Settings));
  })
}

function saveSettings(settings: Settings) {
  return new Promise(function(fulfill) {
    chrome.storage.local.set(settings, fulfill);
  })
}

class ExtensionMessagingPeer implements MessagingPeer {
  onReceive?: (msg: Object) => void;
  onDisconnect?: () => void;
  constructor(private port: chrome.runtime.Port) {
    port.onMessage.addListener(msg => this.onReceive && this.onReceive(msg));
    port.onDisconnect.addListener(() => this.onDisconnect && this.onDisconnect());
  }
  send(msg: Object) {
    this.port.postMessage(msg);
  }
  disconnect() {
    this.port.disconnect();
  }
}

class RpcPeer {
  private idGen: number;
  private pending: {[key: string]: {fulfill: (value: any) => void, reject: (reason: any) => void}};
  onInvoke?: (...args: any[]) => any;
  onDisconnect?: () => void;
  constructor(private messagingPeer: MessagingPeer) {
    this.idGen = 0;
    this.pending = {};
    this.messagingPeer.onReceive = msg => this.onReceive(msg).catch(console.error);
    this.messagingPeer.onDisconnect = () => this.onDisconnect && this.onDisconnect();
  }
  async invoke(...args: any[]) {
    const id = ++this.idGen;
    this.messagingPeer.send({type: "request", id, args});
    return new Promise((fulfill, reject) => this.pending[id] = {fulfill, reject});
  }
  disconnect() {
    this.messagingPeer.disconnect();
  }
  async onReceive(msg: any) {
    if (msg.type == "request" && this.onInvoke) {
      try {
        const result = await this.onInvoke(...msg.args);
        this.messagingPeer.send({type: "response", id: msg.id, result: result});
      }
      catch (err) {
        this.messagingPeer.send({type: "response", id: msg.id, error: err.message});
      }
    }
    else if (msg.type == "response") {
      if (this.pending[msg.id]) {
        if (msg.error) this.pending[msg.id].reject(new Error(msg.error));
        else this.pending[msg.id].fulfill(msg.result);
        delete this.pending[msg.id];
      }
      else console.error("Unexpected response.id", msg);
    }
    else console.error("Unexpected message.type", msg);
  }
}