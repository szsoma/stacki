// Global declarations for Webflow designer API
// Available at runtime in Webflow's designer environment.
declare var webflow: any;

// Module stubs for files not yet migrated
declare module './variable-modes' {
  const modes: any;
  export default modes;
}

declare module './auth-client' {
  const auth: any;
  export default auth;
}
