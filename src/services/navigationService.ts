import { organicMapsProvider } from "../navigation/providers/organicMaps";
import type { Provider, RoutePayload } from "../navigation/providers/providerBase";

const providers: Provider[] = [organicMapsProvider];

export function getProviders(): Provider[] {
  return providers.filter((provider) => provider.isAvailable());
}

export async function openRoute(
  providerId: string,
  payload: RoutePayload
): Promise<void> {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Navigation provider not found: ${providerId}`);
  }

  await provider.openRoute(payload);
}
