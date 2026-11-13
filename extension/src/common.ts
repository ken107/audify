//buttonHover covers links too; the key keeps its original name so saved settings carry over
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
  linkClick: "Link click",
  buttonHover: "Hover",
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

//asks the offscreen document to play a sound; see background.ts
interface PlayMessage {
  type: "play";
  layers: Layer[];    //the sound itself, so the offscreen document needn't look up custom sounds
  volume: number;
  varyPitch: boolean;
  time: number;   //Date.now() when requested, so a sound that would come out late can be dropped
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


//Sounds made in the editor live in sync storage, one item per sound (an item can hold 8 KB,
//a sound is well under 1 KB), so they follow the user to their other browsers like settings do
const customSoundPrefix = "sound:";
const customSoundIdPrefix = "custom-";

async function getCustomSounds(): Promise<Map<string, Sound>> {
  const items = await chrome.storage.sync.get(null);
  const sounds = new Map<string, Sound>();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith(customSoundPrefix)) {
      const sound = parseCustomSound(value);
      if (sound) sounds.set(sound.id, sound);
    }
  }
  return sounds;
}

function saveCustomSound(sound: Sound): Promise<void> {
  return chrome.storage.sync.set({[customSoundPrefix + sound.id]: sound});
}

function deleteCustomSound(id: string): Promise<void> {
  return chrome.storage.sync.remove(customSoundPrefix + id);
}

function onCustomSoundsChanged(listener: () => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area == "sync" && Object.keys(changes).some(key => key.startsWith(customSoundPrefix))) listener();
  })
}

function newCustomSoundId() {
  return customSoundIdPrefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseCustomSound(value: any): Sound|undefined {
  if (!value || typeof value.id != "string" || !value.id.startsWith(customSoundIdPrefix)) return undefined;
  const layers = sanitizeLayers(value.layers);
  if (!layers.length) return undefined;
  return {id: value.id, name: String(value.name || "Untitled sound").slice(0, 60), layers};
}
