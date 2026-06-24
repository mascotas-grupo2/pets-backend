import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Message } from "../entity/Message.js";
import { User } from "../entity/User.js";
import { Adoption } from "../entity/Adoption.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { Notification } from "../entity/Notification.js";
import { CatalogIds, catalogItemForId } from "../lib/catalog-constants.js";
import { publicUser } from "./user.controller.js";
import { notify } from "../lib/notify.js";
import { recordActivity } from "../lib/activity.js";
import { uploadFileToMinio } from "../lib/minio.js";

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

function notificationRepo() {
  return AppDataSource.getRepository(Notification);
}

type UserContext = {
  context: string | null;
  petId: string | null;
  adoptionId: number | null;
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
      adoptionId: a.id,
      phone: a.phone ?? null,
      town: a.town ?? null,
    });
  }

  return map;
}

/**
 * Extrae el petId del contenido de un mensaje de reclamo.
 * Busca "Link: /mascotas-perdidas/<petId>" que se incluye en el mensaje automático.
 */
function extractClaimPetId(content: string): string | null {
  const match = content.match(/Link:\s*\/mascotas-perdidas\/([a-zA-Z0-9-]+)/i);
  return match ? match[1] : null;
}

export async function sendMessage(req: Request, res: Response) {
  const senderId = req.authUser?.id;
  if (!senderId) return res.status(401).json({ error: "No autenticado" });

  const sender = await userRepo().findOneBy({ id: Number(senderId) });
  if (!sender)
    return res.status(401).json({ error: "El usuario remitente no existe" });

  const { receiverId, content } = req.body;
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!receiverId || (!content && !file))
    return res.status(400).json({ error: "Faltan datos" });

  const receiver = await userRepo().findOneBy({ id: Number(receiverId) });
  if (!receiver)
    return res.status(404).json({ error: "Destinatario no encontrado" });

  try {
    let photoUrl = null;
    if (file) {
      const bucket = process.env.MINIO_MESSAGE_FILES_BUCKET ?? "message-files";
      photoUrl = await uploadFileToMinio(
        bucket,
        `msg-${sender.id}-${Date.now()}`,
        file.originalname,
        file.buffer,
        file.mimetype,
      );
    }

    const msg = messageRepo().create({
      senderId: sender.id,
      receiverId: receiver.id,
      content: content || "",
      photo: photoUrl,
      read: false,
    });

    await messageRepo().save(msg);

    await recordActivity({
      type: "mensaje",
      title: `Nuevo mensaje de ${sender.name}`,
      actorUserId: sender.id,
      refType: "message",
      refId: msg.id,
      link: `/admin/mensajes?user=${sender.id}`,
    });

    // Notificar al receptor del mensaje nuevo (link según su rol).
    const receiverIsAdmin = receiver.roleId === CatalogIds.userRole.admin;
    await notify(receiver.id, {
      type: "message",
      title: `Nuevo mensaje de ${sender.name}`,
      body: typeof content === "string" ? content.slice(0, 140) : undefined,
      link: receiverIsAdmin
        ? `/admin/mensajes?user=${sender.id}`
        : `/account?tab=messages&user=${sender.id}`,
    });

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

  await notificationRepo()
    .createQueryBuilder()
    .update()
    .set({ read: true })
    .where("userId = :uid", { uid: userId })
    .andWhere("read = false")
    .andWhere("link LIKE :pat", { pat: `%user=${otherUserId}` })
    .execute();

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

      // Detectar si la conversación inició con un reclamo de mascota
      // Buscamos en el primer mensaje (el más viejo) si contiene el formato de reclamo
      const firstMsg = messages.length > 0 ? messages[0] : null;
      const claimPetId = firstMsg?.content
        ? extractClaimPetId(firstMsg.content)
        : null;

      // ¿La mascota reclamada ya fue devuelta al dueño? (para que el chat deje
      // de ofrecer "Confirmar devolución" y muestre el estado).
      let claimPetReturned = false;
      if (claimPetId) {
        const claimedPet = await petRepo().findOneBy({ id: claimPetId });
        claimPetReturned =
          claimedPet?.statusId === CatalogIds.petStatus.devueltaAlDueno;
      }

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
          adoptionId: ctx?.adoptionId ?? null,
          phone: ctx?.phone ?? null,
          town: ctx?.town ?? null,
          claimPetId, // 👈 ID de la mascota reclamada
          claimPetReturned, // 👈 true si ya se confirmó la devolución
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

  // Solo el emisor, el receptor o un admin pueden borrar el mensaje.
  const user = await userRepo().findOneBy({ id: userId });
  const isAdmin = user?.roleId === CatalogIds.userRole.admin;
  if (msg.senderId !== userId && msg.receiverId !== userId && !isAdmin) {
    return res
      .status(403)
      .json({ error: "No tenés permiso para borrar este mensaje" });
  }

  try {
    await messageRepo().remove(msg);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res
      .status(500)
      .json({ error: "Error interno del servidor al eliminar el mensaje" });
  }
}

