import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes, authReq } from "../helpers/express.js";
import { makeUser } from "../factories.js";

const findOneBy = vi.fn();
const count = vi.fn();
const save = vi.fn();

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findOneBy, count, save });
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(),
  resolveCatalogValueId: vi.fn(),
  CatalogValidationError: class CatalogValidationError extends Error {},
}));

vi.mock("../../src/lib/minio.js", () => ({
  uploadFileToMinio: vi.fn(),
}));

import { adminUpdateUserRole } from "../../src/controllers/user.controller.js";
import * as catalogValues from "../../src/lib/catalog-values.js";

beforeEach(() => {
  findOneBy.mockReset();
  count.mockReset();
  save.mockReset();
  vi.mocked(catalogValues.resolveCatalogValueId).mockReset();
});

function mockRoleResolves(roleId: number) {
  vi.mocked(catalogValues.resolveCatalogValueId).mockResolvedValue(roleId);
}

describe("adminUpdateUserRole - validacion", () => {
  it("400 si el id no es entero", async () => {
    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "abc" } as any,
      body: { roleId: CatalogIds.userRole.admin },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400 si el body no tiene role ni roleId valido", async () => {
    mockRoleResolves(0 as any);
    vi.mocked(catalogValues.resolveCatalogValueId).mockResolvedValue(null);
    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: {},
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 si el usuario target no existe", async () => {
    mockRoleResolves(CatalogIds.userRole.user);
    findOneBy.mockResolvedValue(null);
    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: CatalogIds.userRole.user },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("CatalogValidationError -> 400", async () => {
    vi.mocked(catalogValues.resolveCatalogValueId).mockRejectedValue(
      new catalogValues.CatalogValidationError("rol desconocido"),
    );
    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: 9999 },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("adminUpdateUserRole - reglas de seguridad", () => {
  it("permite no-op cuando el rol coincide", async () => {
    mockRoleResolves(CatalogIds.userRole.admin);
    const target = makeUser({ id: 5, roleId: CatalogIds.userRole.admin });
    findOneBy.mockResolvedValue(target);

    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: CatalogIds.userRole.admin },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(save).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it("bloquea auto-degradacion: admin no puede quitarse el rol", async () => {
    mockRoleResolves(CatalogIds.userRole.user);
    const target = makeUser({ id: 7, roleId: CatalogIds.userRole.admin });
    findOneBy.mockResolvedValue(target);

    const req = authReq({ id: 7, role: "admin" }, {
      params: { id: "7" } as any,
      body: { roleId: CatalogIds.userRole.user },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "No podés quitarte el rol de admin a vos mismo",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("bloquea bajar al ultimo admin del sistema", async () => {
    mockRoleResolves(CatalogIds.userRole.user);
    const target = makeUser({ id: 5, roleId: CatalogIds.userRole.admin });
    findOneBy.mockResolvedValue(target);
    count.mockResolvedValue(1);

    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: CatalogIds.userRole.user },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "No podés dejar al sistema sin administradores",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("permite bajar a un admin si hay mas de uno", async () => {
    mockRoleResolves(CatalogIds.userRole.user);
    const target = makeUser({ id: 5, roleId: CatalogIds.userRole.admin });
    findOneBy.mockResolvedValue(target);
    count.mockResolvedValue(3);
    save.mockImplementation(async (u) => u);

    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: CatalogIds.userRole.user },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        roleId: CatalogIds.userRole.user,
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it("permite ascender un usuario a admin", async () => {
    mockRoleResolves(CatalogIds.userRole.admin);
    const target = makeUser({ id: 5, roleId: CatalogIds.userRole.user });
    findOneBy.mockResolvedValue(target);
    save.mockImplementation(async (u) => u);

    const req = authReq({ id: 1, role: "admin" }, {
      params: { id: "5" } as any,
      body: { roleId: CatalogIds.userRole.admin },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        roleId: CatalogIds.userRole.admin,
      }),
    );
    expect(count).not.toHaveBeenCalled();
  });

  it("admin se puede asignar admin a si mismo (no-op pero permitido)", async () => {
    mockRoleResolves(CatalogIds.userRole.admin);
    const target = makeUser({ id: 7, roleId: CatalogIds.userRole.admin });
    findOneBy.mockResolvedValue(target);

    const req = authReq({ id: 7, role: "admin" }, {
      params: { id: "7" } as any,
      body: { roleId: CatalogIds.userRole.admin },
    });
    const res = mockRes();
    await adminUpdateUserRole(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(save).not.toHaveBeenCalled();
  });
});
