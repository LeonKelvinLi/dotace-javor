import { AsyncLocalStorage } from "node:async_hooks";
export type RuntimeUser = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
};
const context = new AsyncLocalStorage<{ user: RuntimeUser | null }>();
export const env: Record<string, unknown> = {};
export const getChatGPTUser = async () => context.getStore()?.user ?? null;
export function withIdentity<T>(user: RuntimeUser | null, work: () => T): T {
  return context.run({ user }, work);
}
