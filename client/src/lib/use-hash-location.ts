// Custom hash-location hook for wouter that strips the query string from the path
// so routes like /#/account?success=1 match the <Route path="/account"> entry.
// wouter's built-in useHashLocation includes the query string in the path,
// causing 404s on any URL that uses ?param.
import { useSyncExternalStore } from "react";

const listeners: Array<() => void> = [];
const onHashChange = () => listeners.forEach((cb) => cb());

const subscribe = (cb: () => void) => {
  if (listeners.push(cb) === 1) {
    addEventListener("hashchange", onHashChange);
  }
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
    if (listeners.length === 0) removeEventListener("hashchange", onHashChange);
  };
};

// "/" + hash, but with everything after "?" cut off
const currentLocation = () => {
  const hash = location.hash.replace(/^#?\/?/, "");
  const path = hash.split("?")[0];
  return "/" + path;
};

export const navigate = (
  to: string,
  { state = null, replace = false }: { state?: unknown; replace?: boolean } = {}
) => {
  const oldURL = location.href;
  const [hashPart, searchPart] = to.replace(/^#?\/?/, "").split("?");
  const url = new URL(location.href);
  url.hash = `/${hashPart}`;
  url.search = searchPart ? `?${searchPart}` : "";
  const newURL = url.href;

  if (replace) {
    history.replaceState(state, "", newURL);
  } else {
    history.pushState(state, "", newURL);
  }
  dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
};

export const useHashLocation = ({ ssrPath = "/" }: { ssrPath?: string } = {}) =>
  [
    useSyncExternalStore(subscribe, currentLocation, () => ssrPath),
    navigate,
  ] as const;

useHashLocation.hrefs = (href: string) => "#" + href;
