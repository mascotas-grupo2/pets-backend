import { vi } from "vitest";
import type { Request, Response } from "express";

export function mockRes() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

export function mockReq(overrides: Partial<Request> = {}): Request {
  const base: any = {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  };
  return base as Request;
}

export function authReq(authUser: { id: number; role?: string }, overrides: Partial<Request> = {}): Request {
  const r = mockReq(overrides) as any;
  r.authUser = authUser;
  return r as Request;
}
