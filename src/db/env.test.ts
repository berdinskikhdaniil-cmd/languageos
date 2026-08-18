import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentDatabase,
  classifyDatabaseUrl,
  shouldRunDeploymentMigration,
} from "./env";

const LOCAL_URL = "postgresql://language_os:language_os@127.0.0.1:5442/language_os";
const REMOTE_URL = "postgresql://user:pw@ep-x-pooler.eu-central-1.aws.neon.tech/language_os?sslmode=verify-full";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyDatabaseUrl", () => {
  it("recognises the local development database", () => {
    expect(classifyDatabaseUrl(LOCAL_URL)).toBe("development");
    expect(classifyDatabaseUrl("postgresql://u:p@localhost:5442/language_os")).toBe("development");
  });

  it("treats a hosted database as remote", () => {
    expect(classifyDatabaseUrl(REMOTE_URL)).toBe("remote");
  });

  it("treats an unreadable URL as remote rather than assuming it is safe", () => {
    expect(classifyDatabaseUrl("not a url")).toBe("remote");
    expect(classifyDatabaseUrl("")).toBe("remote");
  });
});

describe("assertDevelopmentDatabase", () => {
  it("allows a local database outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    expect(() => assertDevelopmentDatabase("db:seed")).not.toThrow();
  });

  it("refuses a hosted database", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", REMOTE_URL);
    expect(() => assertDevelopmentDatabase("db:seed")).toThrow(/does not point at a local development database/);
  });

  it("refuses in production even when the URL looks local", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    expect(() => assertDevelopmentDatabase("db:reset")).toThrow(/NODE_ENV is production/);
  });

  it("refuses when there is no URL to judge", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => assertDevelopmentDatabase("db:seed")).toThrow(/DATABASE_URL is not set/);
  });

  it("names the operation it refused, so the message is actionable", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", REMOTE_URL);
    expect(() => assertDevelopmentDatabase("db:reset")).toThrow(/db:reset/);
  });
});

describe("shouldRunDeploymentMigration", () => {
  it("migrates on a Vercel production deployment", () => {
    expect(shouldRunDeploymentMigration({ onVercel: true, vercelEnv: "production" })).toEqual({
      run: true,
    });
  });

  it("never migrates from a preview deployment, whatever branch it came from", () => {
    const decision = shouldRunDeploymentMigration({ onVercel: true, vercelEnv: "preview" });
    expect(decision.run).toBe(false);
    expect(decision).toHaveProperty("reason", expect.stringContaining("preview"));
  });

  it("never migrates from Vercel's development environment", () => {
    expect(shouldRunDeploymentMigration({ onVercel: true, vercelEnv: "development" }).run).toBe(false);
  });

  it("never migrates when Vercel reports no environment at all", () => {
    expect(shouldRunDeploymentMigration({ onVercel: true, vercelEnv: undefined }).run).toBe(false);
  });

  it("runs off Vercel, where the operator chose the target themselves", () => {
    expect(shouldRunDeploymentMigration({ onVercel: false, vercelEnv: undefined })).toEqual({
      run: true,
    });
  });

  it("ignores VERCEL_ENV when not running on Vercel", () => {
    expect(shouldRunDeploymentMigration({ onVercel: false, vercelEnv: "preview" }).run).toBe(true);
  });
});
