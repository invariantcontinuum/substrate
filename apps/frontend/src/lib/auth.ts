import { WebStorageStateStore } from "oidc-client-ts";
import type { AuthProviderProps } from "react-oidc-context";

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL;
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM;
const KC_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;

if (!KC_URL || !KC_REALM || !KC_CLIENT_ID) {
  throw new Error(
    "VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, and VITE_KEYCLOAK_CLIENT_ID must be supplied at build time",
  );
}

export const oidcConfig: AuthProviderProps = {
  authority: `${KC_URL}/realms/${KC_REALM}`,
  client_id: KC_CLIENT_ID,
  redirect_uri: window.location.origin + "/callback",
  post_logout_redirect_uri: window.location.origin + "/",
  scope: "openid profile email",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
