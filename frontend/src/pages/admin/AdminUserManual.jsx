import ClientUserManual from "../client/ClientUserManual";

// Admin view of the User Manual. It reuses the exact same standalone,
// content-driven manual that clients see (single source of truth), so any
// function/sub-function/image added to the MANUAL data shows up in both
// places. No `onGoTab` is passed here, so the client-only "Open" buttons are
// simply hidden in the admin panel.
export default function AdminUserManual() {
  return <ClientUserManual />;
}
