import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  query: (args: any) => ipcRenderer.invoke('db-query', args),
  insert: (args: any) => ipcRenderer.invoke('db-insert', args),
  delete: (args: any) => ipcRenderer.invoke('db-delete', args),
  onMessage: (callback: any) => ipcRenderer.on('main-process-message', (_event, value) => callback(value)),
});
