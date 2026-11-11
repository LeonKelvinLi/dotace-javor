declare namespace Cloudflare {
  interface Env {
    NATIVE_RUNTIME?: string;
    SCAN_FILE?: (bytes: Uint8Array) => Promise<void>;
    EMAIL_ORIGIN?: string;
    ENCRYPT_EMAIL?: (subject: string, text: string) => string;
    OWNER_EMAIL?: string;
    SEED_DEMO?: string;
    STORAGE_QUOTA_BYTES?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    DEMO_MODE?: string;
  }
}