export async function getInbox(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  // Obtener los ids de usuarios con los que he intercambiado mensajes, junto con
  // el último mensaje de cada conversación y el conteo no leídos.
  const raw = await messageRepo()
    .createQueryBuilder("msg")
    .select(
      "CASE WHEN msg.senderId = :userId THEN msg.receiverId ELSE msg.senderId END",
      "otherUserId",
    )
    .addSelect("MAX(msg.id)", "latestId")
    .addSelect(
      `SUM(CASE WHEN msg.receiverId = :userId AND msg.read = false THEN 1 ELSE 0 END)`,
      "unread",
    )
    .where("(msg.senderId = :userId OR msg.receiverId = :userId)", { userId })
    .groupBy(
      `CASE WHEN msg.senderId = :userId THEN msg.receiverId ELSE msg.senderId END`,
    )
    .orderBy("MAX(msg.id)", "DESC")
    .getRawMany<{ otherUserId: number; latestId: number; unread: number }>();

  const otherIds = raw.map((r) => r.otherUserId);

  if (otherIds.length === 0) {
    return res.json({ totalUnread: 0, conversations: [] });
  }

  const users = await userRepo().findBy({ id: In(otherIds) });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Traer el último mensaje de cada conversación
  const latestMessageIds = raw.map((r) => r.latestId);
  const latestMessages = await messageRepo().findBy({
    id: In(latestMessageIds),
  });
  const latestMap = new Map(latestMessages.map((m) => [m.id, m]));

  // Contexto para cada conversación (para mostrar en la bandeja).
  const contexts = await buildUserContexts(otherIds);

  const conversations = raw
    .map((r) => {
      const u = userMap.get(r.otherUserId);
      if (!u) return null;
      const latest = latestMap.get(r.latestId);
      if (!latest) return null;
      return {
        user: {
          id: u.id,
          name: u.name,
          photo: u.photo,
          email: u.email,
          role: u.roleId === CatalogIds.userRole.admin ? "admin" : "user",
          context: contexts.get(u.id)?.context ?? null,
        },
        latestMessage: latest,
        unread: Number(r.unread),
      };
    })
    .filter(Boolean);

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c?.unread ?? 0),
    0,
  );

  res.json({ totalUnread, conversations });
}

export async function getAdminConversations(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  // El admin ve todos los usuarios con los que algún admin haya conversado, más
  // todos los usuarios registrados. Paginamos.

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const otherUserExpr =
    "CASE WHEN msg.senderId = :userId THEN msg.receiverId ELSE msg.senderId END";
  let raw: Array<{
    otherUserId: number;
    latestId: number;
    unread: number;
    totalMessages: number;
  }>;
  try {
    raw = await messageRepo()
      .createQueryBuilder("msg")
      .select(otherUserExpr, "otherUserId")
      .addSelect("MAX(msg.id)", "latestId")
      .addSelect(
        `SUM(CASE WHEN msg.receiverId = :userId AND msg.read = false THEN 1 ELSE 0 END)`,
        "unread",
      )
      .addSelect("COUNT(msg.id)", "totalMessages")
      .where("(msg.senderId = :userId OR msg.receiverId = :userId)", { userId })
      .groupBy(otherUserExpr)
      .orderBy("MAX(msg.id)", "DESC")
      .getRawMany();
  } catch (error) {
    console.error("Error en getAdminConversations:", error);
    return res
      .status(500)
      .json({ error: "Error al cargar las conversaciones." });
  }

  /* Una vez que el admin tiene una conversación con un usuario, el admin puede
   * ver ese usuario en la bandeja aunque el usuario nunca haya respondido.
   * Para que la UX no sea confusa, volvemos a la lógica anterior: la bandeja
   * incluye a los usuarios con los que el admin ha conversado.
   * Si en el futuro queremos mostrar también usuarios sin conversación previa,
   * deberíamos unir con usuarios registrados y filtrar por rol user.
   */

  const otherIds = raw.map((r) => r.otherUserId);

  if (otherIds.length === 0) {
    return res.json({ page, limit, total: 0, conversations: [] });
  }

  const users = await userRepo().findBy({ id: In(otherIds) });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Traer el último mensaje de cada conversación
  const latestMessageIds = raw.map((r) => r.latestId);
  const latestMessages = await messageRepo().findBy({
    id: In(latestMessageIds),
  });
  const latestMap = new Map(latestMessages.map((m) => [m.id, m]));

  // Contexto para cada conversación
  const contexts = await buildUserContexts(otherIds);

  const all = raw
    .map((r) => {
      const u = userMap.get(r.otherUserId);
      if (!u) return null;
      const latest = latestMap.get(r.latestId);
      if (!latest) return null;
      return {
        user: {
          id: u.id,
          name: u.name,
          photo: u.photo,
          email: u.email,
          role: u.roleId === CatalogIds.userRole.admin ? "admin" : "user",
          context: contexts.get(u.id)?.context ?? null,
        },
        latestMessage: latest,
        totalMessages: Number(r.totalMessages),
        unread: Number(r.unread),
      };
    })
    .filter(Boolean);

  // Ordenar por latestMessage.createdAt descendente
  all.sort(
    (a, b) =>
      new Date(b!.latestMessage.createdAt).getTime() -
      new Date(a!.latestMessage.createdAt).getTime(),
  );

  const total = all.length;
  const conversations = all.slice(skip, skip + limit);

  res.json({ page, limit, total, conversations });
}
