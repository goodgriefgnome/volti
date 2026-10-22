// File System Access API members missing from TypeScript's DOM types.

interface FileSystemHandlePermissionDescriptor { mode?: 'read' | 'readwrite' }

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface DirectoryPickerOptions { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
