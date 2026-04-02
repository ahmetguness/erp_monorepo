import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div style={{ textAlign: 'center', marginTop: '20vh' }}>
          <h1>Hello World!</h1>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            Basic Next.js setup with basic TypeScript configuration and strictly typed via 'strict: true'.
          </p>
        </div>
      </main>
    </div>
  );
}
