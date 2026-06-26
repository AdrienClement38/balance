/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Navigator {
  bluetooth?: {
    requestDevice(options?: RequestDeviceOptions): Promise<any>;
    getDevices?(): Promise<any[]>;
  };
}
