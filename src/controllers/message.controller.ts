import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Message } from "../entity/Message.js";
import { User } from "../entity/User.js";
import { CatalogIds, catalogItemForId } from "../lib/catalog-constants.js";
import { publicUser } from "./user.controller.js";

function messageRepo() {
  return AppDataSource.getRepository(Message);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

export async function sendMessage(req: Request, res: Response) {
  const senderId = req.authUser?.id;
  if (!senderId) return res.status(401).json({ error: "No autenticado" });

  const sender = await userRepo().findOneBy({ id: Number(senderId) });
  if (!sender) return res.status(401).json({ error: "El usuario remitente no existe" });

  const { receiverId, content } = req.body;
  if (!receiverId || !content) return res.status(400).json({ error: "Faltan datos" });

  const receiver = await userRepo().findOneBy({ id: Number(receiverId) });
  if (!receiver) return res.status(404).json({ error: "Destinatario no encontrado" });

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
    res.status(500).json({ error: "Error interno del servidor al enviar el mensaje" });
  }
}

export async function getConversation(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const otherUserId = Number(req.params.userId);
  if (!otherUserId) return res.status(400).json({ error: "Usuario invalido" });

  const messages = await messageRepo()
    .createQueryBuilder("msg")
    .where("(msg.senderId = :userId AND msg.receiverId = :otherUserId) OR (msg.senderId = :otherUserId AND msg.receiverId = :userId)", { userId, otherUserId })
    .orderBy("msg.createdAt", "ASC")
    .getMany();

  // Marcar como leidos los mensajes que el usuario actual recibe
  const unreadMessages = messages.filter(m => m.receiverId === userId && !m.read);
  if (unreadMessages.length > 0) {
    await messageRepo().update(unreadMessages.map(m => m.id), { read: true });
    unreadMessages.forEach(m => m.read = true);
  }

  const currentUser = await userRepo().findOneBy({ id: userId });
  const otherUser = await userRepo().findOneBy({ id: otherUserId });

  if (currentUser && otherUser) {
    const isAdminToAdmin = currentUser.roleId === CatalogIds.userRole.admin && otherUser.roleId === CatalogIds.userRole.admin;
    const isMixed = (currentUser.roleId === CatalogIds.userRole.admin && otherUser.roleId === CatalogIds.userRole.user) ||
                    (currentUser.roleId === CatalogIds.userRole.user && otherUser.roleId === CatalogIds.userRole.admin);

    if (isAdminToAdmin) {
      return res.json({ messages });
    }

    if (isMixed) {
      const userProfile = currentUser.roleId === CatalogIds.userRole.admin ? otherUser : currentUser;
      const statusLabel = catalogItemForId(userProfile.statusId)?.label ?? "Desconocido";
      return res.json({
        messages,
        profile: {
          id: userProfile.id,
          name: userProfile.name,
          email: userProfile.email,
          photo: userProfile.photo,
          status: statusLabel,
          evaluationNote: userProfile.evaluationNote
        }
      });
    }
  }

  res.json({ messages });
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
  
  const userMap = new Map(users.map(u => [u.id, publicUser(u)]));

  const inbox = Array.from(userIds).map(otherId => {
    return {
      user: userMap.get(otherId),
      latestMessage: latestMessageMap.get(otherId),
      unread: messages.filter(m => m.receiverId === userId && m.senderId === otherId && !m.read).length
    };
  });

  res.json({
    totalUnread: unreadCount,
    conversations: inbox
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
    .groupBy("LEAST(msg.senderId, msg.receiverId), GREATEST(msg.senderId, msg.receiverId)");

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
      .select("COUNT(DISTINCT LEAST(msg.senderId, msg.receiverId) || '-' || GREATEST(msg.senderId, msg.receiverId))", "count")
      .where("msg.senderId = :userId OR msg.receiverId = :userId", { userId })
      .getRawOne()
  ]);

  const total = parseInt(totalConversations.count || "0");

  const otherUserIds = latestMessages.map(m => m.senderId === userId ? m.receiverId : m.senderId);
  const users = otherUserIds.length > 0 ? await userRepo().findBy({ id: In(otherUserIds) }) : [];
  const userMap = new Map(users.map(u => [u.id, publicUser(u)]));

  const conversations = await Promise.all(latestMessages.map(async m => {
    const otherId = m.senderId === userId ? m.receiverId : m.senderId;
    const count = await messageRepo()
      .createQueryBuilder("msg")
      .where("(msg.senderId = :userId AND msg.receiverId = :otherId) OR (msg.senderId = :otherId AND msg.receiverId = :userId)", { userId, otherId })
      .getCount();
      
    const unreadCount = await messageRepo()
      .createQueryBuilder("msg")
      .where("msg.senderId = :otherId AND msg.receiverId = :userId AND msg.read = false", { userId, otherId })
      .getCount();

    return {
      user: userMap.get(otherId),
      latestMessage: m,
      totalMessages: count,
      unread: unreadCount
    };
  }));

  res.json({
    page,
    limit,
    total,
    conversations
  });
}
