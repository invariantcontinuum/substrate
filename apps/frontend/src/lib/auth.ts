import { WebStorageStateStore } from "oidc-client-ts";
import type { AuthProviderProps } from "react-oidc-context";

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM || "substrate";

export const oidcConfig: AuthProviderProps = {
  authority: `${KC_URL}/realms/${KC_REALM}`,
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "substrate-frontend",
  redirect_uri: window.location.origin + "/callback",
  post_logout_redirect_uri: window.location.origin,
  scope: "openid profile email",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
