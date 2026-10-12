import styles from "../crm/crm.module.css";
import { login } from "./actions";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Fixed messages only. Text from the URL is never shown, so a crafted link
// can't put words in front of someone.
const MESSAGES: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "Wrong email or password.",
  unapproved: "This account hasn't been approved for access yet.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className={styles.loginWrap}>
      <form action={login} className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Lead Engine CRM</h1>

        {message && <div className={styles.errorBanner}>{message}</div>}

        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={styles.input} />

        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={styles.input}
        />

        <button type="submit" className={styles.buttonPrimary}>
          Sign in
        </button>
      </form>
    </main>
  );
}