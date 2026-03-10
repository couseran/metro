// bleState.svelte.ts
import { createContext } from "svelte";
import type {CommandPayloads, DeviceCommand} from "$lib/utils/send-command.ts";

const SERVICE_UUID = '7009fc28-788a-4bef-a0f5-107beb6ed419';
const CHARACTERISTIC_UUID = '310144ad-c53a-4c53-89a0-f5d78157b5de';

interface BluetoothState {
  readonly isConnected: boolean;
  readonly isSupported: boolean;
  readonly receivedData: string;
  readonly error: Error | null;
  readonly deviceName: string | null;
  connect(): Promise<void>;
  disconnect(): void;
  sendCommand<T extends DeviceCommand>(
      command: T,
      payload: CommandPayloads[T]
  ): Promise<void>;
}

function createBluetoothState(): BluetoothState {
  let isConnected = $state(false);
  let deviceName = $state<string | null>(null);
  let allowDisconnection = $state(false);
  let isSupported = !(typeof navigator === 'undefined' || !navigator.bluetooth);
  let receivedData = $state('');
  let error = $state<Error | null>(null);

  let device: BluetoothDevice | null = null;
  let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  async function connect(): Promise<void> {
    if (!isSupported) {
      error = new Error('Web Bluetooth is not supported in this browser.');
      throw error;
    }

    try {
      error = null;

      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      });
      deviceName = device.name ?? null;
      device.addEventListener('gattserverdisconnected', handleDisconnect);

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleNotifications);

      isConnected = true;
    } catch (err) {
      throw err;
    }
  }

  function handleNotifications(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value!;
    receivedData = new TextDecoder().decode(value);
  }

  function disconnect(): void {
    if (device && device.gatt?.connected) {
      allowDisconnection = true;
      device.gatt.disconnect();
    }
  }

  function handleDisconnect(): void {
    device = null;
    characteristic = null;
    isConnected = false;
    receivedData = '';
    deviceName = null;
    if (!allowDisconnection) {
      error = new Error('Device lost.');
    }
  }

  async function sendCommand<T extends DeviceCommand>(
      command: T,
      payload: CommandPayloads[T]
  ) {
    if (!isConnected) {
      throw Error('Not connected to a device.');
    }

    try {
      error = null;

      // Determine total payload size based on the command
      let totalBytes = 4; // Base size for the 4-letter header
      if (command === 'LEDS') totalBytes += 3;
      else if (command === 'LIFE') totalBytes += 1;
      else if (command === 'ANIM') totalBytes += 1;
      else throw Error(`Unknown command ${command}`);

      // 2. Create the exact sized buffer
      const buffer = new Uint8Array(totalBytes);

      // 3. Write the 4-letter command header (Bytes 0-3)
      for (let i = 0; i < 4; i++) {
        buffer[i] = command.charCodeAt(i);
      }

      // 4. Write the specific payload data
      if (command === 'LEDS') {
        const p = payload as CommandPayloads['LEDS'];
        buffer[4] = p.r;
        buffer[5] = p.g;
        buffer[6] = p.b;
      }
      else if (command === 'LIFE') {
        const p = payload as CommandPayloads['LIFE'];
        buffer[4] = p.level;
      }
      else if (command === 'ANIM') {
        const p = payload as CommandPayloads['ANIM'];
        buffer[4] = p.id;
      }

      if (!characteristic) {
        throw Error('Not connected to a device.');
      }

      try {
        await characteristic.writeValue(buffer);
      } catch (err) {
        error = new Error('Failed to send data: ' + (err as Error).message);
        throw error
      }

      console.debug(`Command ${command} sent successfully with buffer:`);
      console.debug(buffer)

    } catch (error) {
      console.error(`Failed to send ${command}:`, error);
    }
  }

  return {
    get isConnected() { return isConnected; },
    get receivedData() { return receivedData; },
    get deviceName() { return deviceName; },
    get error() { return error; },
    connect,
    disconnect,
    isSupported,
    sendCommand
  };
}

export const [getBluetoothContext, setBluetoothContext] = createContext<BluetoothState>();
export const bluetoothState = createBluetoothState();