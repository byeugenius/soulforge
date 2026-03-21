type FileEditCallback = (absPath: string, content: string) => void;
type FileReadCallback = (absPath: string) => void;
type VoidCallback = () => void;

const editListeners = new Set<FileEditCallback>();
const readListeners = new Set<FileReadCallback>();
const cacheResetListeners = new Set<VoidCallback>();

export function onFileEdited(cb: FileEditCallback): () => void {
  editListeners.add(cb);
  return () => {
    editListeners.delete(cb);
  };
}

export function onFileRead(cb: FileReadCallback): () => void {
  readListeners.add(cb);
  return () => {
    readListeners.delete(cb);
  };
}

/** Subscribe to cache reset events (fired on /clear, compaction, etc.) */
export function onCacheReset(cb: VoidCallback): () => void {
  cacheResetListeners.add(cb);
  return () => {
    cacheResetListeners.delete(cb);
  };
}

export function emitFileEdited(absPath: string, content: string): void {
  for (const cb of editListeners) cb(absPath, content);
}

export function emitFileRead(absPath: string): void {
  for (const cb of readListeners) cb(absPath);
}

/** Signal all read caches to clear (conversation reset, compaction, etc.) */
export function emitCacheReset(): void {
  for (const cb of cacheResetListeners) cb();
}
