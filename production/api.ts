export { env, withIdentity } from "./context";
export { requireActor, identity, readState, command } from "../lib/server";
import * as app from "../app/api/app/route";
import * as files from "../app/api/files/route";
import * as registry from "../app/api/registry/route";
import * as adviser from "../app/api/adviser/route";
import * as extract from "../app/api/extract/route";
import * as ai from "../app/api/ai/route";
export const routes = {
  "/api/app": app,
  "/api/files": files,
  "/api/registry": registry,
  "/api/adviser": adviser,
  "/api/extract": extract,
  "/api/ai": ai,
};
