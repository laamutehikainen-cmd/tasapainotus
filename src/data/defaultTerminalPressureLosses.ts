import type { TerminalDeviceType } from "../components/terminal";

export const DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA: Record<
  TerminalDeviceType,
  number
> = {
  supply: 30,
  exhaust: 30,
  outdoor: 20,
  exhaustAir: 40
};

export const DEFAULT_AHU_DEVICE_PRESSURE_LOSS_PA = 150;
