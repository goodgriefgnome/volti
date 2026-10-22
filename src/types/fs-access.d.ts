// Type declarations only: File System Access API members missing from TypeScript's DOM types.
// Remove one once TypeScript has it.

interface FileSystemHandlePermissionDescriptor { mode?: 'read' | 'readwrite' }

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle {
  /** Renames the file in its folder. Missing in older browsers. */
  move?(newName: string): Promise<void>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface DirectoryPickerOptions { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
