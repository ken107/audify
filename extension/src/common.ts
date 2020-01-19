
interface Rule {
  match: string;
  audioUrl: string;
}

interface Theme {
  id: string;
  name: string;
  rules: Rule[];
}

interface Settings {
  myThemes?: Theme[];
  currentThemeId?: string;
}

interface MessagingPeer {
  onReceive?: (msg: Object) => void;
  onDisconnect?: () => void;
  send: (msg: Object) => void;
  disconnect: () => void;
}


if (!window.chrome) window.chrome = (<any>window).browser;

var config = {
  isDev: !('update_url' in chrome.runtime.getManifest()),
  emptyTheme: <Theme>{
    id: "system-off",
    name: "Off",
    rules: []
  },
  defaultTheme: <Theme>{
    id: "system-hl",
    name: "Half-Life",
    rules: [
      {match: "button, input[type=button]", "audioUrl": "https://support2.lsdsoftware.com/diepkhuc-content/upload/Boing-sound.mp3"},
    ]
  },
}


async function getSettings(): Promise<Settings> {
  const res = await new Promise<Settings>(f => chrome.storage.local.get(["myThemes", "currentThemeId"], x => f(x as Settings)));
  if (!res.myThemes) res.myThemes = [config.emptyTheme, config.defaultTheme];
  if (!res.currentThemeId) res.currentThemeId = config.defaultTheme.id;
  return res;
}

function saveSettings(settings: Settings): Promise<void> {
  return new Promise(f => chrome.storage.local.set(settings, f));
}

function createTab(url: string): Promise<chrome.tabs.Tab> {
  return new Promise(f => chrome.tabs.create({url}, f));
}


var ExtensionMessagingPeer = class implements MessagingPeer {
  onReceive?: (msg: Object) => void;
  onDisconnect?: () => void;
  constructor(private port: chrome.runtime.Port) {
    port.onMessage.addListener(msg => this.onReceive?.(msg));
    port.onDisconnect.addListener(() => this.onDisconnect?.());
  }
  send(msg: Object) {
    this.port.postMessage(msg);
  }
  disconnect() {
    this.port.disconnect();
  }
}

var DocumentMessagingPeer = class implements MessagingPeer {
  onReceive?: (msg: Object) => void;
  onDisconnect?: () => void;
  constructor(private sendPrefix: string, receivePrefix: string) {
    document.addEventListener(receivePrefix+"Message", (event: any) => this.onReceive?.(JSON.parse(event.detail)));
    document.addEventListener(receivePrefix+"Disconnect", () => this.onDisconnect?.());
  }
  send(msg: Object) {
    document.dispatchEvent(new CustomEvent(this.sendPrefix+"Message", {detail: JSON.stringify(msg)}));
  }
  disconnect() {
    document.dispatchEvent(new CustomEvent(this.sendPrefix+"Disconnect"));
  }
}

var RpcPeer = class {
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
