import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Message } from "../entity/Message.js";
import { User } from "../entity/User.js";
import { Adoption } from "../entity/Adoption.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { CatalogIds, catalogItemForId } from "../lib/catalog-constants.js";
import { publicUser } from "./user.controller.js";

function messageRepo() {
  return AppDataSource.getRepository(Message);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function adoptionRepo() {
  return AppDataSource.getRepository(Adoption);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

function noteRepo() {
  return AppDataSource.getRepository(PetNote);
}

type UserContext = {
  context: string | null;
  petId: string | null;
  phone: string | null;
  town: string | null;
};

async function buildUserContexts(
  userIds: number[],
): Promise<Map<number, UserContext>> {
  const map = new Map<number, UserContext>();
  if (userIds.length === 0) return map;

  const adoptions = await adoptionRepo()
    .createQueryBuilder("a")
    .where("a.userId IN (:...ids)", { ids: userIds })
    .orderBy("a.createdAt", "DESC")
    .getMany();

  const latestByUser = new Map<number, Adoption>();
  const petIds = new Set<string>();
  for (const a of adoptions) {
    if (a.userId != null && !latestByUser.has(a.userId)) {
      latestByUser.set(a.userId, a);
      if (a.petId) petIds.add(a.petId);
    }
  }

  const pets = petIds.size
    ? await petRepo().findBy({ id: In(Array.from(petIds)) })
    : [];
  const petName = new Map(pets.map((p) => [p.id, p.name]));

  for (const [uid, a] of latestByUser) {
    const name = a.petId ? petName.get(a.petId) : null;
    map.set(uid, {
      context: name
        ? `Solicitud de adopción de ${name}`
        : "Solicitud de adopción",
      petId: a.petId ?? null,
      phone: a.phone ?? null,
      town: a.town ?? null,
    });
  }
  return map;
}

export async function sendMessage(req: Request, res: Response) {
  const senderId = req.authUser?.id;
  if (!senderId) return res.status(401).json({ error: "No autenticado" });

  const sender = await userRepo().findOneBy({ id: Number(senderId) });
  if (!sender)
    return res.status(401).json({ error: "El usuario remitente no existe" });

  const { receiverId, content } = req.body;
  if (!receiverId || !content)
    return res.status(400).json({ error: "Faltan datos" });

  const receiver = await userRepo().findOneBy({ id: Number(receiverId) });
  if (!receiver)
    return res.status(404).json({ error: "Destinatario no encontrado" });

  try {
    const msg = messageRepo().create({
      senderId: sender.id,
      receiverId: receiver.id,
      content,
      read: false,
    });

    await messageRepo().save(msg);
    res.status(201).json(msg);
  } catch (error) {
    console.error("Error saving message:", error);
    res
      .status(500)
      .json({ error: "Error interno del servidor al enviar el mensaje" });
  }
}

export async function getConversation(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const otherUserId = Number(req.params.userId);
  if (!otherUserId) return res.status(400).json({ error: "Usuario invalido" });

  // Paginado por cursor: traemos los últimos `limit` mensajes, o los anteriores
  // a `before` (id) cuando se hace scroll hacia arriba para cargar más.
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const before = req.query.before ? Number(req.query.before) : null;

  let qb = messageRepo()
    .createQueryBuilder("msg")
    .where(
      "((msg.senderId = :userId AND msg.receiverId = :otherUserId) OR (msg.senderId = :otherUserId AND msg.receiverId = :userId))",
      { userId, otherUserId },
    );
  if (before) qb = qb.andWhere("msg.id < :before", { before });

  const rows = await qb
    .orderBy("msg.id", "DESC")
    .take(limit + 1)
    .getMany();
  const hasMore = rows.length > limit;
  // Quitamos el extra de sondeo y devolvemos en orden ascendente (viejo → nuevo).
  const messages = (hasMore ? rows.slice(0, limit) : rows).reverse();

  // Marcar como leidos los mensajes que el usuario actual recibe
  const unreadMessages = messages.filter(
    (m) => m.receiverId === userId && !m.read,
  );
  if (unreadMessages.length > 0) {
    await messageRepo().update(
      unreadMessages.map((m) => m.id),
      { read: true },
    );
    unreadMessages.forEach((m) => (m.read = true));
  }

  const currentUser = await userRepo().findOneBy({ id: userId });
  const otherUser = await userRepo().findOneBy({ id: otherUserId });

  if (currentUser && otherUser) {
    const isAdminToAdmin =
      currentUser.roleId === CatalogIds.userRole.admin &&
      otherUser.roleId === CatalogIds.userRole.admin;
    const isMixed =
      (currentUser.roleId === CatalogIds.userRole.admin &&
        otherUser.roleId === CatalogIds.userRole.user) ||
      (currentUser.roleId === CatalogIds.userRole.user &&
        otherUser.roleId === CatalogIds.userRole.admin);

    if (isAdminToAdmin) {
      return res.json({ messages, hasMore });
    }

    if (isMixed) {
      const userProfile =
        currentUser.roleId === CatalogIds.userRole.admin
          ? otherUser
          : currentUser;
      const statusLabel =
        catalogItemForId(userProfile.statusId)?.label ?? "Desconocido";

      const ctx = (await buildUserContexts([userProfile.id])).get(
        userProfile.id,
      );
      // Notas reales: las de la mascota de la solicitud (médicas, rechazo, etc.).
      const notes = ctx?.petId
        ? await noteRepo().find({
            where: { petId: ctx.petId },
            order: { createdAt: "DESC" },
          })
        : [];

      return res.json({
        messages,
        hasMore,
        profile: {
          id: userProfile.id,
          name: userProfile.name,
          email: userProfile.email,
          photo: userProfile.photo,
          status: statusLabel,
          evaluationNote: userProfile.evaluationNote,
          context: ctx?.context ?? null,
          phone: ctx?.phone ?? null,
          town: ctx?.town ?? null,
          notes: notes.map((n) => ({
            id: n.id,
            text: n.text,
            author: n.authorName,
            createdAt: n.createdAt,
          })),
        },
      });
    }
  }

  res.json({ messages, hasMore });
}

export async function deleteMessage(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Mensaje invalido" });

  const msg = await messageRepo().findOneBy({ id });
  if (!msg) return res.status(404).json({ error: "Mensaje no encontrado" });

  // Puede borrar un participante de la conversación o un admin.
  const isAdmin = req.authUser?.role === "admin";
  const isParticipant = msg.senderId === userId || msg.receiverId === userId;
  if (!isParticipant && !isAdmin) {
    return res.status(403).json({ error: "No autorizado" });
  }

  await messageRepo().remove(msg);
  res.status(204).send();
}

export async function getInbox(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const messages = await messageRepo()
    .createQueryBuilder("msg")
    .where("msg.senderId = :userId OR msg.receiverId = :userId", { userId })
    .orderBy("msg.createdAt", "DESC")
    .getMany();

  const userIds = new Set<number>();
  const latestMessageMap = new Map<number, Message>();
  let unreadCount = 0;

  for (const m of messages) {
    const otherId = m.senderId === userId ? m.receiverId : m.senderId;
    userIds.add(otherId);
    if (!latestMessageMap.has(otherId)) {
      latestMessageMap.set(otherId, m);
    }
    if (m.receiverId === userId && !m.read) {
      unreadCount++;
    }
  }

  let users: User[] = [];
  if (userIds.size > 0) {
    users = await userRepo().findBy({ id: In(Array.from(userIds)) });
  }

  const userMap = new Map(users.map((u) => [u.id, publicUser(u)]));
  const contexts = await buildUserContexts(Array.from(userIds));

  const inbox = Array.from(userIds).map((otherId) => {
    const base = userMap.get(otherId);
    const ctx = contexts.get(otherId);
    return {
      user: base ? { ...base, context: ctx?.context ?? null } : base,
      latestMessage: latestMessageMap.get(otherId),
      unread: messages.filter(
        (m) => m.receiverId === userId && m.senderId === otherId && !m.read,
      ).length,
    };
  });

  res.json({
    totalUnread: unreadCount,
    conversations: inbox,
  });
}

export async function getAdminConversations(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  // For global admin conversations: all conversations in the system or just the admin's?
  // User asked for "tabla paginada, cant de mensajes" for Admin inbox.
  // Let's assume it's for the admin's own inbox, but paginated, OR it's global.
  // I will make it for the admin's inbox, but returning more details.
  // Wait, if it's admin inbox, it's just their messages.
  // Let's do a paginated query of conversations where admin is part of.

  const subQuery = messageRepo()
    .createQueryBuilder("msg")
    .select("MAX(msg.id)", "max_id")
    .where("msg.senderId = :userId OR msg.receiverId = :userId", { userId })
    .groupBy(
      "LEAST(msg.senderId, msg.receiverId), GREATEST(msg.senderId, msg.receiverId)",
    );

  const [latestMessages, totalConversations] = await Promise.all([
    messageRepo()
      .createQueryBuilder("msg")
      .innerJoin(`(${subQuery.getQuery()})`, "latest", "msg.id = latest.max_id")
      .setParameters(subQuery.getParameters())
      .orderBy("msg.createdAt", "DESC")
      .skip(skip)
      .take(limit)
      .getMany(),
    messageRepo()
      .createQueryBuilder("msg")
      .select(
        "COUNT(DISTINCT LEAST(msg.senderId, msg.receiverId) || '-' || GREATEST(msg.senderId, msg.receiverId))",
        "count",
      )
      .where("msg.senderId = :userId OR msg.receiverId = :userId", { userId })
      .getRawOne(),
  ]);

  const total = parseInt(totalConversations.count || "0");

  const otherUserIds = latestMessages.map((m) =>
    m.senderId === userId ? m.receiverId : m.senderId,
  );
  const users =
    otherUserIds.length > 0
      ? await userRepo().findBy({ id: In(otherUserIds) })
      : [];
  const userMap = new Map(users.map((u) => [u.id, publicUser(u)]));

  const conversations = await Promise.all(
    latestMessages.map(async (m) => {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      const count = await messageRepo()
        .createQueryBuilder("msg")
        .where(
          "(msg.senderId = :userId AND msg.receiverId = :otherId) OR (msg.senderId = :otherId AND msg.receiverId = :userId)",
          { userId, otherId },
        )
        .getCount();

      const unreadCount = await messageRepo()
        .createQueryBuilder("msg")
        .where(
          "msg.senderId = :otherId AND msg.receiverId = :userId AND msg.read = false",
          { userId, otherId },
        )
        .getCount();

      return {
        user: userMap.get(otherId),
        latestMessage: m,
        totalMessages: count,
        unread: unreadCount,
      };
    }),
  );

  res.json({
    page,
    limit,
    total,
    conversations,
  });
}
