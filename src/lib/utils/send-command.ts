// 1. Define the exact 4-letter commands your ESP32 expects
export type DeviceCommand = 'LEDS' | 'LIFE' | 'ANIM';

// 2. Map each command to its specific payload structure
export interface CommandPayloads {
  LEDS: { r: number; g: number; b: number }; // 3 bytes
  LIFE: { level: number };                   // 1 byte (0-255)
  ANIM: { id: number };                      // 1 byte (0-255)
}
