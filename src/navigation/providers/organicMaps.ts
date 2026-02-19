import type { Provider, RoutePayload } from "./providerBase";

export const organicMapsProvider: Provider = {
  id: "organic-maps",
  label: "Organic Maps",
  isAvailable: () => true,
  openRoute: async (_payload: RoutePayload) => {
    // TODO: implement Organic Maps deep-link launch.
  },
};
