import { arRegistry } from './ar-registry';
import { arUi } from './ar-ui';

/** English → Arabic for the whole interface (loaded only when Arabic is chosen). */
export const ar: Record<string, string> = { ...arRegistry, ...arUi };
