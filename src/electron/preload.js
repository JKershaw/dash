import { contextBridge } from 'electron';

// Minimal secure bridge - only expose what's needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
  // Add other safe APIs as needed in the future
});