import styles from "./crm.module.css";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <div className={error ? styles.errorBanner : styles.okBanner}>{error ?? ok}</div>;
}