type ActionKind = "buttonClick" | "buttonHover" | "linkClick";

interface ActionSetting {
  enabled: boolean;
  soundId: string;
}

interface Settings {
  enabled: boolean;
  volume: number;       //0..1
  varyPitch: boolean;   //small random detune so repeated sounds don't feel robotic
  actions: Record<ActionKind, ActionSetting>;
  disabledSites: string[];
}


const actionLabels: Record<ActionKind, string> = {
  buttonClick: "Button click",
  buttonHover: "Button hover",
  linkClick: "Link click",
}

const defaultSettings: Settings = {
  enabled: true,
  volume: 0.6,
  varyPitch: true,
  actions: {
    buttonClick: {enabled: true, soundId: "pop"},
    buttonHover: {enabled: false, soundId: "blip"},
    linkClick: {enabled: false, soundId: "swoosh"},
  },
  disabledSites: [],
}

//elements that count as buttons and links, checked innermost-first along the event path
const buttonSelector = "button, input[type=button], input[type=submit], input[type=reset], input[type=image], [role=button], summary"
const linkSelector = "a[href], area[href], [role=link]"


async function getSettings(): Promise<Settings> {
  const {settings} = await chrome.storage.sync.get("settings") as {settings?: Partial<Settings>};
  return mergeSettings(settings);
}

function saveSettings(settings: Settings): Promise<void> {
  return chrome.storage.sync.set({settings});
}

function onSettingsChanged(listener: (settings: Settings) => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area == "sync" && changes.settings) listener(mergeSettings(changes.settings.newValue as Partial<Settings>|undefined));
  })
}

function mergeSettings(stored: Partial<Settings>|undefined): Settings {
  const actions = {...defaultSettings.actions};
  for (const kind of Object.keys(actions) as ActionKind[]) {
    actions[kind] = {...actions[kind], ...stored?.actions?.[kind]};
  }
  return {...defaultSettings, ...stored, actions};
}

function isSiteEnabled(settings: Settings, hostname: string) {
  return settings.enabled && !settings.disabledSites.includes(hostname);
}
