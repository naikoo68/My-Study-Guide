import Message from "../models/Message.js";

// POST /api/messages  (public) — visitor submits the contact form
export async function createMessage(req, res) {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ message: "Name, email and message are required" });
  }
  await Message.create({ name, email, subject, message });
  res.status(201).json({ message: "Thanks! Your message has been received." });
}

// GET /api/messages  (admin) — inbox, newest first
export async function listMessages(req, res) {
  const messages = await Message.find().sort("-createdAt").limit(500).lean();
  const unread = await Message.countDocuments({ read: false });
  res.json({ messages, unread });
}

// GET /api/messages/unread-count  (admin) — for the sidebar badge
export async function unreadCount(req, res) {
  const unread = await Message.countDocuments({ read: false });
  res.json({ unread });
}

// PATCH /api/messages/:id/read  (admin) — toggle read/unread
export async function toggleRead(req, res) {
  const msg = await Message.findById(req.params.id);
  if (!msg) return res.status(404).json({ message: "Message not found" });
  msg.read = req.body.read ?? !msg.read;
  await msg.save();
  res.json({ id: msg._id, read: msg.read });
}

// DELETE /api/messages/:id  (admin)
export async function deleteMessage(req, res) {
  await Message.findByIdAndDelete(req.params.id);
  res.json({ message: "Message deleted" });
}
