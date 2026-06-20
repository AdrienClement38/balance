/// <reference types="vite/client" />

interface Navigator {
  bluetooth?: {
    requestDevice(options?: RequestDeviceOptions): Promise<any>;
    getDevices?(): Promise<any[]>;
  };
}
