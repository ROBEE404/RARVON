/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPPORT_KOFI_URL?: string;
  readonly VITE_SUPPORT_DONATION_URL?: string;
  readonly VITE_PROJECT_REPO_URL?: string;
  readonly VITE_FEEDBACK_EMAIL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_WINDOWS_URL?: string;
  readonly VITE_APP_LINUX_APPIMAGE_URL?: string;
  readonly VITE_APP_LINUX_DEB_URL?: string;
  readonly VITE_SUPPORT_SPONSORSHIP_URL?: string;
  readonly VITE_SUPPORT_OTHER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
