// Platform helpers — distinguishes web vs mobile (Capacitor) builds.
//
// On the web, API calls are relative ("/api/...") and the existing
// __PORT_5000__ rewriting handles deployment. Inside the mobile app,
// the React bundle is loaded from a local file:// origin, so relative
// URLs do not resolve to a backend. We point them at the deployed
// production backend instead.

export const PROD_BACKEND_URL = "https://character-voice.onrender.com";

// Custom URL scheme registered in AndroidManifest.xml and iOS Info.plist.
// Used as the Stripe Checkout return_url so the OS reopens our app.
export const APP_SCHEME = "charactervoice";
export const billingReturnUrl = () => `${APP_SCHEME}://billing`;

// Capacitor exposes window.Capacitor at runtime when running inside
// the native shell. We feature-detect it so the same bundle works in
// both web and native environments without a build-time switch.
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

// Short alias used by newer code.
export const isNative = isNativeApp;

export function getApiBase(): string {
  if (isNativeApp()) return PROD_BACKEND_URL;
  // Web behavior: keep the existing __PORT_5000__ placeholder pattern.
  const placeholder = "__PORT_5000__";
  return placeholder.startsWith("__") ? "" : placeholder;
}

// API_BASE convenience export (callers that import it as a value).
export const API_BASE = getApiBase();

// True when Apple's App Store rules require us to hide BYOK + external
// payment options. Apple disallows in-app flows that route digital-good
// purchases through anything other than IAP. We do not have a way to
// detect iOS specifically from Capacitor without importing @capacitor/device,
// so we treat all native builds conservatively in the UI: BYOK is hidden
// on iOS, visible on web and Android.
export function getPlatform(): "web" | "ios" | "android" {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as {
    Capacitor?: { getPlatform?: () => "ios" | "android" | "web" };
  }).Capacitor;
  return cap?.getPlatform?.() ?? "web";
}

// Short alias.
export const platform = getPlatform;

export function shouldHideByokUi(): boolean {
  return getPlatform() === "ios";
}
