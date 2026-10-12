import Link from "next/link";
import styles from "./crm.module.css";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

const NAV = [{ href: "/crm/pipeline", label: "Pipeline" }];

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Lead Engine</span>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.userBox}>
          <span className={styles.muted}>{user.email}</span>
          <form action={logout}>
            <button type="submit" className={styles.buttonSecondary}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}